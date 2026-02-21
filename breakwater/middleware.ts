// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/connect", "/manage"];

function hasSupabaseSessionCookie(req: NextRequest) {
  // Supabase cookies can vary by version/project; safest is: any cookie starting with "sb-"
  return req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  if (!hasSupabaseSessionCookie(req)) {
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
