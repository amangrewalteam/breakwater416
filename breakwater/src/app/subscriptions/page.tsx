"use client";

import React, { useEffect, useMemo, useState } from "react";

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

const CATEGORIES = [
  "",
  "SaaS",
  "Media",
  "Utilities",
  "Finance",
  "Health",
  "Home",
  "Travel",
  "Other",
];

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

export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subs, setSubs] = useState<StoredSubscription[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<StoredSubscription | null>(null);
  const [draft, setDraft] = useState<Partial<StoredSubscription>>({});

  async function load() {
    const r = await fetch("/api/subscriptions", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to load subscriptions");
    setSubs(Array.isArray(data) ? data : data?.subscriptions ?? data);
  }

  async function patchSub(id: string, patch: any) {
    const r = await fetch("/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to update subscription");
    await load();
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await load();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subs
      .filter((s) => (showIgnored ? true : s.status !== "ignored"))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      .sort((a, b) => b.annualCost - a.annualCost);
  }, [subs, showIgnored, query]);

  const grouped = useMemo(() => {
    const confirmed = filtered.filter((s) => s.status === "confirmed");
    const suggested = filtered.filter((s) => s.status === "suggested");
    const ignored = subs.filter((s) => s.status === "ignored").sort((a, b) => b.annualCost - a.annualCost);
    return { confirmed, suggested, ignored };
  }, [filtered, subs]);

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
    sub: { marginTop: 10, marginBottom: 0, fontSize: 14, color: MUTED, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
    link: { color: "rgba(20,16,12,0.76)", textDecoration: "underline", textUnderlineOffset: 3 },

    controls: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      gap: 10,
      alignItems: "center",
    },
    input: {
      width: "100%",
      border: `1px solid ${BORDER}`,
      borderRadius: 9999,
      padding: "10px 14px",
      background: "rgba(255,255,255,0.30)",
      outline: "none",
      fontSize: 14,
      color: INK,
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    btn: {
      border: `1px solid ${BORDER}`,
      background: "rgba(255,255,255,0.26)",
      padding: "10px 14px",
      borderRadius: 9999,
      cursor: "pointer",
      fontSize: 13,
      color: INK,
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
      whiteSpace: "nowrap",
    },
    btnGhost: {
      border: `1px solid ${BORDER}`,
      background: "transparent",
      padding: "10px 14px",
      borderRadius: 9999,
      cursor: "pointer",
      fontSize: 13,
      color: "rgba(20,16,12,0.74)",
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
      whiteSpace: "nowrap",
    },

    panel: { background: "rgba(255, 255, 255, 0.22)", border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", marginTop: 14 },
    panelHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, background: "rgba(255, 255, 255, 0.18)" },
    panelTitle: { fontSize: 14, fontWeight: 750, margin: 0 },
    panelNote: { fontSize: 12, color: MUTED, margin: 0, whiteSpace: "nowrap" },
    list: { listStyle: "none", padding: 0, margin: 0 },
    row: { padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}` },
    name: { fontSize: 14, fontWeight: 700, margin: 0, color: INK },
    meta: { marginTop: 6, fontSize: 12, color: MUTED, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
    badge: { fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.22)", color: "rgba(20,16,12,0.72)" },
    right: { textAlign: "right", minWidth: 240 },
    big: { fontSize: 14, fontWeight: 800, margin: 0, color: INK },
    small: { marginTop: 6, fontSize: 12, color: MUTED },
    actions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" },

    notice: { background: "rgba(255,255,255,0.22)", border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 16px", fontSize: 14, color: MUTED },
    errorText: { marginTop: 8, marginBottom: 0, color: "rgba(155,28,28,0.9)" },

    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(15, 12, 9, 0.24)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
    },
    modal: {
      width: "100%",
      maxWidth: 560,
      background: "rgba(246, 243, 238, 0.98)",
      border: `1px solid ${BORDER}`,
      borderRadius: 22,
      boxShadow: "0 18px 60px rgba(20,16,12,0.18)",
      overflow: "hidden",
    },
    modalHead: {
      padding: "14px 16px",
      borderBottom: `1px solid ${BORDER}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    modalTitle: { margin: 0, fontSize: 14, fontWeight: 800 },
    modalBody: { padding: 16, display: "grid", gap: 12 },
    field: { display: "grid", gap: 6 },
    label: { fontSize: 12, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" },
    select: {
      width: "100%",
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: "10px 12px",
      background: "rgba(255,255,255,0.35)",
      outline: "none",
      fontSize: 14,
      color: INK,
      fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    footer: {
      padding: 16,
      borderTop: `1px solid ${BORDER}`,
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      flexWrap: "wrap",
    },
  };

  const openEdit = (s: StoredSubscription) => {
    setEditing(s);
    setDraft({
      name: s.name,
      amount: s.amount,
      cadence: s.cadence,
      category: s.category || "",
      status: s.status,
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft({});
  };

  const saveEdit = async () => {
    if (!editing) return;

    const nextPatch: any = {};

    if (typeof draft.name === "string") nextPatch.name = draft.name.trim();
    if (typeof draft.amount === "number") nextPatch.amount = Number(draft.amount);
    if (draft.cadence === "monthly" || draft.cadence === "yearly") nextPatch.cadence = draft.cadence;
    if (typeof draft.category === "string") nextPatch.category = draft.category || undefined;
    if (draft.status === "suggested" || draft.status === "confirmed" || draft.status === "ignored") nextPatch.status = draft.status;

    await patchSub(editing.id, nextPatch);
    closeEdit();
  };

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Subscriptions</h1>
          <p style={styles.sub}>
            <span style={{ opacity: 0.85 }}>Confirm what’s real. Ignore what’s not.</span>
            <a href="/dashboard" style={styles.link}>Back to dashboard</a>
          </p>

          <div style={styles.controls}>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subscriptions…"
            />
            <button
              style={showIgnored ? styles.btn : styles.btnGhost}
              onClick={() => setShowIgnored((v) => !v)}
            >
              {showIgnored ? "Showing ignored" : "Hide ignored"}
            </button>
            <button
              style={styles.btn}
              onClick={async () => {
                try {
                  setLoading(true);
                  await load();
                } finally {
                  setLoading(false);
                }
              }}
            >
              Refresh
            </button>
          </div>
        </header>

        {loading ? (
          <div style={styles.notice}>Loading…</div>
        ) : error ? (
          <div style={styles.notice}>
            <div style={{ fontWeight: 800, color: INK }}>Couldn’t load</div>
            <p style={styles.errorText}>{error}</p>
          </div>
        ) : (
          <>
            <section style={styles.panel}>
              <div style={styles.panelHead}>
                <p style={styles.panelTitle}>Confirmed</p>
                <p style={styles.panelNote}>{grouped.confirmed.length}</p>
              </div>
              {grouped.confirmed.length === 0 ? (
                <div style={{ padding: "16px", color: MUTED }}>None confirmed yet.</div>
              ) : (
                <ul style={styles.list}>
                  {grouped.confirmed.map((s, idx) => (
                    <li
                      key={s.id}
                      style={{
                        ...styles.row,
                        borderBottom: idx === grouped.confirmed.length - 1 ? "none" : `1px solid ${BORDER}`,
                      }}
                    >
                      <div>
                        <p style={styles.name}>{s.name}</p>
                        <div style={styles.meta}>
                          <span>{currency(s.amount)} / {s.cadence}</span>
                          {s.category ? <span style={styles.badge}>{s.category}</span> : null}
                          {typeof s.occurrences === "number" ? <span style={styles.badge}>{s.occurrences}×</span> : null}
                        </div>
                      </div>
                      <div style={styles.right}>
                        <p style={styles.big}>{currency(s.annualCost)}</p>
                        <div style={styles.small}>per year</div>
                        <div style={styles.actions}>
                          <button style={styles.btnGhost} onClick={() => patchSub(s.id, { status: "ignored" })}>
                            Ignore
                          </button>
                          <button style={styles.btn} onClick={() => openEdit(s)}>
                            Edit
                          </button>
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
                <p style={styles.panelNote}>{grouped.suggested.length}</p>
              </div>
              {grouped.suggested.length === 0 ? (
                <div style={{ padding: "16px", color: MUTED }}>Nothing suggested right now.</div>
              ) : (
                <ul style={styles.list}>
                  {grouped.suggested.map((s, idx) => (
                    <li
                      key={s.id}
                      style={{
                        ...styles.row,
                        borderBottom: idx === grouped.suggested.length - 1 ? "none" : `1px solid ${BORDER}`,
                      }}
                    >
                      <div>
                        <p style={styles.name}>{s.name}</p>
                        <div style={styles.meta}>
                          <span>{currency(s.amount)} / {s.cadence}</span>
                          {typeof s.occurrences === "number" ? <span style={styles.badge}>{s.occurrences}×</span> : null}
                        </div>
                      </div>
                      <div style={styles.right}>
                        <p style={styles.big}>{currency(s.annualCost)}</p>
                        <div style={styles.small}>per year</div>
                        <div style={styles.actions}>
                          <button style={styles.btn} onClick={() => patchSub(s.id, { status: "confirmed" })}>
                            Confirm
                          </button>
                          <button style={styles.btnGhost} onClick={() => patchSub(s.id, { status: "ignored" })}>
                            Ignore
                          </button>
                          <button style={styles.btnGhost} onClick={() => openEdit(s)}>
                            Edit
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {showIgnored && (
              <section style={styles.panel}>
                <div style={styles.panelHead}>
                  <p style={styles.panelTitle}>Ignored</p>
                  <p style={styles.panelNote}>{grouped.ignored.length}</p>
                </div>

                {grouped.ignored.length === 0 ? (
                  <div style={{ padding: "16px", color: MUTED }}>No ignored items.</div>
                ) : (
                  <ul style={styles.list}>
                    {grouped.ignored.map((s, idx) => (
                      <li
                        key={s.id}
                        style={{
                          ...styles.row,
                          borderBottom: idx === grouped.ignored.length - 1 ? "none" : `1px solid ${BORDER}`,
                        }}
                      >
                        <div>
                          <p style={styles.name}>{s.name}</p>
                          <div style={styles.meta}>
                            <span>{currency(s.amount)} / {s.cadence}</span>
                            {s.category ? <span style={styles.badge}>{s.category}</span> : null}
                          </div>
                        </div>
                        <div style={styles.right}>
                          <p style={styles.big}>{currency(s.annualCost)}</p>
                          <div style={styles.small}>per year</div>
                          <div style={styles.actions}>
                            <button style={styles.btn} onClick={() => patchSub(s.id, { status: "suggested" })}>
                              Restore
                            </button>
                            <button style={styles.btnGhost} onClick={() => openEdit(s)}>
                              Edit
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {editing && (
        <div style={styles.overlay} onClick={closeEdit}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <p style={styles.modalTitle}>Edit subscription</p>
              <button style={styles.btnGhost} onClick={closeEdit}>Close</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.field}>
                <div style={styles.label}>Name</div>
                <input
                  style={styles.input}
                  value={String(draft.name ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Amount</div>
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={String(draft.amount ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.field}>
                  <div style={styles.label}>Cadence</div>
                  <select
                    style={styles.select}
                    value={(draft.cadence as any) ?? "monthly"}
                    onChange={(e) => setDraft((d) => ({ ...d, cadence: e.target.value as any }))}
                  >
                    <option value="monthly">monthly</option>
                    <option value="yearly">yearly</option>
                  </select>
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>Status</div>
                  <select
                    style={styles.select}
                    value={(draft.status as any) ?? "suggested"}
                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as any }))}
                  >
                    <option value="suggested">suggested</option>
                    <option value="confirmed">confirmed</option>
                    <option value="ignored">ignored</option>
                  </select>
                </div>
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Category</div>
                <select
                  style={styles.select}
                  value={String(draft.category ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === "" ? "—" : c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={styles.footer}>
              <button style={styles.btnGhost} onClick={closeEdit}>Cancel</button>
              <button style={styles.btn} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
