// src/app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export async function GET() {
  log("transactions.list.start");
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const { data: txns, error: txErr } = await supabase
      .from("plaid_transactions")
      .select(
        "transaction_id,account_id,name,merchant_name,amount,iso_currency_code,date,authorized_date,pending,category"
      )
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(250);

    if (txErr) {
      logError("transactions.list.db_err", txErr, { userId });
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    log("transactions.list.ok", { userId, count: txns?.length ?? 0 });
    return NextResponse.json(txns ?? []);
  } catch (e: any) {
    logError("transactions.list.err", e);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
