import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    // No auth code present — go home
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const supabase = await supabaseServer();

  // This exchanges the code for a session + sets cookies
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // If exchange fails, send them somewhere sane
    return NextResponse.redirect(new URL("/?auth=error", url.origin));
  }

  // After login, send them into onboarding (or dashboard later)
  return NextResponse.redirect(new URL("/onboarding", url.origin));
}
