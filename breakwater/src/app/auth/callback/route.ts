// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function getCanonicalBaseUrl(requestUrl: URL) {
  // Prefer explicit canonical site url in prod (set this in Vercel)
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  // If VERCEL_PROJECT_PRODUCTION_URL is set, it may be just host without protocol
  if (envUrl) {
    const withProto = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
    try {
      return new URL(withProto).origin;
    } catch {
      // fall through
    }
  }

  // Fallback to current origin (local/dev)
  return requestUrl.origin;
}

function safeNextPath(nextParam: string | null) {
  if (!nextParam) return "/dashboard";
  // Only allow internal paths to avoid open redirects
  if (nextParam.startsWith("/") && !nextParam.startsWith("//")) return nextParam;
  return "/dashboard";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const canonicalOrigin = getCanonicalBaseUrl(url);

  // 1) HARD CANONICAL DOMAIN LOCK:
  // If user lands on a non-canonical host (preview domain, etc),
  // redirect them to the canonical host with the same path+query.
  if (url.origin !== canonicalOrigin) {
    const canonicalUrl = new URL(url.pathname + url.search, canonicalOrigin);

    // 308 keeps method; safe for GET and prevents PKCE mismatch due to origin drift
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // 2) Parse Supabase params
  const code = url.searchParams.get("code");

  // Supabase may send these:
  const error = url.searchParams.get("error") || url.searchParams.get("reason");
  const errorDescription =
    url.searchParams.get("error_description") ||
    url.searchParams.get("message") ||
    url.searchParams.get("error_description");

  const next = safeNextPath(url.searchParams.get("next"));

  // 3) If Supabase reports an error, bounce to home with clean params
  if (error) {
    const redirect = new URL("/", canonicalOrigin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("error", error);
    if (errorDescription) redirect.searchParams.set("error_description", errorDescription);
    return NextResponse.redirect(redirect, 307);
  }

  // 4) If no code, nothing to exchange
  if (!code) {
    const redirect = new URL("/", canonicalOrigin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(redirect, 307);
  }

  // 5) Exchange code → session (sets cookies via your supabaseServer helper)
  const supabase = await supabaseServer();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const redirect = new URL("/", canonicalOrigin);
    redirect.searchParams.set("auth", "error");
    redirect.searchParams.set("reason", "exchange_failed");
    redirect.searchParams.set("message", exchangeError.message);

    // If this is the classic PKCE mismatch, route the user somewhere that can clear state once.
    // You can implement /auth/reset to clear cookies/localStorage client-side.
    if (
      /code challenge/i.test(exchangeError.message) ||
      /code verifier/i.test(exchangeError.message)
    ) {
      redirect.searchParams.set("hint", "pkce_mismatch");
      // Optional: if you add /auth/reset, you can send them there instead:
      // return NextResponse.redirect(new URL("/auth/reset?next=" + encodeURIComponent(next), canonicalOrigin), 307);
    }

    return NextResponse.redirect(redirect, 307);
  }

  // 6) Success → next (default /dashboard)
  return NextResponse.redirect(new URL(next, canonicalOrigin), 307);
}