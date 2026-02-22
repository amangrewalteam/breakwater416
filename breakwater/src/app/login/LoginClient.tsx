"use client";

import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Hard-force the canonical app URL so magic links never point to vercel.app
const CANONICAL_ORIGIN = "https://app.breakwater.finance";

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
        // Force callback on the custom domain
        emailRedirectTo: `${CANONICAL_ORIGIN}/auth/callback`,
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

        {/* Tiny debug line — remove later */}
        <p className="text-xs opacity-60">
          Redirects to: {CANONICAL_ORIGIN}/auth/callback
        </p>
      </form>
    </div>
  );
}
