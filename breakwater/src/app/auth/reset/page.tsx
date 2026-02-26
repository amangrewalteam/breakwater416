// src/app/auth/reset/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function safeNextPath(nextParam: string | null) {
  if (!nextParam) return "/";
  if (nextParam.startsWith("/") && !nextParam.startsWith("//")) return nextParam;
  return "/";
}

export default function AuthResetPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get("next"));

    // Clear Supabase localStorage keys (PKCE verifier often lives here)
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) {
        const lk = k.toLowerCase();
        if (lk.includes("supabase")) window.localStorage.removeItem(k);
        if (lk.startsWith("sb-") && lk.includes("auth")) window.localStorage.removeItem(k);
      }
    } catch {}

    (async () => {
      try {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
      } catch {}

      router.replace(next);
    })();
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <p>Resetting authentication…</p>
    </main>
  );
}