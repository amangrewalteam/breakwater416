// src/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options?: any;
};

function setCookie(name: string, value: string, options: any = {}) {
  const opts: Record<string, any> = { path: "/", ...options };

  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.expires) {
    const exp = opts.expires instanceof Date ? opts.expires.toUTCString() : opts.expires;
    cookie += `; Expires=${exp}`;
  }
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.domain) cookie += `; Domain=${opts.domain}`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.secure) cookie += `; Secure`;
  // httpOnly cannot be set from the browser (ignored)

  document.cookie = cookie;
}

function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie ? document.cookie.split("; ") : [];
  return raw
    .map((pair) => {
      const idx = pair.indexOf("=");
      const name = idx >= 0 ? decodeURIComponent(pair.slice(0, idx)) : decodeURIComponent(pair);
      const value = idx >= 0 ? decodeURIComponent(pair.slice(idx + 1)) : "";
      return { name, value };
    })
    .filter((c) => c.name);
}

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(url, anon, {
    cookies: {
      getAll() {
        return getAllCookies();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => setCookie(name, value, options));
      },
    },
  });
}