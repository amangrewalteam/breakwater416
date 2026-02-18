// src/app/api/subscriptions/route.ts
import { NextResponse } from "next/server";
import {
  readSubscriptions,
  upsertMany,
  updateSubscription,
  StoredSubscription,
} from "@/lib/subscriptionStore";

export async function GET() {
  return NextResponse.json(readSubscriptions());
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

    // Minimal validation
    const incoming: StoredSubscription[] = suggestions
      .filter((s: any) => s && typeof s.id === "string")
      .map((s: any) => s as StoredSubscription);

    const merged = upsertMany(incoming);
    return NextResponse.json({ subscriptions: merged });
  } catch (e: any) {
    console.error("subscriptions POST error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to sync subscriptions" },
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

    const updated = updateSubscription(id, patch);
    return NextResponse.json({ subscription: updated });
  } catch (e: any) {
    console.error("subscriptions PATCH error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
