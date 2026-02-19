import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

export async function POST() {
  try {
    const resp = await plaidClient.linkTokenCreate({
      user: {
        // For sandbox/dev this can be any stable identifier
        client_user_id: "dev-user",
      },
      client_name: "Breakwater",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    console.error("create-link-token error:", e?.response?.data || e);
    return NextResponse.json(
      {
        error: e?.response?.data || e?.message || "Failed to create link token",
      },
      { status: 500 }
    );
  }
}
