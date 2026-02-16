import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: items, error: itemsErr } = await supabase
    .from("plaid_items")
    .select("access_token")
    .eq("user_id", user.id);

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ ok: true, synced: 0 });

  // last 180 days (enough to detect recurring)
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);

  let upserted = 0;

  for (const it of items) {
    const tx = await plaidClient.transactionsGet({
      access_token: it.access_token,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      options: { count: 500, offset: 0 },
    });

    const rows = tx.data.transactions.map((t) => ({
      user_id: user.id,
      plaid_transaction_id: t.transaction_id,
      merchant_name: t.merchant_name ?? null,
      name: t.name ?? null,
      amount: t.amount ?? null,
      date: t.date,
      pending: t.pending ?? false,
    }));

    const { error } = await supabase.from("transactions").upsert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    upserted += rows.length;
  }

  return NextResponse.json({ ok: true, synced: upserted });
}
