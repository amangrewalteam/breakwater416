// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Supabase PKCE flow: sends ?code=... on success, ?error=... on failure.
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const error_description = url.searchParams.get("error_description");

  // Optional: some Supabase flows (e.g. email invite) pass a ?next= param
  // to control where the user lands after sign-in.
  const next = url.searchParams.get("next") ?? "/dashboard";

  // Supabase reported an error before we even got the code (e.g. access_denied,
  // otp_expired). Forward the details to the home page for display.
  if (error) {
    const dest = new URL("/", url.origin);
    dest.searchParams.set("auth", "error");
    dest.searchParams.set("error", error);
    if (error_description) dest.searchParams.set("error_description", error_description);
    return NextResponse.redirect(dest);
  }

  // A code must be present for the PKCE exchange.
  if (!code) {
    const dest = new URL("/", url.origin);
    dest.searchParams.set("auth", "error");
    dest.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(dest);
  }

  // Exchange the one-time PKCE code for a session.
  // supabaseServer() writes the resulting session cookies onto the response
  // via the setAll cookie handler — this is what logs the user in.
  const supabase = await supabaseServer();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const dest = new URL("/", url.origin);
    dest.searchParams.set("auth", "error");
    dest.searchParams.set("reason", "exchange_failed");
    dest.searchParams.set("message", exchangeError.message);
    return NextResponse.redirect(dest);
  }

  // Guard against open-redirect: next must be a relative path.
  const safePath = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(new URL(safePath, url.origin));
}
