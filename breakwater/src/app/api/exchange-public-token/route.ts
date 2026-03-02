// src/app/api/exchange-public-token/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log, logError } from "@/lib/log";

type Body = {
  public_token?: string;
  institution_name?: string | null;
};

export async function POST(req: Request) {
  log("plaid.exchange.start");

  try {
    // 1. Authenticate via cookie session (anon client is fine for auth.getUser)
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

    // 2. Exchange with Plaid
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    log("plaid.exchange.plaid_ok", {
      userId,
      itemId: item_id,
      tokenTail: access_token.slice(-6),
    });

    // 3. Persist via service-role client (bypasses RLS — safe for server-only route).
    //    onConflict: "user_id" — one row per user; reconnecting the same or a new bank
    //    replaces the old row rather than creating duplicates.
    const admin = supabaseAdmin();
    const { error: upsertErr } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id: userId,
          item_id,
          access_token,
          institution_name: body.institution_name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      logError("plaid.exchange.db_error", upsertErr);
      return NextResponse.json(
        { error: "Failed to save Plaid item", detail: upsertErr.message },
        { status: 500 }
      );
    }

    log("plaid.exchange.db_ok", { userId, itemId: item_id, tokenTail: access_token.slice(-6) });

    return NextResponse.json({ ok: true, item_id });
  } catch (e: unknown) {
    logError("plaid.exchange.err", e);
    return NextResponse.json(
      { error: "Failed to exchange public token" },
      { status: 500 }
    );
  }
}
