// src/app/api/recurring/recompute/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // TODO: implement recompute logic later
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to recompute" },
      { status: 500 }
    );
  }
}
