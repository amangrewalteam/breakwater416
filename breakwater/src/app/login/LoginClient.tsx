"use client";

import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Use the env var so this works correctly in every Vercel environment
// (production, preview, local). Set NEXT_PUBLIC_APP_URL in Vercel dashboard
// to https://app.breakwater.finance for all production deployments.
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  (typeof window !== "undefined" ? window.location.origin : "");

export default function LoginClient() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [message, setMessage] = React.useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage("Please enter your email.");
      return;
    }

    setStatus("sending");
    setMessage("");

    const supabase = supabaseBrowser();

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${APP_ORIGIN}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message || "Could not send magic link.");
      return;
    }

    setStatus("sent");
    setMessage("Magic link sent. Check your email.");
  }

  const disabled = status === "sending";

  return (
    <div className="w-full max-w-md">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-2">Email</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2 bg-transparent"
            disabled={disabled}
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="rounded-full border px-5 py-2 text-sm hover:opacity-80 disabled:opacity-50"
        >
          {status === "sending" ? "Sending..." : "Send magic link"}
        </button>

        {message ? (
          <p className="text-sm opacity-80" aria-live="polite">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
