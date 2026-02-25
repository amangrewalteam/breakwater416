// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import type {
  TransactionsSyncRequest,
  TransactionsSyncResponse,
  Transaction,
  AccountBase,
} from "plaid";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabaseServer";

// If you’re on Vercel / edge by default, keep this on Node for Plaid + server libs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

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

function mapTransactionRow(userId: string, itemId: string, t: Transaction) {
  return {
    user_id: userId,
    item_id: itemId,

    // Stable unique key from Plaid:
    transaction_id: t.transaction_id,

    // Useful fields:
    account_id: t.account_id,
    name: t.name ?? null,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code ?? null,
    unofficial_currency_code: t.unofficial_currency_code ?? null,

    // Dates (Plaid returns strings like "2024-01-31")
    date: t.date,
    authorized_date: t.authorized_date ?? null,

    // Categories (optional)
    category_id: t.category_id ?? null,
    category: Array.isArray(t.category) ? t.category : null,

    // Pending & type
    pending: t.pending,
    transaction_type: t.transaction_type ?? null,

    // For debugging / future-proofing (optional)
    payment_channel: t.payment_channel ?? null,

    // Timestamps
    updated_at: new Date().toISOString(),
  };
}

function mapAccountRow(userId: string, itemId: string, a: AccountBase) {
  // Note: AccountBase has balances? In Plaid SDK, "AccountBase" is the shared base.
  // If you need balances, switch to type "Account" from plaid.
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
 * Expected DB tables (you can rename, just update queries):
 * - plaid_items: { user_id, item_id, access_token, cursor }
 * - plaid_accounts: { user_id, item_id, account_id, name, ... }
 * - plaid_transactions: { user_id, item_id, transaction_id, ... }
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return jsonError("Auth error", 401, { detail: authErr.message });
  if (!user) return jsonError("Unauthorized", 401);

  // Optional body options:
  // {
  //   "full": boolean,         // if true, ignores stored cursors and re-syncs from scratch (cursor = undefined)
  //   "maxPages": number       // cap pagination loops (safety)
  // }
  let body: JsonRecord = {};
  try {
    const maybeJson = await req.json().catch(() => ({}));
    if (isRecord(maybeJson)) body = maybeJson;
  } catch {
    // ignore
  }

  const full = getBool(body.full, false);
  const maxPages = Math.max(1, Math.min(50, getNumber(body.maxPages, 25)));

  // Fetch all items for this user
  const { data: items, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("item_id, access_token, cursor")
    .eq("user_id", user.id);

  if (itemsErr) return jsonError("Failed to load Plaid items", 500, { detail: itemsErr.message });
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, items: 0 });
  }

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const item of items) {
    const itemId = String(item.item_id);
    const accessToken = String(item.access_token);

    let cursor: string | undefined = full ? undefined : (item.cursor ? String(item.cursor) : undefined);
    let hasMore = true;

    let accounts: TransactionsSyncResponse["accounts"] = [];
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: TransactionsSyncResponse["removed"] = [];

    let page = 0;

    while (hasMore) {
      page += 1;
      if (page > maxPages) {
        // Safety valve: avoid infinite loops in case of unexpected API behavior.
        break;
      }

      const request: TransactionsSyncRequest = {
        access_token: accessToken,
        cursor,
        count: 500,
      };

      let resp: { data: TransactionsSyncResponse };
      try {
        resp = await plaidClient.transactionsSync(request);
      } catch (e: unknown) {
        // Best-effort: if one item fails, continue with others.
        const msg =
          e instanceof Error ? e.message : "Plaid transactionsSync failed";
        // Optionally: you could mark item as errored in DB here.
        return jsonError("Plaid sync failed", 502, { detail: msg, item_id: itemId });
      }

      const data = resp.data;

      accounts = data.accounts ?? accounts;
      added.push(...(data.added ?? []));
      modified.push(...(data.modified ?? []));
      removed.push(...(data.removed ?? []));

      cursor = data.next_cursor;
      hasMore = Boolean(data.has_more);
    }

    // Upsert accounts (optional but usually helpful)
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

    // Upsert added + modified transactions
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

    // Persist cursor for this item (unless full=true but we still want the latest cursor)
    const { error: cursorErr } = await supabase
      .from("plaid_items")
      .update({ cursor: cursor ?? null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("item_id", itemId);

    if (cursorErr) {
      return jsonError("Failed to update cursor", 500, { detail: cursorErr.message, item_id: itemId });
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