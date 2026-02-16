import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { CountryCode } from "plaid";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const public_token: string = body.public_token;

  const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
  const access_token = exchange.data.access_token;
  const item_id = exchange.data.item_id;

  // Institution name is nice-to-have; fetch quickly
  let institution_name: string | undefined;
  try {
    const item = await plaidClient.itemGet({ access_token });
    const instId = item.data.item.institution_id;
    if (instId) {
      const inst = await plaidClient.institutionsGetById({
        institution_id: instId,
        country_codes: [CountryCode.Ca, CountryCode.Us],
      });
      institution_name = inst.data.institution.name;
    }
  } catch {}

  const { error } = await supabase.from("plaid_items").upsert({
    user_id: user.id,
    item_id,
    access_token,
    institution_name: institution_name ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
