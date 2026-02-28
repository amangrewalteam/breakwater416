// src/app/api/transactions/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

type Body = { item_id?: string };

export async function POST(req: Request) {
  log("transactions.sync.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("transactions.sync.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!body.item_id) {
      log("transactions.sync.bad_request", { userId });
      return NextResponse.json({ error: "Missing item_id" }, { status: 400 });
    }

    const itemId = body.item_id;

    // Load stored access token + cursor from DB — never from files
    const { data: itemRow, error: itemErr } = await supabase
      .from("plaid_items")
      .select("access_token,cursor")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle();

    if (itemErr || !itemRow?.access_token) {
      log("transactions.sync.item_not_found", { userId, itemId });
      return NextResponse.json({ error: "Item not found or access token missing" }, { status: 404 });
    }

    const access_token = itemRow.access_token;
    let cursor: string | null = itemRow.cursor ?? null;

    // Cursor-based sync loop
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

      // Upsert added + modified into plaid_transactions
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
        category: (t.category ?? null) as any,
      }));

      if (toUpsert.length) {
        const up = await supabase
          .from("plaid_transactions")
          .upsert(toUpsert, { onConflict: "user_id,transaction_id" });

        if (up.error) {
          log("transactions.sync.db_error", { userId, itemId });
          return NextResponse.json(
            { error: "Failed to upsert transactions" },
            { status: 500 }
          );
        }
      }

      // Removed: optional (you can mark deleted later; for now we just count)
      addedCount += added.length;
      modifiedCount += modified.length;
      removedCount += removed.length;

      cursor = next_cursor;
      has_more = resp.data.has_more;
    }

    // Save new cursor
    const save = await supabase
      .from("plaid_items")
      .update({ cursor, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("item_id", itemId);

    if (save.error) {
      log("transactions.sync.cursor_save_error", { userId, itemId });
      return NextResponse.json(
        { error: "Failed to save cursor" },
        { status: 500 }
      );
    }

    log("transactions.sync.ok", {
      userId,
      itemId,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (e: any) {
    logError("transactions.sync.err", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
