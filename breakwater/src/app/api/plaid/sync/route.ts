// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// If you have a plaid sync function/client, import it here.
// Example:
// import { plaidClient } from "@/lib/plaid";

export async function POST() {
  try {
    // IMPORTANT: supabaseServer() is async
    const supabase = await supabaseServer();

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Auth error" },
        { status: 401 }
      );
    }
    if (!auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = auth.user.id;

    // TODO: Replace this placeholder with your actual Plaid sync logic.
    // Example:
    // const result = await runPlaidSyncForUser({ userId });
    // return NextResponse.json({ ok: true, ...result });

    return NextResponse.json({ ok: true, userId });
  } catch (e: any) {
    console.error("plaid sync error:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "Failed to sync Plaid" },
      { status: 500 }
    );
  }
}
