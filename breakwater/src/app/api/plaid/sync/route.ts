// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export async function POST() {
  log("plaid.sync.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    // Load all plaid items for this user
    const { data: items, error: itemsErr } = await supabase
      .from("plaid_items")
      .select("item_id,access_token_enc,cursor")
      .eq("user_id", userId);

    if (itemsErr) {
      logError("plaid.sync.items_err", itemsErr, { userId });
      return NextResponse.json({ error: "Failed to load plaid items" }, { status: 500 });
    }

    if (!items || items.length === 0) {
      log("plaid.sync.no_items", { userId });
      return NextResponse.json({ ok: true, synced: 0, added: 0, modified: 0, removed: 0 });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const item of items) {
      const { item_id: itemId, access_token_enc, cursor: savedCursor } = item;
      let cursor: string | null = savedCursor ?? null;
      let has_more = true;

      while (has_more) {
        const resp = await plaidClient.transactionsSync({
          access_token: access_token_enc, // Phase 3.2 will decrypt
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
          category: (t.category ?? null) as unknown as string[],
        }));

        if (toUpsert.length) {
          const { error: upsertErr } = await supabase
            .from("plaid_transactions")
            .upsert(toUpsert, { onConflict: "user_id,transaction_id" });

          if (upsertErr) {
            logError("plaid.sync.upsert_err", upsertErr, { userId, itemId });
            // Continue to next item rather than aborting the entire sync
            break;
          }
        }

        totalAdded += added.length;
        totalModified += modified.length;
        totalRemoved += removed.length;

        cursor = next_cursor;
        has_more = resp.data.has_more;
      }

      // Persist updated cursor
      await supabase
        .from("plaid_items")
        .update({ cursor, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("item_id", itemId);
    }

    log("plaid.sync.ok", {
      userId,
      synced: items.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });

    return NextResponse.json({
      ok: true,
      synced: items.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });
  } catch (e: any) {
    logError("plaid.sync.err", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
