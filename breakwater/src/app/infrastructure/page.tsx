"use client";

import React, { useEffect, useMemo, useState } from "react";

type Confidence = "high" | "med" | "low";

type MerchantNode = {
  id: string;
  label: string;
  type: "merchant";
  category?: string;
  annualCost?: number;
  cadence?: "monthly" | "yearly";
  amount?: number;
  confidence?: Confidence;
  needsReview?: boolean;
};

type Cluster = {
  category: string;
  totalAnnual: number;
  count: number;
  merchants: MerchantNode[];
};

type InfraResponse = {
  totalAnnual: number;
  clusters: Cluster[];
  model: string;
};

const IVORY = "#F6F3EE";
const INK = "rgba(20, 16, 12, 0.86)";
const MUTED = "rgba(20, 16, 12, 0.62)";
const BORDER = "rgba(20, 16, 12, 0.14)";
const CARD_BG = "rgba(255, 255, 255, 0.34)";

function currency(n: number) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Phase 3.4 placeholder (until we wire true rails)
// We “guess” rail by name keywords—purely aesthetic, not truth.
function guessRail(name: string): "Card" | "ACH" | "Wallet" | "Unknown" {
  const n = name.toLowerCase();
  if (n.includes("paypal") || n.includes("apple pay") || n.includes("google pay")) return "Wallet";
  if (n.includes("ach") || n.includes("transfer") || n.includes("deposit")) return "ACH";
  return "Card";
}

export default function InfrastructurePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InfraResponse | null>(null);

  const [showNeedsReview, setShowNeedsReview] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const r = await fetch("/api/infrastructure", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load infrastructure map");

        if (!alive) return;
        setData(j as InfraResponse);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Something went wrong");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const clusters = useMemo(() => {
    if (!data?.clusters) return [];
    return data.clusters.map((c) => {
      const merchants = showNeedsReview
        ? c.merchants
        : c.merchants.filter((m) => !m.needsReview);
      return { ...c, merchants };
    });
  }, [data, showNeedsReview]);

  const maxClusterAnnual = useMemo(() => {
    return clusters.reduce((m, c) => Math.max(m, c.totalAnnual || 0), 0);
  }, [clusters]);

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: IVORY,
      color: INK,
      padding: "40px 24px",
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    wrap: { maxWidth: 1100, margin: "0 auto" },
    header: { marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` },
    h1: { margin: 0, fontSize: 34, lineHeight: "40px", fontWeight: 520, letterSpacing: "-0.02em" },
    sub: { marginTop: 10, marginBottom: 0, fontSize: 14, color: MUTED, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
    link: { color: "rgba(20,16,12,0.76)", textDecoration: "underline", textUnderlineOffset: 3 },

    controls: { marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
    btn: { border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.26)", padding: "10px 14px", borderRadius: 9999, cursor: "pointer", fontSize: 13, color: INK, fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif' },
    btnGhost: { border: `1px solid ${BORDER}`, background: "transparent", padding: "10px 14px", borderRadius: 9999, cursor: "pointer", fontSize: 13, color: "rgba(20,16,12,0.74)", fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif' },

    notice: { background: "rgba(255,255,255,0.22)", border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 16px", fontSize: 14, color: MUTED },
    errorText: { marginTop: 8, marginBottom: 0, color: "rgba(155,28,28,0.9)" },

    grid: { marginTop: 18, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 },

    cluster: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 22, overflow: "hidden" },
    clusterHead: { padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.18)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" },
    clusterTitle: { margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: "0.02em" },
    clusterMeta: { margin: 0, fontSize: 12, color: MUTED, whiteSpace: "nowrap" },

    clusterBody: { padding: 14, display: "grid", gap: 10 },
    merchants: { display: "flex", gap: 10, flexWrap: "wrap" },

    chip: {
      borderRadius: 9999,
      border: `1px solid ${BORDER}`,
      background: "rgba(255,255,255,0.26)",
      padding: "10px 12px",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: "default",
      boxShadow: "0 1px 0 rgba(20,16,12,0.03)",
      maxWidth: "100%",
    },
    chipName: { fontSize: 13, fontWeight: 750, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 },
    chipMeta: { fontSize: 12, color: MUTED, whiteSpace: "nowrap" },

    pill: { fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.22)", color: "rgba(20,16,12,0.72)" },
    pillHot: { fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: `1px solid rgba(155,28,28,0.25)`, background: "rgba(155,28,28,0.08)", color: "rgba(155,28,28,0.90)" },

    barTrack: { height: 10, borderRadius: 9999, border: `1px solid ${BORDER}`, background: "rgba(20,16,12,0.06)", overflow: "hidden" },
    barFill: { height: "100%", borderRadius: 9999, background: "rgba(20,16,12,0.18)" },

    footerNote: { marginTop: 14, fontSize: 12, color: MUTED },
  };

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Infrastructure</h1>
          <p style={styles.sub}>
            <span style={{ opacity: 0.85 }}>Confirmed subscriptions, grouped into systems.</span>
            <a href="/dashboard" style={styles.link}>Dashboard</a>
            <a href="/subscriptions" style={styles.link}>Subscriptions</a>
          </p>

          <div style={styles.controls}>
            <button
              style={showNeedsReview ? styles.btn : styles.btnGhost}
              onClick={() => setShowNeedsReview((v) => !v)}
            >
              {showNeedsReview ? "Showing needs review" : "Hide needs review"}
            </button>

            <span style={{ fontSize: 13, color: MUTED }}>
              Total annual burn:{" "}
              <span style={{ color: INK, fontWeight: 800 }}>
                {currency(data?.totalAnnual || 0)}
              </span>
            </span>
          </div>
        </header>

        {loading ? (
          <div style={styles.notice}>Loading…</div>
        ) : error ? (
          <div style={styles.notice}>
            <div style={{ fontWeight: 800, color: INK }}>Couldn’t load</div>
            <p style={styles.errorText}>{error}</p>
          </div>
        ) : !data ? (
          <div style={styles.notice}>No data yet.</div>
        ) : clusters.length === 0 ? (
          <div style={styles.notice}>
            Confirm a few subscriptions first — the map is built from confirmed items.
          </div>
        ) : (
          <>
            <div style={styles.grid}>
              {clusters.map((c) => {
                const widthPct =
                  maxClusterAnnual > 0
                    ? clamp((c.totalAnnual / maxClusterAnnual) * 100, 6, 100)
                    : 6;

                return (
                  <section key={c.category} style={styles.cluster}>
                    <div style={styles.clusterHead}>
                      <p style={styles.clusterTitle}>{c.category}</p>
                      <p style={styles.clusterMeta}>
                        {currency(c.totalAnnual)} · {c.count} {c.count === 1 ? "merchant" : "merchants"}
                      </p>
                    </div>

                    <div style={styles.clusterBody}>
                      <div style={styles.barTrack} aria-hidden>
                        <div style={{ ...styles.barFill, width: `${widthPct}%` }} />
                      </div>

                      <div style={styles.merchants}>
                        {c.merchants.map((m) => {
                          const rail = guessRail(m.label);
                          const size = clamp(
                            Math.round(((m.annualCost || 0) / (c.totalAnnual || 1)) * 12) + 10,
                            10,
                            18
                          );

                          return (
                            <div
                              key={m.id}
                              style={{
                                ...styles.chip,
                                padding: `${size}px ${size + 2}px`,
                              }}
                              title={`${m.label} · ${currency(m.annualCost || 0)} / yr`}
                            >
                              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                                <div style={styles.chipName}>{m.label}</div>
                                <div style={styles.chipMeta}>
                                  {currency(m.annualCost || 0)}/yr · {rail}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {m.needsReview ? <span style={styles.pillHot}>Needs review</span> : null}
                                {m.confidence ? <span style={styles.pill}>{m.confidence}</span> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>

            <div style={styles.footerNote}>
              v1 map model: category clusters from confirmed subscriptions. “Rail” is a placeholder guess for now —
              we’ll wire real rails from Plaid metadata when we move storage to Supabase.
            </div>
          </>
        )}
      </div>
    </main>
  );
}
