import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set on request (so supabase sees it immediately)…
            req.cookies.set(name, value);
            // …and on response (so browser stores it)
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This refreshes session cookies when needed (important on SSR + Vercel)
  await supabase.auth.getUser();

  return res;
}

export const config = {
  matcher: [
    /*
      Run middleware on all routes except:
      - next static assets
      - images
      - favicon
    */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};