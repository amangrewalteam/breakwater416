import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  // In dev, do not gate routes server-side.
  // This prevents bouncing due to missing Supabase cookies while you're using dev bypass.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Production: allow request through (you can tighten later)
  return NextResponse.next();
}

export const config = {
  matcher: ["/onboarding/:path*", "/dashboard/:path*"],
};
