// src/app/api/exchange-public-token/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";

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
      log("plaid.exchange.unauthorized", { error: error?.message });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    const body = (await req.json().catch(() => ({}))) as Body;
    const public_token = body.public_token;

    if (!public_token) {
      log("plaid.exchange.bad_request", { userId });
      return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
    }

    // Exchange public_token → access_token
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });

    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    // Upsert WITHOUT selecting back (avoids RLS/select edge cases)
    const { error: dbError } = await supabase.from("plaid_items").upsert(
      {
        user_id: userId,
        item_id,
        access_token_enc: access_token,
        institution_name: body.institution_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_id" }
    );

    if (dbError) {
      console.error("Supabase upsert error:", dbError);

      log("plaid.exchange.db_error", {
        userId,
        itemId: item_id,
        db_code: dbError.code,
        db_message: dbError.message,
        db_details: dbError.details,
        db_hint: dbError.hint,
      });

      return NextResponse.json(
        {
          error: dbError.message || "Failed to save Plaid item",
          code: dbError.code,
          details: dbError.details,
          hint: dbError.hint,
        },
        { status: 500 }
      );
    }

    log("plaid.exchange.ok", { userId, itemId: item_id });
    return NextResponse.json({ item_id });
  } catch (e: any) {
    const plaid = e?.response?.data;
    console.error("PLAID exchange error:", plaid || e);

    logError("plaid.exchange.err", e, {
      plaid_error_code: plaid?.error_code,
      plaid_error_message: plaid?.error_message,
    });

    return NextResponse.json(
      {
        error:
          plaid?.error_message ||
          e?.message ||
          "Failed to exchange public token",
      },
      { status: 500 }
    );
  }
}