"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

type Props = {
  onConnected?: () => void;
  label?: string;
};

type LinkTokenResp = { link_token: string } | { error: string };

export default function PlaidConnectButton({
  onConnected,
  label = "Connect your bank",
}: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);

  const fetchLinkToken = useCallback(async () => {
    try {
      setIsFetchingToken(true);
      setError(null);
      setStatusText("creating_link_token");

      const res = await fetch("/api/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const raw = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `Non-JSON response (HTTP ${res.status}). First 120 chars: ${raw.slice(
            0,
            120
          )}`
        );
      }

      if (!res.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : `Failed to create link token (HTTP ${res.status})`;
        throw new Error(msg);
      }

      if (!data?.link_token) {
        throw new Error("Missing link_token from /api/create-link-token");
      }

      setLinkToken(data.link_token);
      setStatusText("link_token_ready");
    } catch (e: any) {
      setLinkToken(null);
      setStatusText("error");
      setError(e?.message || "Failed to create link token");
    } finally {
      setIsFetchingToken(false);
    }
  }, []);

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  const onSuccess = useCallback(
    async (public_token: string) => {
      try {
        setError(null);
        setStatusText("exchanging_public_token");

        const res = await fetch("/api/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            typeof data?.error === "string"
              ? data.error
              : `Failed to exchange public token (HTTP ${res.status})`;
          throw new Error(msg);
        }

        setStatusText("connected");
        onConnected?.();
      } catch (e: any) {
        setStatusText("error");
        setError(e?.message || "Failed to exchange public token");
      }
    },
    [onConnected]
  );

  const config = useMemo(
    () => ({
      token: linkToken ?? "",
      onSuccess,
      onExit: (err: any) => {
        if (err) {
          setStatusText("error");
          setError(err?.display_message || err?.error_message || "Plaid exited");
        } else {
          setStatusText("exited");
        }
      },
    }),
    [linkToken, onSuccess]
  );

  const { open, ready, error: plaidHookError } = usePlaidLink(config);

  useEffect(() => {
    if (plaidHookError) {
      setStatusText("error");
      setError(plaidHookError?.message || "Plaid failed to initialize");
    }
  }, [plaidHookError]);

  const canOpen = ready && !!linkToken && !isFetchingToken;

  // ---- Inline styles so it still looks like a button even with global resets ----
  const buttonStyle: React.CSSProperties = {
    // protect against global `button { all: unset; }`
    appearance: "none",
    WebkitAppearance: "none",
    border: "1px solid rgba(20, 16, 12, 0.18)",
    background: canOpen
      ? "rgba(255, 255, 255, 0.40)"
      : "rgba(255, 255, 255, 0.22)",
    borderRadius: 9999,
    padding: "14px 20px",
    width: "100%",
    display: "block",
    textAlign: "center",
    cursor: canOpen ? "pointer" : "not-allowed",
    userSelect: "none",
    fontSize: 14,
    lineHeight: "20px",
    letterSpacing: "0.01em",
    color: "rgba(20, 16, 12, 0.78)",
    boxShadow: "0 1px 0 rgba(20, 16, 12, 0.04)",
    transition: "transform 120ms ease, background 160ms ease, border 160ms ease",
  };

  const buttonHoverStyle: React.CSSProperties = canOpen
    ? {
        background: "rgba(255, 255, 255, 0.55)",
        border: "1px solid rgba(20, 16, 12, 0.22)",
      }
    : {};

  const [isHover, setIsHover] = useState(false);

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => open()}
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        style={{ ...buttonStyle, ...(isHover ? buttonHoverStyle : {}) }}
      >
        {isFetchingToken ? "Preparing…" : label}
      </button>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        linkToken: {linkToken ? "yes" : "no"} · script:{" "}
        {ready ? "ready" : "loading"} · status: {statusText}
      </div>

      {(error || plaidHookError) && (
        <div style={{ marginTop: 10, fontSize: 14, color: "#9B1C1C" }}>
          {error || plaidHookError?.message}
        </div>
      )}

      {!linkToken && (
        <button
          type="button"
          onClick={fetchLinkToken}
          disabled={isFetchingToken}
          style={{
            marginTop: 14,
            appearance: "none",
            WebkitAppearance: "none",
            border: "1px solid rgba(20, 16, 12, 0.16)",
            background: "transparent",
            borderRadius: 9999,
            padding: "10px 16px",
            cursor: isFetchingToken ? "not-allowed" : "pointer",
            fontSize: 14,
            color: "rgba(20, 16, 12, 0.72)",
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
