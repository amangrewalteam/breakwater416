import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type"); // e.g. "magiclink"

  const origin = url.origin;

  const supabase = await supabaseServer();

  // Case 1: PKCE code flow (common in many Supabase setups)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(`/?auth=error&reason=${encodeURIComponent(error.message)}`, origin)
      );
    }

    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  // Case 2: token_hash flow (magic link / OTP variants)
  if (token_hash && type) {
    // Supabase expects a specific union type. We cast safely.
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/?auth=error&reason=${encodeURIComponent(error.message)}`, origin)
      );
    }

    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  // Nothing usable on the callback URL
  return NextResponse.redirect(
    new URL("/?auth=error&reason=missing_params", origin)
  );
}
