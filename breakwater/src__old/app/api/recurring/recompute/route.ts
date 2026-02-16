import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { detectRecurring } from "@/lib/recurring";

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("merchant_name,name,amount,date")
    .eq("user_id", user.id)
    .eq("pending", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const detected = detectRecurring((txs || []) as any);

  // upsert recurring
  const rows = detected.map((r) => ({
    user_id: user.id,
    merchant_key: r.merchant_key,
    merchant_name: r.merchant_name,
    cadence: r.cadence,
    avg_amount: r.avg_amount,
    last_date: r.last_date,
    confidence: r.confidence,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error: upErr } = await supabase.from("recurring").upsert(rows);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, found: rows.length });
}
