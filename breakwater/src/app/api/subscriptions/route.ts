// src/app/api/subscriptions/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";
import { normalizeMerchant } from "@/lib/normalizeMerchant";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Confidence = "high" | "med" | "low";

function confidenceLabel(score: number | null | undefined): Confidence {
  if (!score || score < 0.5) return "low";
  if (score < 0.8) return "med";
  return "high";
}

function estimateNextRenewal(
  lastChargeDate: string | null | undefined,
  cadence: string
): string | null {
  if (!lastChargeDate) return null;
  const d = new Date(lastChargeDate);
  if (isNaN(d.getTime())) return null;
  if (cadence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (cadence === "annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/subscriptions
// Returns subscriptions for the authenticated user in dashboard-ready shape.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    const { data: rows, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "ignored")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
    }

    // Map DB rows → StoredSubscription shape expected by the dashboard
    const mapped = (rows ?? []).map((s: Record<string, unknown>) => {
      const amount = Number(s.amount ?? 0);
      const cadence = String(s.cadence ?? "monthly");
      const annualCost = cadence === "annual" ? amount : amount * 12;
      const score = s.confidence_score != null ? Number(s.confidence_score) : null;

      return {
        id: String(s.id),
        name: String(s.merchant_name ?? ""),
        normalized: String(s.normalized_merchant ?? ""),
        amount,
        cadence: cadence === "annual" ? "yearly" : "monthly",
        annualCost,
        lastSeen: s.last_charge_date ? String(s.last_charge_date) : undefined,
        status: String(s.status ?? "suggested") as "suggested" | "confirmed" | "ignored",
        category: s.category ? String(s.category) : undefined,
        confidence: confidenceLabel(score),
        needsReview: score !== null && score < 0.6,
        updatedAt: String(s.updated_at ?? ""),
      };
    });

    return NextResponse.json(mapped);
  } catch (e: unknown) {
    logError("subscriptions.get.err", e);
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/subscriptions
// Detect recurring subscriptions from the last 180 days of transactions
// and upsert them into the subscriptions table.
// ---------------------------------------------------------------------------

export async function POST() {
  log("subscriptions.detect.start");

  try {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr || !auth?.user) {
      log("subscriptions.detect.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    const since = new Date();
    since.setDate(since.getDate() - 180);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: txns, error: txErr } = await supabase
      .from("plaid_transactions")
      .select("transaction_id, merchant_name, name, amount, iso_currency_code, date, pending")
      .eq("user_id", userId)
      .gte("date", sinceStr)
      .eq("pending", false);

    if (txErr) {
      log("subscriptions.detect.tx_fetch_error", { userId });
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }

    const rows = txns ?? [];

    type Tx = (typeof rows)[number];
    const groups = new Map<string, Tx[]>();

    for (const t of rows) {
      const label = t.merchant_name || t.name || "";
      const key = normalizeMerchant(label);
      if (!key) continue;
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }

    let upserted = 0;

    for (const [normalized_merchant, list] of groups.entries()) {
      if (list.length < 3) continue;

      list.sort((a, b) => (a.date < b.date ? -1 : 1));

      const amounts = list.map((t) => Math.abs(Number(t.amount))).sort((a, b) => a - b);
      const mid = amounts[Math.floor(amounts.length / 2)];

      const close = list.filter((t) => {
        const v = Math.abs(Number(t.amount));
        return mid === 0 ? v === 0 : Math.abs(v - mid) / mid <= 0.05;
      });

      if (close.length < 3) continue;

      const last_charge_date = close[close.length - 1].date;
      const merchant_name =
        close.find((t) => t.merchant_name)?.merchant_name ||
        close[0].name ||
        normalized_merchant;

      const currency = close[0].iso_currency_code || "USD";
      const cadence = "monthly";
      const confidence_score = Math.min(0.95, 0.4 + close.length * 0.1);
      const next_estimated_renewal = estimateNextRenewal(last_charge_date, cadence);

      const { error: upsertErr } = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            merchant_name,
            normalized_merchant,
            amount: mid,
            currency,
            cadence,
            last_charge_date,
            next_estimated_renewal,
            confidence_score,
            status: "suggested",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,normalized_merchant,cadence" }
        );

      if (upsertErr) {
        log("subscriptions.detect.upsert_error", { userId, normalized_merchant });
        continue;
      }

      upserted += 1;
    }

    log("subscriptions.detect.ok", { userId, txns: rows.length, upserted });

    return NextResponse.json({ ok: true, txns: rows.length, upserted });
  } catch (e: unknown) {
    logError("subscriptions.detect.err", e);
    const msg = e instanceof Error ? e.message : "Detection failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/subscriptions
// Update a single subscription field (e.g. status).
// Body: { id: string, patch: Partial<subscription> }
// ---------------------------------------------------------------------------

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !body.patch || typeof body.patch !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { id, patch } = body as { id: string; patch: Record<string, unknown> };

    // Allowlist updatable fields — never let the client change user_id
    const allowed: Record<string, unknown> = {};
    const allowedKeys = ["status", "merchant_name", "cadence", "amount", "category", "next_estimated_renewal"];
    for (const key of allowedKeys) {
      if (key in patch) allowed[key] = patch[key];
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    allowed.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("subscriptions")
      .update(allowed)
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    logError("subscriptions.patch.err", e);
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
