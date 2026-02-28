// src/app/api/transactions/route.ts
// Returns transactions for the authenticated user from the DB.
// No file I/O. No direct Plaid calls. Token lives in plaid_items.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = authData.user.id;

    const { data: rows, error: txErr } = await supabase
      .from("plaid_transactions")
      .select(
        "transaction_id, account_id, name, merchant_name, amount, " +
        "iso_currency_code, date, authorized_date, category, pending, " +
        "payment_channel, created_at"
      )
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(500);

    if (txErr) {
      return NextResponse.json(
        { error: "Failed to load transactions" },
        { status: 500 }
      );
    }

    return NextResponse.json(rows ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
