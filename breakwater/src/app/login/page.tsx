"use client";

import { useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";

export default function LoginPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendLink() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <Shell
      title="Enter"
      subtitle="We’ll send a quiet link to your email."
    >
      <div style={{ maxWidth: 520, display: "grid", gap: 12 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: `1px solid ${line}`,
            background: "rgba(255,255,255,0.35)",
            color: ink,
            outline: "none",
          }}
        />
        <button
          onClick={sendLink}
          style={{
            padding: "12px 14px",
            borderRadius: 999,
            border: `1px solid ${line}`,
            background: "rgba(255,255,255,0.25)",
            color: ink,
            cursor: "pointer",
          }}
        >
          Send link
        </button>

        {sent ? (
          <div style={{ color: inkSoft }}>
            Sent. Check your inbox.
          </div>
        ) : null}

        {err ? <div style={{ color: "rgba(140,40,40,0.9)" }}>{err}</div> : null}
      </div>
    </Shell>
  );
}
