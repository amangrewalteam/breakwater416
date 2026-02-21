// src/app/login/LoginClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const IVORY = "#F6F3EE";

export default function LoginClient() {
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || params.get("next") || "/dashboard";

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
        redirectTo
      )}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Could not send link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        background: IVORY,
        minHeight: "100vh",
        padding: "64px 28px",
        fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
        color: "#1d1d1d",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 44, margin: 0, letterSpacing: "-0.02em" }}>
          Login
        </h1>
        <p style={{ marginTop: 10, opacity: 0.75 }}>
          We’ll email you a quiet link. No passwords.
        </p>

        <div
          style={{
            marginTop: 24,
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            padding: 18,
            background: "rgba(255,255,255,0.35)",
          }}
        >
          {sent ? (
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Check your email. Open the link to continue to{" "}
              <span style={{ textDecoration: "underline" }}>{redirectTo}</span>.
            </p>
          ) : (
            <form onSubmit={sendMagicLink}>
              <label style={{ display: "block", fontSize: 13, opacity: 0.8 }}>
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@domain.com"
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  background: "rgba(255,255,255,0.65)",
                  outline: "none",
                  fontSize: 16,
                }}
              />

              {error ? (
                <p style={{ marginTop: 12, color: "#7a1d1d" }}>{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "rgba(0,0,0,0.02)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
