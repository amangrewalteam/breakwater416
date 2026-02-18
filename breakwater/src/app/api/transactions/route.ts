import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), ".plaid_access_token");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return NextResponse.json(
        { error: "No access token yet. Connect a bank first." },
        { status: 401 }
      );
    }

    const access_token = fs.readFileSync(TOKEN_PATH, "utf8").trim();
    if (!access_token) {
      return NextResponse.json(
        { error: "Access token file is empty. Reconnect bank." },
        { status: 401 }
      );
    }

    const end_date = todayISO();
    const start_date = "2024-01-01";

    const resp = await plaidClient.transactionsGet({
      access_token,
      start_date,
      end_date,
      options: {
        count: 250,
        offset: 0,
      },
    });

    return NextResponse.json(resp.data.transactions);
  } catch (e: any) {
    console.error("transactions error:", e?.response?.data || e);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
