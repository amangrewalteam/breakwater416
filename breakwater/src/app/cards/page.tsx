// src/app/cards/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ink, inkSoft, line } from "@/lib/style";
import type { Card } from "@/lib/cardIssuer";

function fmtLimit(c: Card) {
  if (c.limitCents === null) return "No limit";
  return (c.limitCents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: c.currency,
  });
}

function statusColor(status: Card["status"]) {
  if (status === "active") return "rgba(30,120,60,0.82)";
  if (status === "paused") return "rgba(160,100,20,0.82)";
  return inkSoft;
}

function statusLabel(status: Card["status"]) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Cancelled";
}

function pill(label: string, color: string) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${line}`,
        fontSize: 11,
        letterSpacing: 0.2,
        color,
        background: "rgba(255,255,255,0.28)",
      }}
    >
      {label}
    </span>
  );
}

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // cardId currently in flight

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/cards");
      if (!res.ok) throw new Error(await res.text());
      setCards(await res.json());
    } catch (e: any) {
      setErr(e?.message || "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newNickname.trim()) return;
    setBusy("new");
    try {
      const body: Record<string, unknown> = { nickname: newNickname.trim() };
      const parsed = parseFloat(newLimit);
      if (!isNaN(parsed) && parsed > 0) {
        body.limitCents = Math.round(parsed * 100);
      }
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewNickname("");
      setNewLimit("");
      setCreating(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create card");
    } finally {
      setBusy(null);
    }
  }

  async function action(
    cardId: string,
    endpoint: string,
    body?: Record<string, unknown>
  ) {
    setBusy(cardId);
    try {
      const res = await fetch(`/api/cards/${cardId}/${endpoint}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      setErr(e?.message || "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const btnStyle = (variant: "primary" | "ghost" | "danger" = "ghost") => ({
    padding: "6px 14px",
    borderRadius: 9999,
    border: `1px solid ${line}`,
    background:
      variant === "primary"
        ? "rgba(25,20,18,0.82)"
        : variant === "danger"
        ? "rgba(140,40,40,0.08)"
        : "rgba(255,255,255,0.28)",
    color:
      variant === "primary"
        ? "#fff"
        : variant === "danger"
        ? "rgba(140,40,40,0.9)"
        : ink,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <Shell
      title="Virtual Cards"
      subtitle="Manage per-subscription virtual cards to control and track spending."
      right={
        <button
          style={btnStyle("primary")}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "Cancel" : "+ New card"}
        </button>
      }
    >
      {err && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(140,40,40,0.08)",
            border: "1px solid rgba(140,40,40,0.22)",
            color: "rgba(140,40,40,0.9)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          style={{
            marginBottom: 24,
            padding: 20,
            borderRadius: 14,
            background: "rgba(255,255,255,0.36)",
            border: `1px solid ${line}`,
            boxShadow: "0 1px 0 rgba(20,16,12,0.03)",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
            <label style={{ fontSize: 11, color: inkSoft }}>Nickname</label>
            <input
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="e.g. Netflix"
              required
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${line}`,
                background: "rgba(255,255,255,0.6)",
                fontSize: 14,
                color: ink,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: inkSoft }}>
              Spend limit (CAD, optional)
            </label>
            <input
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="e.g. 20.00"
              type="number"
              min="0"
              step="0.01"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${line}`,
                background: "rgba(255,255,255,0.6)",
                fontSize: 14,
                color: ink,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={busy === "new"}
            style={btnStyle("primary")}
          >
            {busy === "new" ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: inkSoft, fontSize: 14 }}>Loading…</div>
      ) : cards.length === 0 ? (
        <div style={{ color: inkSoft, fontSize: 14 }}>
          No cards yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cards.map((card) => (
            <div
              key={card.id}
              style={{
                padding: "18px 20px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.36)",
                border: `1px solid ${line}`,
                boxShadow: "0 1px 0 rgba(20,16,12,0.03)",
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              {/* Card identity */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    color: ink,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {card.nickname}
                  {pill(statusLabel(card.status), statusColor(card.status))}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: inkSoft }}>
                  •••• {card.last4} &nbsp;·&nbsp; {fmtLimit(card)}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {card.status === "active" ? (
                  <button
                    style={btnStyle("ghost")}
                    disabled={busy === card.id}
                    onClick={() => action(card.id, "pause")}
                  >
                    Pause
                  </button>
                ) : card.status === "paused" ? (
                  <button
                    style={btnStyle("ghost")}
                    disabled={busy === card.id}
                    onClick={() => action(card.id, "unpause")}
                  >
                    Unpause
                  </button>
                ) : null}
                <button
                  style={btnStyle("ghost")}
                  disabled={busy === card.id}
                  onClick={() => action(card.id, "rotate")}
                >
                  Rotate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
