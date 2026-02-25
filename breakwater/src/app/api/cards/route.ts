// src/app/api/cards/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCardIssuer } from "@/lib/cardIssuer";
import { log, logError } from "@/lib/log";

// ─── GET: list cards ─────────────────────────────────────────────────────────

export async function GET() {
  log("cards.list.start");
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const cards = await getCardIssuer().list(userId);

    log("cards.list.ok", { userId, count: cards.length });
    return NextResponse.json(cards);
  } catch (e: any) {
    logError("cards.list.err", e);
    return NextResponse.json({ error: "Failed to list cards" }, { status: 500 });
  }
}

// ─── POST: create card ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  log("cards.create.start");
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const body = await req.json().catch(() => ({}));
    const { nickname, limitCents, currency, subscriptionId } = body as {
      nickname?: string;
      limitCents?: number;
      currency?: string;
      subscriptionId?: string;
    };

    if (!nickname || typeof nickname !== "string" || !nickname.trim()) {
      return NextResponse.json({ error: "nickname is required" }, { status: 400 });
    }

    const card = await getCardIssuer().create(userId, {
      nickname: nickname.trim(),
      limitCents: typeof limitCents === "number" ? limitCents : undefined,
      currency,
      subscriptionId,
    });

    log("cards.create.ok", { userId, cardId: card.id });
    return NextResponse.json(card, { status: 201 });
  } catch (e: any) {
    logError("cards.create.err", e);
    return NextResponse.json({ error: "Failed to create card" }, { status: 500 });
  }
}
