// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

type PlaidItemRow = {
  id?: string;
  user_id: string;
  item_id: string;
  // Your schema may have one or more of these:
  access_token?: string | null;
  access_token_enc?: string | null;
  access_token_?: string | null; // (seen as "access_token_" in Supabase UI)
  cursor?: string | null;
  institution_name?: string | null;
  updated_at?: string | null;
};

function getAccessToken(item: PlaidItemRow) {
  return (
    item.access_token_enc ??
    // some schemas ended up with a truncated/odd column name in UI
    (item as any).access_token_ ??
    item.access_token ??
    null
  );
}

async function tryUpsertTransactions(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  rows: any[]
) {
  if (!rows.length) return { inserted: 0, table: null as string | null };

  // Try common table names (keep this flexible so we don’t brick the sync).
  const candidates = ["transactions", "plaid_transactions"];

  let lastErr: any = null;
  for (const table of candidates) {
    const resp = await supabase.from(table).upsert(rows, {
      onConflict: "user_id,transaction_id",
    });

    if (!resp.error) return { inserted: rows.length, table };
    lastErr = resp.error;
  }

  // If neither table exists / schema mismatch, don’t hard-fail sync.
  log("plaid.sync.tx_upsert.skipped", {
    reason: "no_matching_table_or_schema",
    error: lastErr?.message ?? String(lastErr),
  });
  return { inserted: 0, table: null };
}

export async function POST() {
  log("plaid.sync.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.sync.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    // Load Plaid items for this user
    const itemsResp = await supabase
      .from("plaid_items")
      .select(
        "id,user_id,item_id,access_token,access_token_enc,access_token_,cursor,institution_name,updated_at"
      )
      .eq("user_id", userId);

    if (itemsResp.error) {
      logError("plaid.sync.load_items_err", itemsResp.error);
      return NextResponse.json(
        { error: "Failed to load plaid items" },
        { status: 500 }
      );
    }

    const items = (itemsResp.data ?? []) as PlaidItemRow[];

    if (!items.length) {
      log("plaid.sync.no_items", { userId });
      return NextResponse.json({
        ok: true,
        userId,
        items: 0,
        added: 0,
        modified: 0,
        removed: 0,
        inserted: 0,
        message: "No Plaid items connected yet.",
      });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;
    let totalInserted = 0;

    for (const item of items) {
      const accessToken = getAccessToken(item);

      if (!accessToken) {
        // This is the exact issue you’re seeing: token exists in a different column.
        log("plaid.sync.missing_access_token", {
          userId,
          itemId: item.item_id,
          has_access_token: !!item.access_token,
          has_access_token_enc: !!item.access_token_enc,
          has_access_token_: !!(item as any).access_token_,
        });
        continue;
      }

      const cursor = item.cursor ?? undefined;

      log("plaid.sync.item.start", { userId, itemId: item.item_id });

      const syncResp = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
        // keep light; you can raise later
        count: 500,
      });

      const { added, modified, removed, next_cursor, has_more } = syncResp.data;

      totalAdded += added.length;
      totalModified += modified.length;
      totalRemoved += removed.length;

      // Persist cursor back to plaid_items
      const cursorUpdate = await supabase
        .from("plaid_items")
        .update({
          cursor: next_cursor,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("item_id", item.item_id);

      if (cursorUpdate.error) {
        logError("plaid.sync.cursor_update_err", cursorUpdate.error, {
          userId,
          itemId: item.item_id,
        });
        // don’t fail the whole sync for one cursor update
      }

      // Prepare transaction rows for DB (best-effort)
      const txRows = added.map((t: any) => {
        const amountCents =
          typeof t.amount === "number" ? Math.round(t.amount * 100) : null;

        return {
          user_id: userId,
          item_id: item.item_id,
          transaction_id: t.transaction_id,
          name: t.name ?? null,
          merchant_name: t.merchant_name ?? null,
          amount_cents: amountCents,
          iso_currency_code: t.iso_currency_code ?? null,
          date: t.date ?? null,
          authorized_date: t.authorized_date ?? null,
          pending: !!t.pending,
          // keep raw for now; you can normalize later
          raw: t,
          updated_at: new Date().toISOString(),
        };
      });

      const upsertResult = await tryUpsertTransactions(supabase, txRows);
      totalInserted += upsertResult.inserted;

      log("plaid.sync.item.ok", {
        userId,
        itemId: item.item_id,
        added: added.length,
        modified: modified.length,
        removed: removed.length,
        inserted: upsertResult.inserted,
        inserted_table: upsertResult.table,
        has_more,
      });

      // If Plaid says more pages exist, loop once more (lightweight),
      // or just let next manual sync pick it up. We’ll do a small loop.
      let safety = 0;
      let currentCursor = next_cursor;
      let more = has_more;

      while (more && safety < 5) {
        safety += 1;

        const moreResp = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: currentCursor,
          count: 500,
        });

        const moreData = moreResp.data;
        currentCursor = moreData.next_cursor;
        more = moreData.has_more;

        totalAdded += moreData.added.length;
        totalModified += moreData.modified.length;
        totalRemoved += moreData.removed.length;

        const moreRows = moreData.added.map((t: any) => {
          const amountCents =
            typeof t.amount === "number" ? Math.round(t.amount * 100) : null;

          return {
            user_id: userId,
            item_id: item.item_id,
            transaction_id: t.transaction_id,
            name: t.name ?? null,
            merchant_name: t.merchant_name ?? null,
            amount_cents: amountCents,
            iso_currency_code: t.iso_currency_code ?? null,
            date: t.date ?? null,
            authorized_date: t.authorized_date ?? null,
            pending: !!t.pending,
            raw: t,
            updated_at: new Date().toISOString(),
          };
        });

        const moreUpsert = await tryUpsertTransactions(supabase, moreRows);
        totalInserted += moreUpsert.inserted;

        // persist cursor each loop
        await supabase
          .from("plaid_items")
          .update({
            cursor: currentCursor,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("item_id", item.item_id);

        log("plaid.sync.item.page", {
          userId,
          itemId: item.item_id,
          page: safety + 1,
          added: moreData.added.length,
          modified: moreData.modified.length,
          removed: moreData.removed.length,
          inserted: moreUpsert.inserted,
          has_more: more,
        });
      }
    }

    log("plaid.sync.ok", {
      userId,
      items: items.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      inserted: totalInserted,
    });

    return NextResponse.json({
      ok: true,
      userId,
      items: items.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      inserted: totalInserted,
    });
  } catch (e: any) {
    // If Plaid errors, surface their error_code/message in logs
    const plaid = e?.response?.data;
    console.error("PLAID sync error:", plaid || e);

    logError("plaid.sync.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_type: plaid?.error_type,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      { error: plaid?.error_message || e?.message || "Failed to sync Plaid" },
      { status: 500 }
    );
  }
}