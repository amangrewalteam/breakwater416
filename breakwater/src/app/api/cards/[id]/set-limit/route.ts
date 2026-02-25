// src/app/api/cards/[id]/set-limit/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCardIssuer } from "@/lib/cardIssuer";
import { log, logError } from "@/lib/log";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  log("cards.set_limit.start", { cardId: id });
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const body = await req.json().catch(() => ({}));
    const { limitCents } = body as { limitCents?: number | null };

    if (limitCents !== null && typeof limitCents !== "number") {
      return NextResponse.json(
        { error: "limitCents must be a number or null" },
        { status: 400 }
      );
    }

    const card = await getCardIssuer().setLimit(userId, id, limitCents ?? null);

    log("cards.set_limit.ok", { userId, cardId: id, limitCents });
    return NextResponse.json(card);
  } catch (e: any) {
    logError("cards.set_limit.err", e, { cardId: id });
    const status = e?.message === "Card not found" ? 404 : 400;
    return NextResponse.json({ error: e?.message || "Failed to set limit" }, { status });
  }
}
