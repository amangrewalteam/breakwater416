// src/app/api/subscriptions/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";
import { normalizeMerchant } from "@/lib/normalizeMerchant";

function toCents(amount: number) {
  return Math.round(Math.abs(amount) * 100);
}

// Transform a DB row → shape the dashboard + subscriptions pages expect.
function toUI(row: Record<string, unknown>) {
  const amountCents = Number(row.amount_cents ?? 0);
  const amount = amountCents / 100;
  const cadence: "monthly" | "yearly" =
    row.cadence === "yearly" ? "yearly" : "monthly";
  const annualCost = cadence === "yearly" ? amount : amount * 12;

  const conf = Number(row.confidence ?? 0);
  const confidence: "high" | "med" | "low" =
    conf >= 0.8 ? "high" : conf >= 0.5 ? "med" : "low";

  // DB "tracking" → UI "suggested"
  const rawStatus = String(row.status ?? "tracking");
  const status = rawStatus === "tracking" ? "suggested" : rawStatus;
  const needsReview = rawStatus === "needs_review";

  return {
    id: row.id as string,
    name: (row.display_name as string) || (row.merchant_norm as string) || "",
    normalized: (row.merchant_norm as string) || "",
    amount,
    cadence,
    annualCost,
    lastSeen: row.last_seen ?? null,
    status,
    category: (row.category as string) ?? null,
    confidence,
    needsReview,
    reason: row.reason
      ? Array.isArray(row.reason)
        ? row.reason
        : [row.reason]
      : [],
    updatedAt: row.updated_at as string,
  };
}

// ─── GET: list all subscriptions ────────────────────────────────────────────

export async function GET() {
  log("subscriptions.list.start");
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const { data: rows, error: dbErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (dbErr) {
      logError("subscriptions.list.db_err", dbErr, { userId });
      return NextResponse.json(
        { error: "Failed to load subscriptions" },
        { status: 500 }
      );
    }

    log("subscriptions.list.ok", { userId, count: rows?.length ?? 0 });
    return NextResponse.json((rows ?? []).map(toUI));
  } catch (e: any) {
    logError("subscriptions.list.err", e);
    return NextResponse.json(
      { error: "Failed to load subscriptions" },
      { status: 500 }
    );
  }
}

// ─── POST: detect subscriptions from transactions ───────────────────────────

export async function POST() {
  log("subscriptions.detect.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("subscriptions.detect.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const since = new Date();
    since.setDate(since.getDate() - 180);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: txns, error: txErr } = await supabase
      .from("plaid_transactions")
      .select(
        "transaction_id,merchant_name,name,amount,iso_currency_code,date,pending"
      )
      .eq("user_id", userId)
      .gte("date", sinceStr)
      .eq("pending", false);

    if (txErr) {
      log("subscriptions.detect.tx_fetch_error", { userId });
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    const rows = txns ?? [];
    type Tx = (typeof rows)[number];
    const groups = new Map<string, Tx[]>();

    for (const t of rows) {
      const label = t.merchant_name || t.name || "";
      const merchant_norm = normalizeMerchant(label);
      if (!merchant_norm) continue;
      const arr = groups.get(merchant_norm) ?? [];
      arr.push(t);
      groups.set(merchant_norm, arr);
    }

    let upserted = 0;

    for (const [merchant_norm, list] of groups.entries()) {
      if (list.length < 3) continue;

      list.sort((a, b) => (a.date < b.date ? -1 : 1));

      const amounts = list
        .map((t) => Math.abs(Number(t.amount)))
        .sort((a, b) => a - b);
      const mid = amounts[Math.floor(amounts.length / 2)];
      const amount_cents = toCents(mid);

      const close = list.filter((t) => {
        const v = Math.abs(Number(t.amount));
        return mid === 0 ? v === 0 : Math.abs(v - mid) / mid <= 0.05;
      });

      if (close.length < 3) continue;

      const first_seen = close[0].date;
      const last_seen = close[close.length - 1].date;
      const last_transaction_id = close[close.length - 1].transaction_id;
      const display_name =
        close.find((t) => t.merchant_name)?.merchant_name ||
        close[0].name ||
        merchant_norm;
      const currency = close[0].iso_currency_code || "CAD";
      const cadence = "monthly";
      const confidence = Math.min(0.95, 0.4 + close.length * 0.1);

      const up = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            merchant_norm,
            display_name,
            cadence,
            amount_cents,
            currency,
            confidence,
            first_seen,
            last_seen,
            last_transaction_id,
            status: "tracking",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,merchant_norm,cadence,amount_cents,currency" }
        )
        .select("id")
        .maybeSingle();

      if (up.error) {
        log("subscriptions.detect.upsert_error", { userId, merchant_norm });
        continue;
      }

      upserted += 1;
    }

    log("subscriptions.detect.ok", { userId, txns: rows.length, upserted });
    return NextResponse.json({ ok: true, txns: rows.length, upserted });
  } catch (e: any) {
    logError("subscriptions.detect.err", e);
    return NextResponse.json(
      { error: "Subscription detection failed" },
      { status: 500 }
    );
  }
}

// ─── PATCH: update a subscription ───────────────────────────────────────────

export async function PATCH(req: Request) {
  log("subscriptions.patch.start");
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const body = await req.json().catch(() => ({}));
    const { id, patch } = body as {
      id: string;
      patch: Record<string, unknown>;
    };

    if (!id || !patch) {
      return NextResponse.json(
        { error: "Missing id or patch" },
        { status: 400 }
      );
    }

    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof patch.status === "string") {
      const statusMap: Record<string, string> = {
        suggested: "tracking",
        confirmed: "confirmed",
        ignored: "ignored",
        needs_review: "needs_review",
      };
      dbPatch.status = statusMap[patch.status] ?? patch.status;
    }

    // needsReview: true without explicit status → needs_review
    if (patch.needsReview === true && typeof patch.status !== "string") {
      dbPatch.status = "needs_review";
    }

    if (typeof patch.category === "string") {
      dbPatch.category = patch.category;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("subscriptions")
      .update(dbPatch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (updateErr) {
      logError("subscriptions.patch.db_err", updateErr, { userId, id });
      return NextResponse.json(
        { error: "Failed to update subscription" },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    log("subscriptions.patch.ok", { userId, id });
    return NextResponse.json({ ok: true, subscription: toUI(updated) });
  } catch (e: any) {
    logError("subscriptions.patch.err", e);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
