// src/app/api/infrastructure/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSubscriptionRepo } from "@/lib/subscriptionRepo";

type Node = {
  id: string;
  label: string;
  type: "merchant";
  category?: string;
  annualCost?: number;
  cadence?: "monthly" | "yearly";
  amount?: number;
  confidence?: "high" | "med" | "low";
  needsReview?: boolean;
};

type Cluster = {
  category: string;
  totalAnnual: number;
  count: number;
  merchants: Node[];
};

export async function GET() {
  try {
    const repo = getSubscriptionRepo();
    const subs = (await repo.list())
      .filter((s) => s.status === "confirmed")
      .map((s) => ({
        id: s.id,
        label: s.name,
        type: "merchant" as const,
        category: s.category || "Other",
        annualCost: s.annualCost,
        cadence: s.cadence,
        amount: s.amount,
        confidence: s.confidence,
        needsReview: s.needsReview,
      }));

    const byCategory = new Map<string, Cluster>();

    for (const m of subs) {
      const cat = m.category || "Other";
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { category: cat, totalAnnual: 0, count: 0, merchants: [] });
      }
      const c = byCategory.get(cat)!;
      c.totalAnnual += m.annualCost || 0;
      c.count += 1;
      c.merchants.push(m);
    }

    const clusters = Array.from(byCategory.values())
      .map((c) => ({
        ...c,
        totalAnnual: Math.round(c.totalAnnual * 100) / 100,
        merchants: c.merchants.sort((a, b) => (b.annualCost || 0) - (a.annualCost || 0)),
      }))
      .sort((a, b) => b.totalAnnual - a.totalAnnual);

    const totalAnnual = clusters.reduce((sum, c) => sum + c.totalAnnual, 0);

    return NextResponse.json({
      totalAnnual: Math.round(totalAnnual * 100) / 100,
      clusters,
      model: "confirmed_subscriptions_only; category_clusters_v1",
      storage: (process.env.STORAGE_DRIVER || "file").toLowerCase(),
    });
  } catch (e: any) {
    console.error("infrastructure GET error:", e?.message || e);
    return NextResponse.json({ error: "Failed to build infrastructure map" }, { status: 500 });
  }
}
