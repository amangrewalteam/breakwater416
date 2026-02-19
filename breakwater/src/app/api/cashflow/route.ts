import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const months = Math.max(1, Math.min(24, Number(searchParams.get("months") || 6)));

    // ✅ IMPORTANT: supabaseServer() is async
    const supabase = await supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = String(auth.user.id);

    // Load subscriptions for this user (expects your /api/subscriptions store is keyed by user)
    // If your table name differs, update it here.
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "ignored");

    if (error) throw error;

    const confirmed = (subs || []).filter((s: any) => s.status === "confirmed");

    // Build month buckets
    const now = new Date();
    const points: any[] = [];
    const byKey: Record<string, any> = {};

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = monthKey(d);
      byKey[key] = {
        key,
        label: monthLabel(d),
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        total: 0,
        byCategory: {},
      };
      points.push(byKey[key]);
    }

    // Model: monthly = full amount each month; yearly spread evenly across 12 months.
    for (const s of confirmed) {
      const amount = Number(s.amount || 0);
      const cadence = String(s.cadence || "monthly");
      const category = s.category ? String(s.category) : "Uncategorized";

      const monthlyEquivalent = cadence === "yearly" ? amount / 12 : amount;

      for (const p of points) {
        p.total += monthlyEquivalent;
        p.byCategory[category] = (p.byCategory[category] || 0) + monthlyEquivalent;
      }
    }

    const max = points.reduce((m, p) => Math.max(m, p.total), 0);

    return NextResponse.json({
      months,
      points,
      max,
      currency: "CAD",
      model: "yearly_spread_evenly",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to compute cashflow" },
      { status: 500 }
    );
  }
}
