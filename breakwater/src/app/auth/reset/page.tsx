"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function safeNextPath(nextParam: string | null) {
  if (!nextParam) return "/";
  if (nextParam.startsWith("/") && !nextParam.startsWith("//")) return nextParam;
  return "/";
}

export default function AuthResetPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = safeNextPath(params.get("next"));

    // 1) Clear Supabase localStorage keys (PKCE verifier lives here)
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) {
        if (k.toLowerCase().includes("supabase")) {
          window.localStorage.removeItem(k);
        }
        // some projects store under "sb-<project-ref>-auth-token"
        if (k.toLowerCase().startsWith("sb-") && k.toLowerCase().includes("auth")) {
          window.localStorage.removeItem(k);
        }
      }
    } catch {}

    // 2) Best-effort sign out (also helps clear any cached client state)
    (async () => {
      try {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
      } catch {}

      // 3) Hard refresh navigation so you’re clean
      router.replace(next);
    })();
  }, [params, router]);

  return (
    <main style={{ padding: 24 }}>
      <p>Resetting authentication…</p>
    </main>
  );
}