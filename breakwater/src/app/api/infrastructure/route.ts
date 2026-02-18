// src/app/api/infrastructure/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const TABLE = process.env.SUPABASE_SUBSCRIPTIONS_TABLE || "subscriptions";

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
    const supabase = supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = String(auth.user.id);

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("status", "confirmed");

    if (error) throw error;

    const subs: Node[] = (data || []).map((r: any) => ({
      id: r.id,
      label: r.name,
      type: "merchant",
      category: r.category || "Other",
      annualCost: Number(r.annual_cost),
      cadence: r.cadence,
      amount: Number(r.amount),
      confidence: r.confidence || undefined,
      needsReview: typeof r.needs_review === "boolean" ? r.needs_review : undefined,
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
    });
  } catch (e: any) {
    console.error("infrastructure GET error:", e?.message || e);
    return NextResponse.json({ error: "Failed to build infrastructure map" }, { status: 500 });
  }
}
