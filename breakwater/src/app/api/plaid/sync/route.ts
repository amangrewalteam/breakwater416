// src/app/api/plaid/sync/route.ts
import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase/server";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";

export async function POST() {
  log("plaid.sync.start");

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      log("plaid.sync.unauthorized", { error: error?.message });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;

    // Load Plaid items for this user
    const itemsResp = await supabase
      .from("plaid_items")
      .select("item_id, access_token_enc, access_token, institution_name")
      .eq("user_id", userId);

    if (itemsResp.error) {
      console.error("Failed to load plaid_items:", itemsResp.error);
      logError("plaid.sync.load_items_err", itemsResp.error);

      return NextResponse.json(
        {
          error: "Failed to load plaid items",
          code: itemsResp.error.code,
          message: itemsResp.error.message,
          details: itemsResp.error.details,
          hint: itemsResp.error.hint,
        },
        { status: 500 }
      );
    }

    const items = itemsResp.data ?? [];

    // IMPORTANT: don't 500 if user simply has no items yet
    if (items.length === 0) {
      log("plaid.sync.no_items", { userId });
      return NextResponse.json({ ok: true, synced_items: 0, note: "No Plaid items found" });
    }

    // If you haven't built transaction ingestion yet, at least prove we can read tokens:
    // (If you HAVE ingestion, keep going here.)
    for (const it of items) {
      const accessToken = it.access_token_enc ?? it.access_token;
      if (!accessToken) {
        return NextResponse.json(
          { error: `Missing access token for item ${it.item_id}` },
          { status: 500 }
        );
      }

      // TODO: your existing cursor-based transactions sync logic goes here.
      // Example placeholder call (remove if you already implemented full sync):
      await plaidClient.accountsGet({ access_token: accessToken });
    }

    log("plaid.sync.ok", { userId, synced_items: items.length });
    return NextResponse.json({ ok: true, synced_items: items.length });
  } catch (e: any) {
    console.error("plaid.sync fatal:", e);
    logError("plaid.sync.err", e);
    return NextResponse.json(
      { error: e?.message || "Plaid sync failed" },
      { status: 500 }
    );
  }
}