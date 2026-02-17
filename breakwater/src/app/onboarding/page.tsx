"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import PlaidConnectButton from "@/components/PlaidConnectButton";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();

        if (!alive) return;

        // If no user session, send to login
        if (!data.user) {
          router.replace("/login");
          return;
        }

        setUserEmail(data.user.email ?? null);
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);

  async function afterConnected() {
    // Sync transactions + compute recurring, then go dashboard
    await fetch("/api/plaid/sync", { method: "POST" });
    await fetch("/api/recurring/recompute", { method: "POST" });

    // Use replace to prevent back button / bounce loops
    router.replace("/dashboard");
  }

  return (
    <Shell
      title="Settle in"
      subtitle="Connect once. We’ll surface what returns."
      right={
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
          style={{
            color: ink,
            border: `1px solid ${line}`,
            padding: "10px 14px",
            borderRadius: 999,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Exit
        </button>
      }
    >
      <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
        <div style={{ color: inkSoft }}>
          Signed in as{" "}
          <span style={{ color: ink }}>
            {checking ? "…" : userEmail ?? "dev"}
          </span>
        </div>

        <PlaidConnectButton onConnected={afterConnected} />

        <div style={{ color: inkSoft, maxWidth: 560 }}>
          V1 reads transactions to detect recurring merchants. No cancellations
          happen automatically — you stay in control.
        </div>

        <div style={{ color: inkSoft }}>
          Dev mode: email login is temporarily bypassed due to provider rate
          limits.
        </div>
      </div>
    </Shell>
  );
}
