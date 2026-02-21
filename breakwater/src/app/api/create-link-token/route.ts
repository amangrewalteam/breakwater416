// src/app/api/create-link-token/route.ts
import { NextResponse } from "next/server";
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
      products: ["transactions"],
      country_codes: ["US", "CA"],
      language: "en",
    });

    log("plaid.link_token.ok", { userId });

    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    logError("plaid.link_token.err", e);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
