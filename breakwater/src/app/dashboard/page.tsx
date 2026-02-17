"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";
import { useRouter } from "next/navigation";

function clearDevCookie() {
  document.cookie = "bw_dev_auth=; path=/; max-age=0";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [devAuthed, setDevAuthed] = useState(false);

  useEffect(() => {
    const dev = localStorage.getItem("bw_dev_auth") === "1";
    setDevAuthed(dev);

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);

      // ✅ allow dev auth even with no Supabase user
      if (!data.user && !dev) router.replace("/login");
      else setReady(true);
    });
  }, [router, supabase]);

  async function exit() {
    localStorage.removeItem("bw_dev_auth");
    clearDevCookie();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!ready) return null;

  return (
    <Shell
      title="Dashboard"
      subtitle="Your recurring picture, surfaced quietly."
      right={
        <button
          onClick={exit}
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
      <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <div style={{ color: inkSoft }}>
          Signed in as{" "}
          <span style={{ color: ink }}>
            {userEmail ?? (devAuthed ? "dev" : "…")}
          </span>
        </div>

        <div style={{ color: inkSoft }}>
          (Next) Render your recurring subscriptions list here.
        </div>
      </div>
    </Shell>
  );
}
