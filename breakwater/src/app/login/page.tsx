"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";
import { useRouter } from "next/navigation";

const COOLDOWN_SECONDS = 60;

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function setDevCookie() {
  // cookie visible to the whole site
  document.cookie = `bw_dev_auth=1; path=/; max-age=${60 * 60 * 24}`;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const secondsLeft = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  }, [cooldownUntil, now]);

  const canSend = email.trim().length > 3 && secondsLeft === 0;

  async function sendLink() {
    if (!canSend) return;

    setErr(null);
    setSent(false);
    setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many")) {
        setErr(
          "Too many links requested. Use your most recent email, or try again in a few minutes."
        );
        return;
      }
      setErr(error.message);
      return;
    }

    setSent(true);
  }

  function continueDev() {
    localStorage.setItem("bw_dev_auth", "1");
    setDevCookie();
    router.push("/onboarding");
  }

  return (
    <Shell title="Enter" subtitle="We’ll send a quiet link to your email.">
      <div style={{ maxWidth: 520, display: "grid", gap: 12 }}>
        <input
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErr(null);
          }}
          placeholder="you@domain.com"
          inputMode="email"
          autoComplete="email"
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
          disabled={!canSend}
          style={{
            padding: "12px 14px",
            borderRadius: 999,
            border: `1px solid ${line}`,
            background: "rgba(255,255,255,0.25)",
            color: ink,
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {secondsLeft > 0 ? `Send link (in ${secondsLeft}s)` : "Send link"}
        </button>

        {isDev() ? (
          <button
            onClick={continueDev}
            style={{
              padding: "12px 14px",
              borderRadius: 999,
              border: `1px solid ${line}`,
              background: "rgba(255,255,255,0.18)",
              color: ink,
              cursor: "pointer",
            }}
          >
            Continue (dev)
          </button>
        ) : null}

        {sent ? (
          <div style={{ color: inkSoft }}>
            Sent. Open the newest email and click the link.
          </div>
        ) : null}

        {err ? <div style={{ color: "rgba(140,40,40,0.9)" }}>{err}</div> : null}

        {secondsLeft > 0 && !err ? (
          <div style={{ color: inkSoft }}>
            To avoid throttling, we’ll let you request another link in {secondsLeft}s.
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
