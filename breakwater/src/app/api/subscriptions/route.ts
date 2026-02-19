// src/app/api/subscriptions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { StoredSubscription } from "@/lib/subscriptionStore";

const TABLE = process.env.SUPABASE_SUBSCRIPTIONS_TABLE || "subscriptions";

function toRow(userId: string, s: StoredSubscription) {
  return {
    user_id: userId,
    id: s.id,
    name: s.name,
    normalized: s.normalized,
    amount: s.amount,
    cadence: s.cadence,
    annual_cost: s.annualCost,
    last_seen: s.lastSeen ? new Date(s.lastSeen).toISOString() : null,
    occurrences: typeof s.occurrences === "number" ? s.occurrences : null,
    status: s.status,
    category: s.category || null,
    confidence: s.confidence || null,
    needs_review: typeof s.needsReview === "boolean" ? s.needsReview : null,
    reason: s.reason ?? null,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: any): StoredSubscription {
  return {
    id: r.id,
    name: r.name,
    normalized: r.normalized,
    amount: Number(r.amount),
    cadence: r.cadence,
    annualCost: Number(r.annual_cost),
    lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : undefined,
    occurrences: typeof r.occurrences === "number" ? r.occurrences : undefined,
    status: r.status,
    category: r.category || undefined,
    confidence: r.confidence || undefined,
    needsReview: typeof r.needs_review === "boolean" ? r.needs_review : undefined,
    reason: r.reason ?? undefined,
    updatedAt: r.updated_at
      ? new Date(r.updated_at).toISOString()
      : new Date().toISOString(),
  };
}

function safeError(e: any) {
  return {
    message: e?.message || String(e),
    name: e?.name,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
  };
}

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = String(auth.user.id);

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("annual_cost", { ascending: false });

    if (error) throw error;

    return NextResponse.json((data || []).map(fromRow));
  } catch (e: any) {
    console.error("subscriptions GET error:", e?.message || e);
    return NextResponse.json(
      {
        error: "Failed to load subscriptions",
        debug: safeError(e),
        env: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          table: TABLE,
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = String(auth.user.id);

    const body = await req.json();
    const suggestions = body?.suggestions;

    if (!Array.isArray(suggestions)) {
      return NextResponse.json(
        { error: "Invalid payload: suggestions must be an array" },
        { status: 400 }
      );
    }

    const incoming: StoredSubscription[] = suggestions
      .filter((s: any) => s && typeof s.id === "string")
      .map((s: any) => s as StoredSubscription);

    const rows = incoming.map((s) => toRow(userId, s));

    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,id" });
    if (error) throw error;

    const { data, error: readErr } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("annual_cost", { ascending: false });

    if (readErr) throw readErr;

    return NextResponse.json({ subscriptions: (data || []).map(fromRow) });
  } catch (e: any) {
    console.error("subscriptions POST error:", e?.message || e);
    return NextResponse.json(
      {
        error: "Failed to sync subscriptions",
        debug: safeError(e),
        env: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          table: TABLE,
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = String(auth.user.id);

    const body = await req.json();
    const id = body?.id;
    const patch = body?.patch;

    if (!id || typeof id !== "string" || !patch || typeof patch !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const rowPatch: any = { ...patch, updated_at: new Date().toISOString() };

    if ("annualCost" in rowPatch) {
      rowPatch.annual_cost = rowPatch.annualCost;
      delete rowPatch.annualCost;
    }
    if ("lastSeen" in rowPatch) {
      rowPatch.last_seen = rowPatch.lastSeen ? new Date(rowPatch.lastSeen).toISOString() : null;
      delete rowPatch.lastSeen;
    }
    if ("needsReview" in rowPatch) {
      rowPatch.needs_review = rowPatch.needsReview;
      delete rowPatch.needsReview;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(rowPatch)
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ subscription: data ? fromRow(data) : null });
  } catch (e: any) {
    console.error("subscriptions PATCH error:", e?.message || e);
    return NextResponse.json(
      {
        error: "Failed to update subscription",
        debug: safeError(e),
        env: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          table: TABLE,
        },
      },
      { status: 500 }
    );
  }
}
