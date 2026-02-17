"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { ink, inkSoft, line } from "@/lib/style";

type Props = {
  onConnected?: () => void | Promise<void>;
};

declare global {
  interface Window {
    Plaid?: any;
  }
}

export default function PlaidConnectButton({ onConnected }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  async function createLinkToken() {
    setError(null);
    setStatus("loading");

    const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
    const text = await res.text();

    if (!res.ok) {
      setStatus("error");
      setError(text || `Failed to create link token (HTTP ${res.status})`);
      return;
    }

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      setStatus("error");
      setError("create-link-token returned invalid JSON.");
      return;
    }

    if (!data?.link_token) {
      setStatus("error");
      setError(data?.error || "No link_token returned.");
      return;
    }

    setLinkToken(data.link_token);
    setStatus("ready");
  }

  useEffect(() => {
    createLinkToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canOpen = useMemo(() => {
    return Boolean(linkToken) && scriptReady && status === "ready" && typeof window !== "undefined";
  }, [linkToken, scriptReady, status]);

  async function exchangePublicToken(public_token: string) {
    const res = await fetch("/api/plaid/exchange-public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_token }),
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = text || `Token exchange failed (HTTP ${res.status})`;
      try {
        const parsed = JSON.parse(text);
        msg = parsed?.error || msg;
        if (parsed?.plaid?.error_message) msg = parsed.plaid.error_message;
      } catch {}
      throw new Error(msg);
    }

    return JSON.parse(text);
  }

  function open() {
    if (!canOpen) return;

    setError(null);

    const handler = window.Plaid?.create?.({
      token: linkToken,
      onSuccess: async (public_token: string) => {
        try {
          setStatus("loading");
          await exchangePublicToken(public_token);
          setStatus("ready");
          await onConnected?.();
        } catch (e: any) {
          setStatus("error");
          setError(e?.message || "Token exchange failed");
        }
      },
      onExit: (err: any) => {
        if (err) {
          setStatus("error");
          setError(err?.display_message || err?.error_message || "Plaid exited with an error.");
        }
      },
    });

    handler?.open?.();
  }

  return (
    <>
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <button
        onClick={open}
        disabled={!canOpen}
        style={{
          padding: "12px 14px",
          borderRadius: 999,
          border: `1px solid ${line}`,
          background: "rgba(255,255,255,0.25)",
          color: ink,
          cursor: canOpen ? "pointer" : "not-allowed",
          opacity: canOpen ? 1 : 0.6,
        }}
      >
        Connect your bank
      </button>

      <div style={{ color: inkSoft, fontSize: 12 }}>
        linkToken: {linkToken ? "yes" : "no"} · script: {scriptReady ? "ready" : "loading"} · status:{" "}
        {status}
      </div>

      {status === "error" && (
        <button
          onClick={createLinkToken}
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 999,
            border: `1px solid ${line}`,
            background: "transparent",
            color: ink,
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          Try again
        </button>
      )}

      {error ? (
        <div style={{ marginTop: 8, color: "rgba(140,40,40,0.9)" }}>{error}</div>
      ) : null}
    </>
  );
}
