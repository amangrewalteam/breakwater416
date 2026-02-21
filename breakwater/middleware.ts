import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/connect", "/manage"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Supabase sets auth cookies; simplest gate is: if no sb-* cookie, send to login
  const hasSupabaseCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token") ||
    // newer cookie names can be project-scoped:
    Object.keys(req.cookies.getAll().reduce((a, c) => ((a[c.name] = 1), a), {})).some((k) =>
      k.startsWith("sb-")
    );

  if (!hasSupabaseCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/connect/:path*", "/manage/:path*"],
};
