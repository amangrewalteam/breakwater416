import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { devBypassAllowedFromRequest } from "@/lib/devAuth";

declare global {
  // eslint-disable-next-line no-var
  var __BW_DEV_TXNS__: any[] | undefined;
}

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

function normalizeName(t: any) {
  return (t.merchant_name || t.name || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  const bypass = devBypassAllowedFromRequest(req);

  if (!bypass) {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const txns = globalThis.__BW_DEV_TXNS__ || [];
  if (!txns.length) {
    return NextResponse.json({ ok: true, recurring: [], note: "No transactions yet." });
  }

  const groups = new Map<string, any[]>();
  for (const t of txns) {
    const key = normalizeName(t);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }

  const recurring = Array.from(groups.entries())
    .filter(([, arr]) => arr.length >= 3)
    .map(([key, arr]) => {
      const amounts = arr.map((t) => Number(t.amount)).filter((n) => Number.isFinite(n));
      const avg = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : null;

      return {
        merchant: key,
        count: arr.length,
        average_amount: avg,
        sample: arr.slice(0, 3).map((t) => ({
          name: t.merchant_name || t.name,
          amount: t.amount,
          date: t.date,
        })),
      };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ ok: true, recurring });
}
