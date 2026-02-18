import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), ".plaid_access_token");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const public_token = body?.public_token;

    if (!public_token || typeof public_token !== "string") {
      return NextResponse.json(
        { error: "Missing public_token" },
        { status: 400 }
      );
    }

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;

    // DEV ONLY: persist token so it survives reloads/restarts
    fs.writeFileSync(TOKEN_PATH, access_token, "utf8");

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("exchange-public-token error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to exchange token" },
      { status: 500 }
    );
  }
}
