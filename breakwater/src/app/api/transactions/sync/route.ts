// src/app/api/transactions/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log, logError } from "@/lib/log";

type Body = { item_id?: string };

export async function POST(req: Request) {
  log("transactions.sync.start");

  try {
    // 1. Authenticate via cookie session
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("transactions.sync.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const body = (await req.json().catch(() => ({}))) as Body;
    const itemId = body.item_id;

    if (!itemId) {
      log("transactions.sync.bad_request", { userId });
      return NextResponse.json({ error: "Missing item_id" }, { status: 400 });
    }

    // 2. Load access_token from DB via service-role client.
    //    Service role bypasses RLS so the token is always returned — never NULL due to policy gaps.
    const admin = supabaseAdmin();
    const { data: itemRow, error: itemErr } = await admin
      .from("plaid_items")
      .select("access_token, cursor")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle();

    if (itemErr) {
      logError("transactions.sync.item_query_error", itemErr);
      return NextResponse.json({ error: "Failed to query Plaid item" }, { status: 500 });
    }

    if (!itemRow?.access_token) {
      log("transactions.sync.no_token", { userId, itemId });
      return NextResponse.json(
        { error: "No Plaid access_token on file. Reconnect your bank." },
        { status: 422 }
      );
    }

    const access_token = itemRow.access_token;
    let cursor: string | null = itemRow.cursor ?? null;

    log("transactions.sync.plaid_start", { userId, itemId, tokenTail: access_token.slice(-6) });

    // 3. Cursor-based sync loop
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;
    let has_more = true;

    while (has_more) {
      const resp = await plaidClient.transactionsSync({
        access_token,
        cursor: cursor ?? undefined,
        count: 100,
      });

      const { added, modified, removed, next_cursor } = resp.data;

      const toUpsert = [...added, ...modified].map((t) => ({
        user_id: userId,
        item_id: itemId,
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        name: t.name,
        merchant_name: t.merchant_name ?? null,
        amount: t.amount,
        iso_currency_code: t.iso_currency_code ?? null,
        authorized_date: t.authorized_date ?? null,
        date: t.date,
        pending: t.pending,
        category: (t.category ?? null) as string[] | null,
        updated_at: new Date().toISOString(),
      }));

      if (toUpsert.length) {
        const { error: upErr } = await admin
          .from("plaid_transactions")
          .upsert(toUpsert, { onConflict: "transaction_id" });

        if (upErr) {
          logError("transactions.sync.db_error", upErr);
          return NextResponse.json({ error: "Failed to upsert transactions" }, { status: 500 });
        }
      }

      addedCount += added.length;
      modifiedCount += modified.length;
      removedCount += removed.length;

      cursor = next_cursor;
      has_more = resp.data.has_more;
    }

    // 4. Save new cursor
    const { error: cursorErr } = await admin
      .from("plaid_items")
      .update({ cursor, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("item_id", itemId);

    if (cursorErr) {
      logError("transactions.sync.cursor_save_error", cursorErr);
      return NextResponse.json({ error: "Failed to save cursor" }, { status: 500 });
    }

    log("transactions.sync.ok", { userId, itemId, added: addedCount, modified: modifiedCount, removed: removedCount });

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (e: unknown) {
    logError("transactions.sync.err", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
