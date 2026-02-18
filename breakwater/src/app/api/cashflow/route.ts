// src/app/api/cashflow/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSubscriptions } from "@/lib/subscriptionStore";

type CashflowPoint = {
  key: string;        // YYYY-MM
  label: string;      // "Jan"
  year: number;
  month: number;      // 1-12
  total: number;      // CAD
  byCategory: Record<string, number>;
};

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString("en-CA", { month: "short" });
}

function addMonths(date: Date, delta: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const monthsParam = url.searchParams.get("months");
    const months = Math.min(
      24,
      Math.max(3, Number(monthsParam || 6) || 6)
    );

    const subs = readSubscriptions().filter((s) => s.status === "confirmed");

    // Build last N months points (inclusive of current month)
    const now = new Date();
    const start = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -(months - 1));

    const points: CashflowPoint[] = [];
    for (let i = 0; i < months; i++) {
      const d = addMonths(start, i);
      points.push({
        key: monthKey(d),
        label: monthLabel(d),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        total: 0,
        byCategory: {},
      });
    }

    // Allocation model (MVP, stable):
    // - monthly cadence => full amount each month
    // - yearly cadence  => spread evenly across months (annual/12)
    for (const s of subs) {
      const category = s.category || "Other";

      const monthlyContribution =
        s.cadence === "monthly" ? s.amount : (s.annualCost || s.amount) / 12;

      for (const p of points) {
        p.total += monthlyContribution;
        p.byCategory[category] = (p.byCategory[category] || 0) + monthlyContribution;
      }
    }

    // Round to cents for clean UI
    for (const p of points) {
      p.total = Math.round(p.total * 100) / 100;
      for (const k of Object.keys(p.byCategory)) {
        p.byCategory[k] = Math.round(p.byCategory[k] * 100) / 100;
      }
    }

    const max = points.reduce((m, p) => Math.max(m, p.total), 0);

    return NextResponse.json({
      months,
      points,
      max,
      currency: "CAD",
      model: "confirmed_subscriptions_only; yearly_spread_evenly",
    });
  } catch (e: any) {
    console.error("cashflow GET error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to compute cashflow" },
      { status: 500 }
    );
  }
}
