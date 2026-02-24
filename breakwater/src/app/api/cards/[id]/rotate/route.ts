// src/app/api/cards/[id]/rotate/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCardIssuer } from "@/lib/cardIssuer";
import { log, logError } from "@/lib/log";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  log("cards.rotate.start", { cardId: id });
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    const card = await getCardIssuer().rotate(userId, id);

    log("cards.rotate.ok", { userId, cardId: id });
    return NextResponse.json(card);
  } catch (e: any) {
    logError("cards.rotate.err", e, { cardId: id });
    const status = e?.message === "Card not found" ? 404 : 400;
    return NextResponse.json({ error: e?.message || "Failed to rotate card" }, { status });
  }
}
