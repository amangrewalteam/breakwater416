"use client";

import React, { useEffect, useMemo, useState } from "react";
import { detectSubscriptions, Transaction } from "@/lib/subscriptionDetector";

type StoredSubscription = {
  id: string;
  name: string;
  normalized: string;
  amount: number;
  cadence: "monthly" | "yearly";
  annualCost: number;
  lastSeen?: string;
  occurrences?: number;
  status: "suggested" | "confirmed" | "ignored";
  category?: string;
  updatedAt: string;
};

const IVORY = "#F6F3EE";
const INK = "rgba(20, 16, 12, 0.86)";
const MUTED = "rgba(20, 16, 12, 0.62)";
const BORDER = "rgba(20, 16, 12, 0.14)";
const CARD_BG = "rgba(255, 255, 255, 0.36)";

function currency(n: number) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

// simple stable id for MVP (good enough for Phase 2)
function stableId(normalizedName: string, cadence: string, amount: number) {
  const amt = Math.round(amount * 100);
  return `${normalizedName}::${cadence}::${amt}`;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subs, setSubs] = useState<StoredSubscription[]>([]);

  async function refreshSubsFromStore() {
    const r = await fetch("/api/subscriptions", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to load subscriptions");
    setSubs(Array.isArray(data) ? data : data?.subscriptions ?? data);
  }

  async function syncDetectedToStore(detected: ReturnType<typeof detectSubscriptions>) {
    // Convert detected → StoredSubscription suggestions
    const suggestions: StoredSubscription[] = detected.map((d: any) => {
      const normalized = (d.name || "").trim().toUpperCase();
      const id = stableId(normalized, d.cadence, d.amount);

      return {
        id,
        name: d.name,
        normalized,
        amount: d.amount,
        cadence: d.cadence,
        annualCost: d.annualCost,
        lastSeen: d.lastSeen,
        occurrences: d.occurrences,
        status: "suggested",
        category: undefined,
        updatedAt: new Date().toISOString(),
      };
    });

    const r = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestions }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to sync subscriptions");

    // After sync, load store state (includes preserved statuses)
    await refreshSubsFromStore();
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1) fetch transactions
        const tr = await fetch("/api/transactions", { cache: "no-store" });
        const txData = await tr.json();

        if (!tr.ok) {
          throw new Error(txData?.error || "Failed to fetch transactions");
        }
        if (!Array.isArray(txData)) {
          throw new Error("Unexpected response from /api/transactions");
        }

        if (!alive) return;
        setTransactions(txData as Transaction[]);

        // 2) detect subscriptions
        const detected = detectSubscriptions(txData as Transaction[]);

        // 3) sync suggestions to store (does not overwrite confirmed/ignored)
        await syncDetectedToStore(detected);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmed = useMemo(
    () => subs.filter((s) => s.status === "confirmed").sort((a, b) => b.annualCost - a.annualCost),
    [subs]
  );

  const suggested = useMemo(
    () => subs.filter((s) => s.status === "suggested").sort((a, b) => b.annualCost - a.annualCost),
    [subs]
  );

  const monthlyTotal = useMemo(() => {
    return confirmed.reduce((sum, s) => {
      if (s.cadence === "monthly") return sum + s.amount;
      return sum + s.annualCost / 12;
    }, 0);
  }, [confirmed]);

  const annualTotal = useMemo(() => {
    return confirmed.reduce((sum, s) => sum + s.annualCost, 0);
  }, [confirmed]);

  async function patchSub(id: string, patch: any) {
    const r = await fetch("/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to update subscription");
    await refreshSubsFromStore();
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: IVORY,
      color: INK,
      padding: "40px 24px",
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    wrap: { maxWidth: 980, margin: "0 auto" },
    header: { marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` },
    h1: { margin: 0, fontSize: 34, lineHeight: "40px", fontWeight: 520, letterSpacing: "-0.02em" },
    sub: { marginTop: 10, marginBottom: 0, fontSize: 14, color: MUTED, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    link: { color: "rgba(20,16,12,0.76)", textDecoration: "underline", textUnderlineOffset: 3 },
    grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 18, marginBottom: 16 },
    card: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 16px", boxShadow: "0 1px 0 rgba(20,16,12,0.03)" },
    k: { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.10em", color: MUTED, marginBottom: 10 },
    v: { fontSize: 22, fontWeight: 560, letterSpacing: "-0.01em" },

    panel: { background: "rgba(255, 255, 255, 0.22)", border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", marginTop: 14 },
    panelHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, background: "rgba(255, 255, 255, 0.18)" },
    panelTitle: { fontSize: 14, fontWeight: 650, margin: 0 },
    panelNote: { fontSize: 12, color: MUTED, margin: 0, whiteSpace: "nowrap" },
    list: { listStyle: "none", padding: 0, margin: 0 },
    row: { padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}` },
    name: { fontSize: 14, fontWeight: 650, margin: 0, color: INK },
    meta: { marginTop: 6, fontSize: 12, color: MUTED, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    badge: { fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.22)", color: "rgba(20,16,12,0.72)" },
    right: { textAlign: "right", minWidth: 200 },
    big: { fontSize: 14, fontWeight: 700, margin: 0, color: INK },
    small: { marginTop: 6, fontSize: 12, color: MUTED },

    actions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" },
    btn: { border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.26)", padding: "8px 12px", borderRadius: 9999, cursor: "pointer", fontSize: 13, color: INK },
    btnGhost: { border: `1px solid ${BORDER}`, background: "transparent", padding: "8px 12px", borderRadius: 9999, cursor: "pointer", fontSize: 13, color: "rgba(20,16,12,0.74)" },

    notice: { background: "rgba(255,255,255,0.22)", border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 16px", fontSize: 14, color: MUTED },
    errorText: { marginTop: 8, marginBottom: 0, color: "rgba(155,28,28,0.9)" },

    debug: { marginTop: 14, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "14px 16px", background: "rgba(255, 255, 255, 0.20)" },
    summary: { cursor: "pointer", fontWeight: 700, fontSize: 14 },
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
  };

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Dashboard</h1>
          <p style={styles.sub}>
            <span style={{ opacity: 0.85 }}>Subscriptions are now persisted.</span>
            <a href="/subscriptions" style={styles.link}>Manage all subscriptions</a>
          </p>

          <div style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.k}>Confirmed Monthly</div>
              <div style={styles.v}>{currency(monthlyTotal)}</div>
            </div>
            <div style={styles.card}>
              <div style={styles.k}>Confirmed Annual Burn</div>
              <div style={styles.v}>{currency(annualTotal)}</div>
            </div>
            <div style={styles.card}>
              <div style={styles.k}>Confirmed</div>
              <div style={styles.v}>{confirmed.length}</div>
            </div>
          </div>
        </header>

        {loading ? (
          <div style={styles.notice}>Loading…</div>
        ) : error ? (
          <div style={styles.notice}>
            <div style={{ fontWeight: 800, color: INK }}>Couldn’t load</div>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.btn} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <section style={styles.panel}>
              <div style={styles.panelHead}>
                <p style={styles.panelTitle}>Confirmed</p>
                <p style={styles.panelNote}>Counts toward totals</p>
              </div>

              {confirmed.length === 0 ? (
                <div style={{ padding: "16px", color: MUTED }}>
                  No confirmed subscriptions yet — confirm a few suggestions below.
                </div>
              ) : (
                <ul style={styles.list}>
                  {confirmed.map((s, idx) => (
                    <li
                      key={s.id}
                      style={{
                        ...styles.row,
                        borderBottom: idx === confirmed.length - 1 ? "none" : `1px solid ${BORDER}`,
                      }}
                    >
                      <div>
                        <p style={styles.name}>{s.name}</p>
                        <div style={styles.meta}>
                          <span>{currency(s.amount)} / {s.cadence}</span>
                          {s.category ? <span style={styles.badge}>{s.category}</span> : null}
                          {typeof s.occurrences === "number" ? (
                            <span style={styles.badge}>{s.occurrences}×</span>
                          ) : null}
                        </div>
                      </div>

                      <div style={styles.right}>
                        <p style={styles.big}>{currency(s.annualCost)}</p>
                        <div style={styles.small}>per year</div>
                        <div style={styles.actions}>
                          <button
                            style={styles.btnGhost}
                            onClick={() => patchSub(s.id, { status: "ignored" })}
                          >
                            Ignore
                          </button>
                          <a href="/subscriptions" style={{ ...styles.btn, textDecoration: "none", display: "inline-block" }}>
                            Edit
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={styles.panel}>
              <div style={styles.panelHead}>
                <p style={styles.panelTitle}>Suggested</p>
                <p style={styles.panelNote}>Detected from transactions</p>
              </div>

              {suggested.length === 0 ? (
                <div style={{ padding: "16px", color: MUTED }}>
                  No suggested subscriptions right now.
                </div>
              ) : (
                <ul style={styles.list}>
                  {suggested.map((s, idx) => (
                    <li
                      key={s.id}
                      style={{
                        ...styles.row,
                        borderBottom: idx === suggested.length - 1 ? "none" : `1px solid ${BORDER}`,
                      }}
                    >
                      <div>
                        <p style={styles.name}>{s.name}</p>
                        <div style={styles.meta}>
                          <span>{currency(s.amount)} / {s.cadence}</span>
                          {typeof s.occurrences === "number" ? (
                            <span style={styles.badge}>{s.occurrences}×</span>
                          ) : null}
                        </div>
                      </div>

                      <div style={styles.right}>
                        <p style={styles.big}>{currency(s.annualCost)}</p>
                        <div style={styles.small}>per year</div>

                        <div style={styles.actions}>
                          <button
                            style={styles.btn}
                            onClick={() => patchSub(s.id, { status: "confirmed" })}
                          >
                            Confirm
                          </button>
                          <button
                            style={styles.btnGhost}
                            onClick={() => patchSub(s.id, { status: "ignored" })}
                          >
                            Ignore
                          </button>
                          <a href="/subscriptions" style={{ ...styles.btnGhost, textDecoration: "none", display: "inline-block" }}>
                            Manage
                          </a>
                        </div>
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

                <div style={{ marginTop: 14, fontSize: 12, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
