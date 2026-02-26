"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://app.breakwater.finance").replace(/\/$/, "");

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
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
    } catch (err: any) {
      setStatus(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ fontSize: 36, marginBottom: 10 }}>Breakwater</h1>
      <p style={{ marginBottom: 18 }}>Log in via magic link.</p>

      <form onSubmit={sendLink} style={{ display: "flex", gap: 12 }}>
        <input
          type="email"
          required
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 12, border: "1px solid #ccc", borderRadius: 10 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ccc" }}
        >
          {loading ? "Sending…" : "Send link"}
        </button>
      </form>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </main>
  );
}