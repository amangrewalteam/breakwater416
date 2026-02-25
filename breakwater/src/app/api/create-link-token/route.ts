// src/app/api/create-link-token/route.ts
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";

export async function POST() {
  log("plaid.link_token.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.link_token.unauthorized", { error: error?.message });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    // If you are using any OAuth institutions, this must be configured in Plaid Dashboard
    // and should match the environment domain exactly.
    const redirectUri = process.env.PLAID_REDIRECT_URI || undefined;

    const resp = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Breakwater",
      products: [Products.Transactions],

      // IMPORTANT: include CA if you might connect Canadian institutions
      country_codes: [CountryCode.Us, CountryCode.Ca],

      language: "en",

      // Safe to include; required for many OAuth institutions
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),

      // Optional but helpful later
      // webhook: process.env.PLAID_WEBHOOK_URL,
    });

    log("plaid.link_token.ok", { userId, hasRedirect: !!redirectUri });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    const plaid = e?.response?.data;
    console.error("PLAID linkTokenCreate error:", plaid || e);

    logError("plaid.link_token.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_type: plaid?.error_type,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      {
        error: plaid?.error_message || e?.message || "Failed to create link token",
        plaid_error_code: plaid?.error_code,
      },
      { status: 500 }
    );
  }
}