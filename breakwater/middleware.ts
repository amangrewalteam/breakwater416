import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // Keep v1 simple: no hard auth gating here.
  // We do client-side checks. You can add cookie-based gating in v1.1.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/subscriptions/:path*", "/onboarding/:path*"],
};
