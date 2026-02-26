"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://app.breakwater.finance").replace(/\/$/, "");

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
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
          disabled={loading}
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ccc",
            fontSize: 16,
            background: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Sending…" : "Send link"}
        </button>
      </form>

      {status && (
        <p style={{ marginTop: 20, fontSize: 14 }}>
          {status}
        </p>
      )}
    </main>
  );
}