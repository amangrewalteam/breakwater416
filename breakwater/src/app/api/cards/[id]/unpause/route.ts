// src/app/api/cards/[id]/unpause/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCardIssuer } from "@/lib/cardIssuer";
import { log, logError } from "@/lib/log";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  log("cards.unpause.start", { cardId: id });
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const card = await getCardIssuer().unpause(userId, id);

    log("cards.unpause.ok", { userId, cardId: id });
    return NextResponse.json(card);
  } catch (e: any) {
    logError("cards.unpause.err", e, { cardId: id });
    const status = e?.message === "Card not found" ? 404 : 400;
    return NextResponse.json({ error: e?.message || "Failed to unpause card" }, { status });
  }
}
