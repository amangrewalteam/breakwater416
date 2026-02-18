"use client";

import React, { useEffect, useMemo, useState } from "react";
import { detectSubscriptions } from "@/lib/subscriptionDetector";

type Tx = {
  name: string;
  amount: number;
  date: string;
};

type Subscription = {
  name: string;
  amount: number;
  cadence: "monthly" | "yearly";
  annualCost: number;
};

const IVORY = "#F6F3EE";
const INK = "rgba(20, 16, 12, 0.86)";
const MUTED = "rgba(20, 16, 12, 0.62)";
const BORDER = "rgba(20, 16, 12, 0.14)";
const CARD_BG = "rgba(255, 255, 255, 0.36)";

function currency(n: number) {
  try {
    // Keep CAD formatting; if your accounts are US, we can switch later.
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/transactions", { method: "GET" });
        const raw = await res.text();

        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            `Non-JSON response from /api/transactions (HTTP ${res.status}). First 120 chars: ${raw.slice(
              0,
              120
            )}`
          );
        }

        if (!res.ok) {
          const msg =
            typeof data?.error === "string"
              ? data.error
              : "Failed to fetch transactions";
          throw new Error(msg);
        }

        if (!Array.isArray(data)) {
          throw new Error("Unexpected response shape from /api/transactions");
        }

        if (!alive) return;
        setTransactions(data as Tx[]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Something went wrong");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const subscriptions: Subscription[] = useMemo(() => {
    return detectSubscriptions(transactions);
  }, [transactions]);

  const monthlyTotal = useMemo(() => {
    return subscriptions.reduce((sum, s) => {
      if (s.cadence === "monthly") return sum + s.amount;
      return sum + s.annualCost / 12;
    }, 0);
  }, [subscriptions]);

  const annualTotal = useMemo(() => {
    return subscriptions.reduce((sum, s) => sum + s.annualCost, 0);
  }, [subscriptions]);

  const sorted = useMemo(() => {
    return subscriptions.slice().sort((a, b) => b.annualCost - a.annualCost);
  }, [subscriptions]);

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: IVORY,
      color: INK,
      padding: "40px 24px",
      fontFamily:
        'ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    wrap: {
      maxWidth: 980,
      margin: "0 auto",
    },
    header: {
      marginBottom: 22,
      paddingBottom: 18,
      borderBottom: `1px solid ${BORDER}`,
    },
    h1: {
      margin: 0,
      fontSize: 34,
      lineHeight: "40px",
      fontWeight: 520,
      letterSpacing: "-0.02em",
    },
    sub: {
      marginTop: 10,
      marginBottom: 0,
      fontSize: 14,
      color: MUTED,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 12,
      marginTop: 18,
      marginBottom: 16,
    },
    card: {
      background: CARD_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 18,
      padding: "16px 16px",
      boxShadow: "0 1px 0 rgba(20,16,12,0.03)",
    },
    k: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.10em",
      color: MUTED,
      marginBottom: 10,
    },
    v: {
      fontSize: 22,
      fontWeight: 560,
      letterSpacing: "-0.01em",
    },
    panel: {
      background: "rgba(255, 255, 255, 0.22)",
      border: `1px solid ${BORDER}`,
      borderRadius: 18,
      overflow: "hidden",
    },
    panelHead: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12,
      padding: "14px 16px",
      borderBottom: `1px solid ${BORDER}`,
      background: "rgba(255, 255, 255, 0.18)",
    },
    panelTitle: {
      fontSize: 14,
      fontWeight: 600,
      margin: 0,
    },
    panelNote: {
      fontSize: 12,
      color: MUTED,
      margin: 0,
      whiteSpace: "nowrap",
    },
    list: {
      listStyle: "none",
      padding: 0,
      margin: 0,
    },
    row: {
      padding: "14px 16px",
      display: "flex",
      justifyContent: "space-between",
      gap: 16,
      borderBottom: `1px solid ${BORDER}`,
    },
    left: {},
    name: {
      fontSize: 14,
      fontWeight: 600,
      margin: 0,
      color: INK,
    },
    meta: {
      marginTop: 6,
      fontSize: 12,
      color: MUTED,
    },
    right: {
      textAlign: "right",
      minWidth: 160,
    },
    big: {
      fontSize: 14,
      fontWeight: 650,
      margin: 0,
      color: INK,
    },
    small: {
      marginTop: 6,
      fontSize: 12,
      color: MUTED,
    },
    empty: {
      padding: "18px 16px",
      fontSize: 14,
      color: MUTED,
    },
    debug: {
      marginTop: 14,
      border: `1px solid ${BORDER}`,
      borderRadius: 18,
      padding: "14px 16px",
      background: "rgba(255, 255, 255, 0.20)",
    },
    summary: {
      cursor: "pointer",
      fontWeight: 650,
      fontSize: 14,
    },
    pre: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      border: `1px solid ${BORDER}`,
      background: "rgba(255,255,255,0.24)",
      maxHeight: 280,
      overflow: "auto",
      fontSize: 12,
      color: "rgba(20,16,12,0.78)",
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    notice: {
      ...({
        background: "rgba(255,255,255,0.22)",
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: "16px 16px",
        fontSize: 14,
        color: MUTED,
      } as React.CSSProperties),
    },
    errorTitle: { margin: 0, fontWeight: 700, color: INK },
    errorText: { marginTop: 8, marginBottom: 0, color: "rgba(155,28,28,0.9)" },
    retry: {
      marginTop: 12,
      border: `1px solid ${BORDER}`,
      background: "rgba(255,255,255,0.26)",
      padding: "10px 14px",
      borderRadius: 9999,
      cursor: "pointer",
      color: INK,
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
      fontSize: 14,
    },
  };

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Subscriptions</h1>
          <p style={styles.sub}>
            Detected recurring payments from your transactions.
          </p>

          <div style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.k}>Monthly Total</div>
              <div style={styles.v}>{currency(monthlyTotal)}</div>
            </div>
            <div style={styles.card}>
              <div style={styles.k}>Annual Burn</div>
              <div style={styles.v}>{currency(annualTotal)}</div>
            </div>
            <div style={styles.card}>
              <div style={styles.k}>Detected</div>
              <div style={styles.v}>{subscriptions.length}</div>
            </div>
          </div>
        </header>

        {loading ? (
          <div style={styles.notice}>Loading…</div>
        ) : error ? (
          <div style={styles.notice}>
            <p style={styles.errorTitle}>Couldn’t load subscriptions</p>
            <p style={styles.errorText}>{error}</p>
            <button
              style={styles.retry}
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <section style={styles.panel}>
              <div style={styles.panelHead}>
                <p style={styles.panelTitle}>Recurring items</p>
                <p style={styles.panelNote}>Based on transaction patterns</p>
              </div>

              {sorted.length === 0 ? (
                <div style={styles.empty}>
                  No subscriptions detected yet. This MVP logic looks for
                  merchants with at least 3 similar charges.
                </div>
              ) : (
                <ul style={styles.list}>
                  {sorted.map((s, idx) => (
                    <li
                      key={`${s.name}-${idx}`}
                      style={{
                        ...styles.row,
                        borderBottom:
                          idx === sorted.length - 1
                            ? "none"
                            : `1px solid ${BORDER}`,
                      }}
                    >
                      <div style={styles.left}>
                        <p style={styles.name}>{s.name}</p>
                        <div style={styles.meta}>
                          {currency(s.amount)} / {s.cadence}
                        </div>
                      </div>

                      <div style={styles.right}>
                        <p style={styles.big}>{currency(s.annualCost)}</p>
                        <div style={styles.small}>per year</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <details style={styles.debug}>
              <summary style={styles.summary}>Debug</summary>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Transactions loaded
                </div>
                <div style={{ marginTop: 6, fontSize: 14, color: INK }}>
                  {transactions.length}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    fontSize: 12,
                    color: MUTED,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  First few transactions
                </div>
                <pre style={styles.pre}>
                  {JSON.stringify(transactions.slice(0, 10), null, 2)}
                </pre>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
