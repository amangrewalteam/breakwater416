"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

const IVORY = "#F6F3EE";

export default function ConnectPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      setStatus("Preparing link…");

      const res = await fetch("/api/create-link-token", { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setStatus(json?.error || "Could not create link token");
        return;
      }

      setLinkToken(json.link_token);
      setStatus("");
    })();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setStatus("Saving connection…");

      const res = await fetch("/api/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token,
          institution_name: metadata?.institution?.name ?? null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatus(json?.error || "Could not save connection");
        return;
      }

      // Optional: sync immediately so dashboard can populate
      setStatus("Syncing…");
      await fetch("/api/transactions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: json.item_id }),
      }).catch(() => {});

      // Optional: detect subscriptions immediately
      setStatus("Detecting subscriptions…");
      await fetch("/api/subscriptions", { method: "POST" }).catch(() => {});

      setStatus("Connected.");
      router.push("/dashboard");
    },
  });

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
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 44, margin: 0, letterSpacing: "-0.02em" }}>
          Connect a bank
        </h1>
        <p style={{ marginTop: 10, opacity: 0.75 }}>
          Secure connection via Plaid.
        </p>

        <div style={{ marginTop: 22 }}>
          <button
            onClick={() => open()}
            disabled={!ready}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.18)",
              background: "rgba(0,0,0,0.02)",
              cursor: ready ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {ready ? "Connect" : "Loading…"}
          </button>

          {status ? (
            <p style={{ marginTop: 14, opacity: 0.8 }}>{status}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
