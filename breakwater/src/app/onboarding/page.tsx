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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (!data.user) router.replace("/login");
    });
  }, [router, supabase]);

  async function afterConnected() {
    // Sync transactions + compute recurring, then go dashboard
    await fetch("/api/plaid/sync", { method: "POST" });
    await fetch("/api/recurring/recompute", { method: "POST" });
    router.push("/dashboard");
  }

  return (
    <Shell
      title="Settle in"
      subtitle="Connect once. We’ll surface what returns."
      right={
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/");
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
          Signed in as <span style={{ color: ink }}>{userEmail ?? "…"}</span>
        </div>
        <PlaidConnectButton onConnected={afterConnected} />
        <div style={{ color: inkSoft, maxWidth: 560 }}>
          V1 reads transactions to detect recurring merchants. No cancellations happen
          automatically — you stay in control.
        </div>
      </div>
    </Shell>
  );
}
