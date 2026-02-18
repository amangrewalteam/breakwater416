// src/app/subscriptions/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { ink, inkSoft, line } from "@/lib/style";

type StoredSubscription = {
  id: string;
  name: string;
  normalized?: string;
  amount: number;
  cadence: "monthly" | "yearly";
  annualCost: number;
  lastSeen?: string;
  occurrences?: number;
  status: "confirmed" | "ignored" | "needs_review";
  category?: string;
  confidence?: "high" | "med" | "low";
  needsReview?: boolean;
  reason?: string;
  updatedAt?: string;
};

type FilterMode = "all" | "review" | "confirmed" | "ignored";

function fmtMoney(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function cadenceLabel(s: StoredSubscription) {
  if (s.cadence === "monthly") return `${fmtMoney(s.amount)} / monthly`;
  return `${fmtMoney(s.amount)} / yearly`;
}

function annualLabel(s: StoredSubscription) {
  return `${fmtMoney(s.annualCost)} per year`;
}

function statusLabel(s: StoredSubscription) {
  if (s.status === "confirmed") return "Confirmed";
  if (s.status === "ignored") return "Ignored";
  return "Needs review";
}

function statusPillStyle(s: StoredSubscription) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${line}`,
    fontSize: 12,
    color: ink,
    background: "rgba(255,255,255,0.28)",
  } as const;

  if (s.status === "needs_review") {
    return { ...base, background: "rgba(140,40,40,0.08)", border: "1px solid rgba(140,40,40,0.22)" };
  }
  if (s.status === "ignored") {
    return { ...base, opacity: 0.7 };
  }
  return base;
}

export default function SubscriptionsPage() {
  const router = useRouter();

  const [subs, setSubs] = useState<StoredSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [hideIgnored, setHideIgnored] = useState(true);

  const needsReviewCount = useMemo(() => {
    return subs.filter((s) => s.status === "needs_review" || s.needsReview === true).length;
  }, [subs]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return subs
      .filter((s) => {
        if (hideIgnored && s.status === "ignored") return false;

        if (filter === "review") return s.status === "needs_review" || s.needsReview === true;
        if (filter === "confirmed") return s.status === "confirmed";
        if (filter === "ignored") return s.status === "ignored";

        return true;
      })
      .filter((s) => {
        if (!query) return true;
        return (
          (s.name || "").toLowerCase().includes(query) ||
          (s.normalized || "").toLowerCase().includes(query) ||
          (s.category || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (b.annualCost || 0) - (a.annualCost || 0));
  }, [subs, q, filter, hideIgnored]);

  const goLogin = useCallback(() => {
    router.replace(`/login?next=${encodeURIComponent("/subscriptions")}`);
  }, [router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);

      const r = await fetch("/api/subscriptions", { cache: "no-store" });

      // If auth is missing/expired, do NOT throw a runtime error page — route to login.
      if (r.status === 401 || r.status === 403) {
        goLogin();
        return;
      }

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        const msg =
          (data && (data.error || data.message)) || "Failed to load subscriptions";
        throw new Error(msg);
      }

      // API sometimes returns array, sometimes { subscriptions: [...] }
      const list = Array.isArray(data) ? data : data?.subscriptions ?? data;
      setSubs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [goLogin]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, patchObj: Partial<StoredSubscription>) {
    try {
      setErr(null);

      const r = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: patchObj }),
      });

      if (r.status === 401 || r.status === 403) {
        goLogin();
        return;
      }

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error((data && (data.error || data.message)) || "Update failed");
      }

      const updated: StoredSubscription | null = data?.subscription ?? null;
      if (!updated) return;

      setSubs((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    }
  }

  const pill = (active: boolean) =>
    ({
      padding: "8px 12px",
      borderRadius: 999,
      border: `1px solid ${line}`,
      background: active ? "rgba(20,16,12,0.06)" : "rgba(255,255,255,0.18)",
      color: ink,
      cursor: "pointer",
      fontSize: 13,
      whiteSpace: "nowrap",
    } as const);

  return (
    <Shell
      title="Subscriptions"
      subtitle={
        <span style={{ color: inkSoft }}>
          Needs review: <b style={{ color: ink }}>{needsReviewCount}</b>{" "}
          <span style={{ padding: "0 10px" }}>·</span>
          <Link href="/dashboard" style={{ color: ink, textDecoration: "underline" }}>
            Back to dashboard
          </Link>
        </span>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {/* Controls */}
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1fr",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subscriptions…"
            style={{
              padding: "12px 14px",
              borderRadius: 999,
              border: `1px solid ${line}`,
              background: "rgba(255,255,255,0.35)",
              color: ink,
              outline: "none",
              width: "100%",
            }}
          />

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <button style={pill(filter === "all")} onClick={() => setFilter("all")}>
              All items
            </button>
            <button style={pill(hideIgnored)} onClick={() => setHideIgnored((v) => !v)}>
              {hideIgnored ? "Hide ignored" : "Show ignored"}
            </button>
            <button
              style={{
                ...pill(false),
                border: "1px solid rgba(20,16,12,0.28)",
                background: "rgba(255,255,255,0.24)",
              }}
              onClick={load}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Error (calm, non-crashy) */}
        {err ? (
          <div
            style={{
              border: `1px solid rgba(140,40,40,0.22)`,
              background: "rgba(140,40,40,0.06)",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: ink }}>Couldn’t load</div>
            <div style={{ color: "rgba(140,40,40,0.9)" }}>{err}</div>
          </div>
        ) : null}

        {/* List */}
        <div
          style={{
            border: `1px solid ${line}`,
            borderRadius: 18,
            overflow: "hidden",
            background: "rgba(255,255,255,0.16)",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${line}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div style={{ fontWeight: 700, color: ink }}>Recurring items</div>
            <div style={{ color: inkSoft, fontSize: 13 }}>Based on transaction patterns</div>
          </div>

          {loading ? (
            <div style={{ padding: 16, color: inkSoft }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, color: inkSoft }}>
              No subscriptions detected yet. This MVP logic looks for merchants with at least 3 similar charges.
            </div>
          ) : (
            <div>
              {filtered.map((s) => (
                <div
                  key={`${s.id}`}
                  style={{
                    padding: "14px 16px",
                    borderTop: `1px solid ${line}`,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: ink, lineHeight: 1.2 }}>
                        {s.name}
                      </div>
                      <div style={{ color: inkSoft, fontSize: 13, marginTop: 4 }}>
                        {cadenceLabel(s)}{" "}
                        <span style={{ padding: "0 8px" }}>·</span>
                        {annualLabel(s)}
                        {s.category ? (
                          <>
                            <span style={{ padding: "0 8px" }}>·</span>
                            {s.category}
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={statusPillStyle(s)}>{statusLabel(s)}</div>
                      <div style={{ color: inkSoft, fontSize: 13, marginTop: 6 }}>
                        {fmtMoney(s.annualCost)}
                        <span style={{ marginLeft: 6 }}>per year</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() =>
                        patch(s.id, { status: "confirmed", needsReview: false })
                      }
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${line}`,
                        background: "rgba(20,16,12,0.06)",
                        color: ink,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Confirm
                    </button>

                    <button
                      onClick={() => patch(s.id, { status: "ignored", needsReview: false })}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${line}`,
                        background: "rgba(255,255,255,0.18)",
                        color: ink,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Ignore
                    </button>

                    <button
                      onClick={() => patch(s.id, { status: "needs_review", needsReview: true })}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid rgba(140,40,40,0.22)`,
                        background: "rgba(140,40,40,0.06)",
                        color: ink,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Needs review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Debug (optional but handy) */}
        <details
          style={{
            border: `1px solid ${line}`,
            borderRadius: 18,
            padding: 14,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          <summary style={{ cursor: "pointer", color: ink, fontWeight: 700 }}>
            Debug
          </summary>
          <div style={{ marginTop: 10, color: inkSoft, fontSize: 13 }}>
            If you ever see a load error, open{" "}
            <a href="/api/subscriptions" style={{ color: ink, textDecoration: "underline" }}>
              /api/subscriptions
            </a>{" "}
            to view the raw response (auth errors will redirect you to login).
          </div>
        </details>
      </div>
    </Shell>
  );
}
