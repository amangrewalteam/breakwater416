"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://app.breakwater.finance").replace(/\/$/, "");

const COOLDOWN_SECONDS = 60;

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [cooldown, setCooldown] = useState<number>(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;
    if (cooldown > 0) {
      setStatus(`Please wait ${cooldown}s before requesting another link.`);
      return;
    }

    setStatus(null);
    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${SITE_URL}/auth/callback?next=/dashboard`,
        },
      });

      if (error) throw error;

      setStatus("Magic link sent. Check your email.");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: any) {
      setStatus(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || cooldown > 0;

  return (
    <main
      style={{
        padding: 40,
        fontFamily: "Georgia, serif",
        background: "#F5F2EE",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 42, marginBottom: 8 }}>Breakwater</h1>
      <p style={{ marginBottom: 24 }}>Please log in.</p>

      <form
        onSubmit={sendMagicLink}
        style={{
          display: "flex",
          gap: 12,
          maxWidth: 480,
        }}
      >
        <input
          type="email"
          required
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ccc",
            fontSize: 16,
          }}
        />

        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ccc",
            fontSize: 16,
            background: "white",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.7 : 1,
          }}
        >
          {loading ? "Sending…" : cooldown > 0 ? `Try again in ${cooldown}s` : "Send link"}
        </button>
      </form>

      {status && <p style={{ marginTop: 20, fontSize: 14 }}>{status}</p>}
    </main>
  );
}