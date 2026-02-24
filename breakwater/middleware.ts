// src/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/connect", "/manage"];

export async function middleware(req: NextRequest) {
  // Start with a passthrough response that carries the current request headers.
  // The Supabase client may overwrite this when it refreshes an expired token.
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        // When Supabase refreshes an expired access token it calls setAll.
        // We must write the new tokens into BOTH the request (so the client
        // can read them in the same middleware pass) AND the response (so
        // the browser receives the updated cookies).
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // For unprotected routes (login, callback, landing) just return early so we
  // don't add an unnecessary round-trip to Supabase on every public request.
  if (!isProtected) return response;

  // getUser() validates the JWT against Supabase's public key — it does NOT
  // trust the locally-stored session without verification. It also triggers a
  // silent token refresh when the access token is within its expiry window.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/connect/:path*", "/manage/:path*"],
};
