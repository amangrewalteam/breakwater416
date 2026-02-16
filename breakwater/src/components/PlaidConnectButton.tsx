"use client";

import { useEffect, useMemo, useState } from "react";
import { ink, line } from "@/lib/style";

declare global {
  interface Window {
    Plaid: any;
  }
}

export default function PlaidConnectButton({
  onConnected,
}: {
  onConnected: () => Promise<void> | void;
}) {
  const [ready, setReady] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    // Load Plaid Link script
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.body.appendChild(s);
    return () => {
      document.body.removeChild(s);
    };
  }, []);

  useEffect(() => {
    async function getLinkToken() {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const data = await res.json();
      setLinkToken(data.link_token);
    }
    getLinkToken();
  }, []);

  const canOpen = ready && !!linkToken;

  const open = useMemo(() => {
    if (!canOpen) return null;
    return () => {
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (public_token: string) => {
          await fetch("/api/plaid/exchange-public-token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ public_token }),
          });
          await onConnected();
        },
      });
      handler.open();
    };
  }, [canOpen, linkToken, onConnected]);

  return (
    <button
      onClick={() => open?.()}
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
  );
}
