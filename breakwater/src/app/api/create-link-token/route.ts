// src/app/api/create-link-token/route.ts
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

// Ensure this route always runs on Node (Plaid SDK expects Node APIs)
export const runtime = "nodejs";

export async function POST() {
  log("plaid.link_token.start");

  try {
    // Auth gate: only signed-in users can create a Link token
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.link_token.unauthorized", { error: error?.message });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    // Create link token (no redirect_uri needed for popup Link in web MVP)
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

    // Loud console for Vercel logs
    console.error("PLAID linkTokenCreate error:", plaid || e);

    logError("plaid.link_token.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_type: plaid?.error_type,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      {
        error:
          plaid?.error_message ||
          e?.message ||
          "Failed to create link token",
        plaid_error_code: plaid?.error_code,
      },
      { status: 500 }
    );
  }
}