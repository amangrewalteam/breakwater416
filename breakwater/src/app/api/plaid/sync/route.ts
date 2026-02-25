// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import type {
  TransactionsSyncRequest,
  TransactionsSyncResponse,
  Transaction,
  AccountBase,
} from "plaid";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
type RemovedTx = { transaction_id: string };

function jsonError(message: string, status = 400, extra?: JsonRecord) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function getNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Map Plaid transaction -> DB row
 * Adjust columns to match your schema if needed.
 */
function mapTransactionRow(userId: string, itemId: string, t: Transaction) {
  return {
    user_id: userId,
    item_id: itemId,
    transaction_id: t.transaction_id,

    account_id: t.account_id,
    name: t.name ?? null,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code ?? null,
    unofficial_currency_code: t.unofficial_currency_code ?? null,

    date: t.date,
    authorized_date: t.authorized_date ?? null,

    category_id: t.category_id ?? null,
    category: Array.isArray(t.category) ? t.category : null,

    pending: t.pending,
    transaction_type: t.transaction_type ?? null,
    payment_channel: t.payment_channel ?? null,

    updated_at: new Date().toISOString(),
  };
}

/**
 * Map Plaid account -> DB row
 * If you want balances, switch to importing `Account` (not AccountBase) and map balances.
 */
function mapAccountRow(userId: string, itemId: string, a: AccountBase) {
  return {
    user_id: userId,
    item_id: itemId,
    account_id: a.account_id,
    name: a.name ?? null,
    mask: a.mask ?? null,
    official_name: a.official_name ?? null,
    subtype: a.subtype ?? null,
    type: a.type ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * POST /api/plaid/sync
 * Body (optional):
 *   { full?: boolean, maxPages?: number }
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return jsonError("Auth error", 401, { detail: authErr.message });
  if (!user) return jsonError("Unauthorized", 401);

  let body: JsonRecord = {};
  try {
    const maybeJson = await req.json().catch(() => ({}));
    if (isRecord(maybeJson)) body = maybeJson;
  } catch {
    // ignore
  }

  const full = getBool(body.full, false);
  const maxPages = Math.max(1, Math.min(50, getNumber(body.maxPages, 25)));

  const { data: items, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("item_id, access_token, cursor")
    .eq("user_id", user.id);

  if (itemsErr) return jsonError("Failed to load Plaid items", 500, { detail: itemsErr.message });
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, items: 0, added: 0, modified: 0, removed: 0 });
  }

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const item of items) {
    const itemId = String(item.item_id);
    const accessToken = String(item.access_token);

    let cursor: string | undefined = full ? undefined : item.cursor ? String(item.cursor) : undefined;
    let hasMore = true;

    // NOTE: Some Plaid SDK typings omit `accounts` on TransactionsSyncResponse in certain versions.
    // We'll treat it as runtime-optional but keep TS-safe types here.
    let accounts: AccountBase[] = [];
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: RemovedTx[] = [];

    let page = 0;

    while (hasMore) {
      page += 1;
      if (page > maxPages) break; // safety valve

      const request: TransactionsSyncRequest = {
        access_token: accessToken,
        cursor,
        count: 500,
      };

      let resp: { data: TransactionsSyncResponse };
      try {
        resp = await plaidClient.transactionsSync(request);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Plaid transactionsSync failed";
        return jsonError("Plaid sync failed", 502, { detail: msg, item_id: itemId });
      }

      const data = resp.data;

      // --- Runtime-safe extraction (TS-safe) ---
      const runtimeAccounts = (data as unknown as { accounts?: AccountBase[] }).accounts;
      if (Array.isArray(runtimeAccounts)) accounts = runtimeAccounts;

      added.push(...(((data as unknown as { added?: Transaction[] }).added) ?? []));
      modified.push(...(((data as unknown as { modified?: Transaction[] }).modified) ?? []));
      removed.push(...(((data as unknown as { removed?: RemovedTx[] }).removed) ?? []));
      // ----------------------------------------

      cursor = data.next_cursor;
      hasMore = Boolean(data.has_more);
    }

    // Upsert accounts (optional)
    if (accounts.length > 0) {
      const accountRows = accounts.map((a) => mapAccountRow(user.id, itemId, a));
      const { error: acctUpsertErr } = await supabase
        .from("plaid_accounts")
        .upsert(accountRows, { onConflict: "account_id" });

      if (acctUpsertErr) {
        return jsonError("Failed to upsert accounts", 500, {
          detail: acctUpsertErr.message,
          item_id: itemId,
        });
      }
    }

    // Upsert transactions (added + modified)
    const txRows = [...added, ...modified].map((t) => mapTransactionRow(user.id, itemId, t));
    if (txRows.length > 0) {
      const { error: txUpsertErr } = await supabase
        .from("plaid_transactions")
        .upsert(txRows, { onConflict: "transaction_id" });

      if (txUpsertErr) {
        return jsonError("Failed to upsert transactions", 500, {
          detail: txUpsertErr.message,
          item_id: itemId,
        });
      }
    }

    // Delete removed transactions
    if (removed.length > 0) {
      const removedIds = removed
        .map((r) => r.transaction_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from("plaid_transactions")
          .delete()
          .in("transaction_id", removedIds)
          .eq("user_id", user.id);

        if (delErr) {
          return jsonError("Failed to delete removed transactions", 500, {
            detail: delErr.message,
            item_id: itemId,
          });
        }
      }
    }

    // Persist cursor
    const { error: cursorErr } = await supabase
      .from("plaid_items")
      .update({ cursor: cursor ?? null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("item_id", itemId);

    if (cursorErr) {
      return jsonError("Failed to update cursor", 500, {
        detail: cursorErr.message,
        item_id: itemId,
      });
    }

    totalAdded += added.length;
    totalModified += modified.length;
    totalRemoved += removed.length;
  }

  return NextResponse.json({
    ok: true,
    items: items.length,
    added: totalAdded,
    modified: totalModified,
    removed: totalRemoved,
  });
}