import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const receivedRedirectUri = body?.received_redirect_uri;

    const resp = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: "dev-user",
      },
      client_name: "Breakwater",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      redirect_uri: process.env.PLAID_REDIRECT_URI,

      ...(receivedRedirectUri && {
        received_redirect_uri: receivedRedirectUri,
      }),
    });

    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    console.error("create-link-token error:", e?.response?.data || e);
    return NextResponse.json(
      { error: e?.response?.data?.error_message || "Failed to create link token" },
      { status: 500 }
    );
  }
}
