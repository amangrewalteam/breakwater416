// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Keep this loose to avoid Next's ReadonlyRequestCookies typing issues in build.
// Runtime still supports setting cookies inside route handlers.
type CookieToSet = {
  name: string;
  value: string;
  options?: any;
};

export async function supabaseServer() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Typecast because Next's cookie types are readonly in TS, but mutable at runtime in route handlers.
            (cookieStore as any).set(name, value, options);
          });
        } catch {
          // Ignore if called in a context where cookies are not mutable.
        }
      },
    },
  });
}