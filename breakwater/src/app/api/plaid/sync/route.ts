// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

// Ensure this route always runs on Node (Plaid SDK expects Node APIs)
export const runtime = "nodejs";
// Avoid any caching surprises
export const dynamic = "force-dynamic";

type PlaidItemRow = Record<string, any> & {
  user_id?: string;
  item_id?: string;
  cursor?: string | null;
  institution_name?: string | null;
  access_token?: string | null;
  access_token_enc?: string | null;
  access_token_?: string | null; // sometimes present in UI
};

function getAccessToken(item: PlaidItemRow) {
  return (
    item.access_token_enc ??
    item.access_token_ ??
    item.access_token ??
    (item as any)["access_token_"] ??
    null
  );
}

/**
 * Update plaid_items cursor safely even if updated_at doesn't exist.
 */
async function safeUpdateCursor(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  itemId: string,
  nextCursor: string
) {
  // Try with updated_at first, then retry without it if schema doesn't have it.
  const withUpdatedAt = await supabase
    .from("plaid_items")
    .update({
      cursor: nextCursor,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_id", itemId);

  if (!withUpdatedAt.error) return;

  // Retry without updated_at (covers schema-cache + missing column scenarios)
  const withoutUpdatedAt = await supabase
    .from("plaid_items")
    .update({ cursor: nextCursor })
    .eq("user_id", userId)
    .eq("item_id", itemId);

  if (withoutUpdatedAt.error) {
    logError("plaid.sync.cursor_update_err", withoutUpdatedAt.error, {
      userId,
      itemId,
    });
  }
}

/**
 * Try upserting transactions into whatever table/schema exists.
 * We attempt multiple table names and multiple row "shapes" to match your DB.
 */
async function tryUpsertTransactions(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  rows: any[]
) {
  if (!rows.length) return { inserted: 0, table: null as string | null };

  const tables = ["transactions", "plaid_transactions"];

  // Different schemas across branches commonly differ on:
  // - amount vs amount_cents
  // - raw (jsonb) presence
  // - created_at/updated_at presence
  const shapes = [
    // Shape A: richer
    (r: any) => ({
      user_id: r.user_id,
      item_id: r.item_id,
      transaction_id: r.transaction_id,
      name: r.name,
      merchant_name: r.merchant_name,
      amount_cents: r.amount_cents,
      iso_currency_code: r.iso_currency_code,
      date: r.date,
      authorized_date: r.authorized_date,
      pending: r.pending,
      raw: r.raw,
      updated_at: r.updated_at,
    }),
    // Shape B: amount (not cents)
    (r: any) => ({
      user_id: r.user_id,
      item_id: r.item_id,
      transaction_id: r.transaction_id,
      name: r.name,
      merchant_name: r.merchant_name,
      amount: typeof r.amount_cents === "number" ? r.amount_cents / 100 : null,
      iso_currency_code: r.iso_currency_code,
      date: r.date,
      pending: r.pending,
      raw: r.raw,
    }),
    // Shape C: minimal
    (r: any) => ({
      user_id: r.user_id,
      item_id: r.item_id,
      transaction_id: r.transaction_id,
      name: r.name,
      amount: typeof r.amount_cents === "number" ? r.amount_cents / 100 : null,
      date: r.date,
      pending: r.pending,
    }),
  ];

  let lastErr: any = null;

  for (const table of tables) {
    for (const shape of shapes) {
      const shaped = rows.map(shape);

      const resp = await supabase.from(table).upsert(shaped, {
        onConflict: "user_id,transaction_id",
      });

      if (!resp.error) return { inserted: shaped.length, table };

      lastErr = resp.error;
    }
  }

  // If neither table exists / schema mismatch, don’t hard-fail sync.
  log("plaid.sync.tx_upsert.skipped", {
    reason: "no_matching_table_or_schema",
    error: lastErr?.message ?? String(lastErr),
  });

  return { inserted: 0, table: null as string | null };
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

    // IMPORTANT: select("*") avoids hard-failing if your schema differs
    // (e.g., updated_at missing, access_token_ weirdness, etc.)
    const itemsResp = await supabase
      .from("plaid_items")
      .select("*")
      .eq("user_id", userId);

    if (itemsResp.error) {
      logError("plaid.sync.load_items_err", itemsResp.error, { userId });

      // Return the actual DB error so you can see if it's RLS or schema/cache.
      return NextResponse.json(
        {
          error: "Failed to load plaid items",
          details: itemsResp.error.message,
        },
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
    let missingTokenCount = 0;

    for (const item of items) {
      const itemId = item.item_id;

      if (!itemId) continue;

      const accessToken = getAccessToken(item);

      if (!accessToken) {
        missingTokenCount += 1;
        log("plaid.sync.missing_access_token", {
          userId,
          itemId,
          keys: Object.keys(item),
          has_access_token: !!item.access_token,
          has_access_token_enc: !!item.access_token_enc,
          has_access_token_: !!item.access_token_,
        });
        continue;
      }

      const cursor = item.cursor ?? undefined;

      log("plaid.sync.item.start", { userId, itemId });

      const syncResp = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
      });

      const { added, modified, removed, next_cursor, has_more } = syncResp.data;

      totalAdded += added.length;
      totalModified += modified.length;
      totalRemoved += removed.length;

      await safeUpdateCursor(supabase, userId, itemId, next_cursor);

      const toRow = (t: any) => {
        const amountCents =
          typeof t.amount === "number" ? Math.round(t.amount * 100) : null;

        return {
          user_id: userId,
          item_id: itemId,
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
      };

      const firstRows = added.map(toRow);
      const firstUpsert = await tryUpsertTransactions(supabase, firstRows);
      totalInserted += firstUpsert.inserted;

      log("plaid.sync.item.ok", {
        userId,
        itemId,
        added: added.length,
        modified: modified.length,
        removed: removed.length,
        inserted: firstUpsert.inserted,
        inserted_table: firstUpsert.table,
        has_more,
      });

      // If more pages exist, loop a few times
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

        await safeUpdateCursor(supabase, userId, itemId, currentCursor);

        const moreRows = moreData.added.map(toRow);
        const moreUpsert = await tryUpsertTransactions(supabase, moreRows);
        totalInserted += moreUpsert.inserted;

        log("plaid.sync.item.page", {
          userId,
          itemId,
          page: safety + 1,
          added: moreData.added.length,
          modified: moreData.modified.length,
          removed: moreData.removed.length,
          inserted: moreUpsert.inserted,
          inserted_table: moreUpsert.table,
          has_more: more,
        });
      }
    }

    log("plaid.sync.ok", {
      userId,
      items: items.length,
      missingTokenCount,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      inserted: totalInserted,
    });

    return NextResponse.json({
      ok: true,
      userId,
      items: items.length,
      missingTokenCount,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      inserted: totalInserted,
    });
  } catch (e: any) {
    const plaid = e?.response?.data;
    console.error("PLAID sync error:", plaid || e);

    logError("plaid.sync.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_type: plaid?.error_type,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      {
        error: plaid?.error_message || e?.message || "Failed to sync Plaid",
        plaid_error_code: plaid?.error_code,
      },
      { status: 500 }
    );
  }
}