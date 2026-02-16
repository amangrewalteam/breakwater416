"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ink, inkSoft, line } from "@/lib/style";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  merchant_name: string;
  cadence: string;
  avg_amount: number;
  last_date: string;
  confidence: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("recurring")
      .select("*")
      .order("avg_amount", { ascending: false });

    if (!error && data) setRows(data as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell
      title="Recurring"
      subtitle="What keeps coming back."
      right={
        <button
          onClick={async () => {
            await fetch("/api/plaid/sync", { method: "POST" });
            await fetch("/api/recurring/recompute", { method: "POST" });
            await load();
          }}
          style={{
            color: ink,
            border: `1px solid ${line}`,
            padding: "10px 14px",
            borderRadius: 999,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Sync
        </button>
      }
    >
      {loading ? (
        <div style={{ color: inkSoft }}>Gathering the tide line…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: inkSoft }}>
          No recurring merchants detected yet. Try syncing again after a few minutes.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/subscriptions/${r.id}`}
              style={{
                textDecoration: "none",
                border: `1px solid ${line}`,
                borderRadius: 16,
                padding: 14,
                background: "rgba(255,255,255,0.22)",
              }}
            >
              <div style={{ color: ink, fontSize: 18 }}>{r.merchant_name}</div>
              <div style={{ color: inkSoft, marginTop: 6 }}>
                {r.cadence} · ~${Number(r.avg_amount).toFixed(2)} · last {r.last_date}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
