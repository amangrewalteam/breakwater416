import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

export async function POST() {
  const res = await plaidClient.linkTokenCreate({
    user: { client_user_id: "breakwater_v1" },
    client_name: "Breakwater",
    products: [Products.Transactions],
    country_codes: [CountryCode.Ca, CountryCode.Us],
    language: "en",
    redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
  });

  return NextResponse.json({ link_token: res.data.link_token });
}
