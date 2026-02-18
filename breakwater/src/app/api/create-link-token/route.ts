import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";

export async function POST() {
  try {
    const resp = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: "dev-user",
      },
      client_name: "Breakwater",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });

    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    console.error("create-link-token error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
