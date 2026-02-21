// src/app/api/exchange-public-token/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

type Body = {
  public_token?: string;
  institution_name?: string | null;
};

export async function POST(req: Request) {
  log("plaid.exchange.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.exchange.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const body = (await req.json().catch(() => ({}))) as Body;
    const public_token = body.public_token;

    if (!public_token) {
      log("plaid.exchange.bad_request", { userId });
      return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
    }

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });

    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    // Store item + access_token (NOTE: Phase 3.2 will encrypt; for now store as-is)
    const upsertResp = await supabase
      .from("plaid_items")
      .upsert(
        {
          user_id: userId,
          item_id,
          access_token_enc: access_token,
          institution_name: body.institution_name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,item_id" }
      )
      .select("item_id")
      .maybeSingle();

    if (upsertResp.error) {
      log("plaid.exchange.db_error", { userId, itemId: item_id });
      return NextResponse.json(
        { error: "Failed to save Plaid item" },
        { status: 500 }
      );
    }

    log("plaid.exchange.ok", { userId, itemId: item_id });

    return NextResponse.json({ item_id });
  } catch (e: any) {
    logError("plaid.exchange.err", e);
    return NextResponse.json(
      { error: "Failed to exchange public token" },
      { status: 500 }
    );
  }
}
