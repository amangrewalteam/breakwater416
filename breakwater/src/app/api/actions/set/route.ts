// src/app/api/actions/set/route.ts
// Prepares an action for a subscription. State machine: prepared → confirmed → completed.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ActionType = "cancel" | "downgrade" | "reminder" | "other";
type ActionStatus = "prepared" | "confirmed" | "completed";

type Body = {
  subscription_id?: string;
  insight_id?: string;
  type?: ActionType;
  status?: ActionStatus;
  payload?: Record<string, unknown>;
};

const VALID_TYPES = new Set<string>(["cancel", "downgrade", "reminder", "other"]);
const VALID_STATUSES = new Set<string>(["prepared", "confirmed", "completed"]);

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json(
      { error: "Missing or invalid action type (cancel | downgrade | reminder | other)" },
      { status: 400 }
    );
  }

  const status: ActionStatus =
    body.status && VALID_STATUSES.has(body.status) ? body.status : "prepared";

  // If subscription_id provided, verify it belongs to this user
  if (body.subscription_id) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", body.subscription_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("actions")
    .insert({
      user_id: user.id,
      subscription_id: body.subscription_id ?? null,
      insight_id: body.insight_id ?? null,
      type: body.type,
      status,
      payload: body.payload ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, status });
}

// PATCH /api/actions/set  — advance action status
export async function PATCH(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string };

  if (!body.id || !body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: "Requires id and valid status (prepared | confirmed | completed)" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("actions")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
