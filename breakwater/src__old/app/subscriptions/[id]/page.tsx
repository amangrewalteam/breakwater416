"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";
import { useParams, useRouter } from "next/navigation";

type Recurring = {
  id: string;
  merchant_name: string;
  cadence: string;
  avg_amount: number;
  last_date: string;
  confidence: number;
};

type Action = { status: "track" | "cancel" | "move" | "none"; notes: string | null };

export default function SubscriptionDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [rec, setRec] = useState<Recurring | null>(null);
  const [action, setAction] = useState<Action>({ status: "none", notes: null });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      router.replace("/login");
      return;
    }

    const { data: r } = await supabase
      .from("recurring")
      .select("*")
      .eq("id", params.id)
      .single();

    const { data: a } = await supabase
      .from("subscription_actions")
      .select("status,notes")
      .eq("recurring_id", params.id)
      .maybeSingle();

    if (r) setRec(r as any);
    if (a) setAction(a as any);

    setLoading(false);
  }

  async function setStatus(status: Action["status"]) {
    await fetch("/api/actions/set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recurring_id: params.id, status }),
    });
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <Shell
      title={loading ? "…" : rec?.merchant_name || "Subscription"}
      subtitle={rec ? `${rec.cadence} · ~${Number(rec.avg_amount).toFixed(2)} · last ${rec.last_date}` : ""}
      right={
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            color: ink,
            border: `1px solid ${line}`,
            padding: "10px 14px",
            borderRadius: 999,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      }
    >
      {!rec ? (
        <div style={{ color: inkSoft }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 14, maxWidth: 760 }}>
          <div style={{ color: inkSoft }}>
            Mark this as: the state helps Breakwater remember what you intended.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["track", "cancel", "move"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 999,
                  border: `1px solid ${line}`,
                  background: action.status === s ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.20)",
                  color: ink,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => setStatus("none")}
              style={{
                padding: "12px 14px",
                borderRadius: 999,
                border: `1px solid ${line}`,
                background: "transparent",
                color: inkSoft,
                cursor: "pointer",
              }}
            >
              clear
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
            <div style={{ color: ink, fontSize: 18 }}>Cancel, softly</div>
            <div style={{ color: inkSoft, marginTop: 6 }}>
              V1 doesn’t auto-cancel yet. We’ll guide you to the right place.
            </div>
            <div style={{ color: inkSoft, marginTop: 10 }}>
              Try searching:{" "}
              <span style={{ color: ink }}>
                “{rec.merchant_name} cancel subscription”
              </span>{" "}
              or “billing”.
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
