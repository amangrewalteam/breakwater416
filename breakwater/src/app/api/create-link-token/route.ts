// src/app/api/create-link-token/route.ts
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export async function POST() {
  log("plaid.link_token.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.link_token.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const resp = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Breakwater",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: "en",
    });

    log("plaid.link_token.ok", { userId });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    const plaid = e?.response?.data;
    // This is the important part: shows error_code + error_message in Vercel logs
    console.error("PLAID linkTokenCreate error:", plaid || e);

    logError("plaid.link_token.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_type: plaid?.error_type,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      { error: plaid?.error_message || e?.message || "Failed to create link token" },
      { status: 500 }
    );
  }
}
