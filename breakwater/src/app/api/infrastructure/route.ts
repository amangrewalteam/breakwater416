import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    // ✅ IMPORTANT: supabaseServer() is async
    const supabase = await supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = String(auth.user.id);

    // If you have an "infrastructure" table, this will read it.
    // If your table name differs, update it here.
    const { data, error } = await supabase
      .from("infrastructure")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load infrastructure" },
      { status: 500 }
    );
  }
}
