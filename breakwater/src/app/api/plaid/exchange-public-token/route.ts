import { NextResponse } from "next/server";
import { plaidClient, assertPlaidEnv } from "@/lib/plaid";

export async function POST(req: Request) {
  try {
    assertPlaidEnv();

    const body = await req.json().catch(() => ({}));
    const public_token = body?.public_token;

    if (!public_token || typeof public_token !== "string") {
      return NextResponse.json(
        { error: "Missing public_token in request body." },
        { status: 400 }
      );
    }

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });

    // In a real app, you'd store access_token + item_id in DB tied to the user.
    // For dev, we just return them.
    return NextResponse.json({
      access_token: exchange.data.access_token,
      item_id: exchange.data.item_id,
    });
  } catch (e: any) {
    const payload = e?.response?.data || null;
    console.error("exchange-public-token error:", payload || e);

    return NextResponse.json(
      {
        error:
          payload?.error_message ||
          e?.message ||
          "Token exchange failed",
        plaid: payload || undefined,
      },
      { status: 500 }
    );
  }
}
