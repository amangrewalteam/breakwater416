// src/app/api/subscriptions/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";
import { normalizeMerchant } from "@/lib/normalizeMerchant";

function toCents(amount: number) {
  // Plaid amount is typically positive for outflow; we keep magnitude
  return Math.round(Math.abs(amount) * 100);
}

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

    // Pull last 180 days of transactions
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

    // Very lightweight candidate builder:
    // group by merchant_norm, then look for >= 3 occurrences with similar amount (within 5%)
    type Tx = typeof rows[number];
    const groups = new Map<string, Tx[]>();

    for (const t of rows) {
      const label = t.merchant_name || t.name || "";
      const merchant_norm = normalizeMerchant(label);
      if (!merchant_norm) continue;

      const arr = groups.get(merchant_norm) ?? [];
      arr.push(t);
      groups.set(merchant_norm, arr);
    }

    let created = 0;
    let updated = 0;

    // Build candidates + upsert into subscriptions
    for (const [merchant_norm, list] of groups.entries()) {
      if (list.length < 3) continue;

      // Sort by date asc
      list.sort((a, b) => (a.date < b.date ? -1 : 1));

      // Pick a representative amount (median-ish)
      const amounts = list.map((t) => Math.abs(Number(t.amount))).sort((a, b) => a - b);
      const mid = amounts[Math.floor(amounts.length / 2)];
      const amount_cents = toCents(mid);

      // Count how many are “close” to mid
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

      const currency = close[0].iso_currency_code || "USD";

      // Placeholder cadence guess (Phase 2 will improve)
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

      // We can't reliably know created vs updated without extra logic; keep it simple:
      updated += 1;
    }

    log("subscriptions.detect.ok", {
      userId,
      txns: rows.length,
      upserted: updated,
    });

    return NextResponse.json({
      ok: true,
      txns: rows.length,
      upserted: updated,
      created,
      updated,
    });
  } catch (e: any) {
    logError("subscriptions.detect.err", e);
    return NextResponse.json(
      { error: "Subscription detection failed" },
      { status: 500 }
    );
  }
}
