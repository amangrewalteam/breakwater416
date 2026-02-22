"use client";

import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function getOrigin() {
  // Prefer explicit env var (best for Vercel), fall back to window.origin in browser
  const env =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "";

  // NEXT_PUBLIC_VERCEL_URL sometimes comes without scheme
  if (env) {
    if (env.startsWith("http://") || env.startsWith("https://")) return env;
    return `https://${env}`;
  }

  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

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
    const origin = getOrigin();

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
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

      {status === "sent" ? (
        <div className="mt-6 text-sm opacity-80 space-y-2">
          <p>
            If you don’t see it, check spam or try again in a minute.
          </p>
        </div>
      ) : null}
    </div>
  );
}
