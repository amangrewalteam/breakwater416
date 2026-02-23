// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Supabase sends ?code=... (PKCE) or sometimes ?error=...
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const error_description = url.searchParams.get("error_description");

  // If Supabase is telling us something went wrong, send user somewhere clean
  if (error) {
    const redirect = new URL("/", url.origin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("error", error);
    if (error_description) redirect.searchParams.set("error_description", error_description);
    return NextResponse.redirect(redirect);
  }

  // If there's no code, nothing to exchange
  if (!code) {
    const redirect = new URL("/", url.origin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(redirect);
  }

  // Exchange the code for a session and set cookies
  const supabase = await supabaseServer();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const redirect = new URL("/", url.origin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("reason", "exchange_failed");
    redirect.searchParams.set("message", exchangeError.message);
    return NextResponse.redirect(redirect);
  }

  // Success: send them to your intended post-login page
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
