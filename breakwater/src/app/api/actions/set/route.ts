import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

const Schema = z.object({
  recurring_id: z.string().min(1),
  status: z.enum(["track", "cancel", "move", "none"]),
});

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = Schema.parse(await req.json());

  // Ensure the recurring belongs to user
  const { data: rec } = await supabase
    .from("recurring")
    .select("id")
    .eq("id", body.recurring_id)
    .eq("user_id", user.id)
    .single();

  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabase.from("subscription_actions").upsert({
    user_id: user.id,
    recurring_id: body.recurring_id,
    status: body.status,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
