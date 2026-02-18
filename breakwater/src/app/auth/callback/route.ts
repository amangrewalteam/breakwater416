// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs"; // avoid edge cookie quirks

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anon };
}

function supabaseRouteClient() {
  const { url, anon } = getEnv();

  if (!url || !anon) {
    // Throw a controlled error that we can handle in GET
    throw new Error(
      `Missing Supabase env. NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is empty.`
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Next's cookies() is mutable in route handlers (node runtime).
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  // If no code, return to login
  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(safeNext)}&error=missing_code`, url.origin)
    );
  }

  try {
    const supabase = supabaseRouteClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/login?next=${encodeURIComponent(safeNext)}&error=exchange_failed`,
          url.origin
        )
      );
    }

    return NextResponse.redirect(new URL(safeNext, url.origin));
  } catch (e: any) {
    // Never 500 to the browser — redirect with a readable error.
    const msg = encodeURIComponent(e?.message || "callback_failed");
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(safeNext)}&error=${msg}`, url.origin)
    );
  }
}
