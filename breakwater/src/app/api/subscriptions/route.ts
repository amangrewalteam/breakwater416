// src/app/api/subscriptions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { StoredSubscription } from "@/lib/subscriptionStore";
import { getSubscriptionRepo } from "@/lib/subscriptionRepo";

function toErr(e: any) {
  // Supabase errors often have: message, details, hint, code
  return {
    message: e?.message || String(e),
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    name: e?.name,
  };
}

export async function GET() {
  try {
    const repo = getSubscriptionRepo();
    const subs = await repo.list();
    return NextResponse.json(subs);
  } catch (e: any) {
    const err = toErr(e);
    console.error("subscriptions GET error:", err);
    return NextResponse.json(
      { error: "Failed to load subscriptions", debug: err },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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

    const repo = getSubscriptionRepo();
    const merged = await repo.upsertMany(incoming);

    return NextResponse.json({ subscriptions: merged });
  } catch (e: any) {
    const err = toErr(e);
    console.error("subscriptions POST error:", err);
    return NextResponse.json(
      { error: "Failed to sync subscriptions", debug: err },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;
    const patch = body?.patch;

    if (!id || typeof id !== "string" || !patch || typeof patch !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const repo = getSubscriptionRepo();
    const updated = await repo.update(id, patch);

    return NextResponse.json({ subscription: updated });
  } catch (e: any) {
    const err = toErr(e);
    console.error("subscriptions PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update subscription", debug: err },
      { status: 500 }
    );
  }
}
