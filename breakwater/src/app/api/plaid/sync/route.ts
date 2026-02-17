import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { plaidClient } from "@/lib/plaid";
import { devBypassAllowedFromRequest } from "@/lib/devAuth";

declare global {
  // eslint-disable-next-line no-var
  var __BW_DEV_PLAID__: { access_token?: string; item_id?: string; cursor?: string } | undefined;
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

export async function POST(req: Request) {
  const bypass = devBypassAllowedFromRequest(req);

  if (!bypass) {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const store = (globalThis.__BW_DEV_PLAID__ = globalThis.__BW_DEV_PLAID__ || {});
    const access_token = store.access_token;

    if (!access_token) {
      return NextResponse.json(
        { error: "No access_token found. Connect a bank first." },
        { status: 400 }
      );
    }

    let cursor = store.cursor;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: any[] = [];
    let has_more = true;

    while (has_more) {
      const resp = await plaidClient.transactionsSync({
        access_token,
        cursor: cursor || undefined,
      });

      added = added.concat(resp.data.added || []);
      modified = modified.concat(resp.data.modified || []);
      removed = removed.concat(resp.data.removed || []);
      has_more = !!resp.data.has_more;
      cursor = resp.data.next_cursor;
    }

    store.cursor = cursor;

    globalThis.__BW_DEV_TXNS__ = globalThis.__BW_DEV_TXNS__ || [];
    const byId = new Map(globalThis.__BW_DEV_TXNS__!.map((t: any) => [t.transaction_id, t]));
    for (const t of added) byId.set(t.transaction_id, t);
    for (const t of modified) byId.set(t.transaction_id, t);
    for (const r of removed) byId.delete(r.transaction_id);

    globalThis.__BW_DEV_TXNS__ = Array.from(byId.values());

    return NextResponse.json({
      ok: true,
      cursor,
      counts: { added: added.length, modified: modified.length, removed: removed.length },
      transactions: globalThis.__BW_DEV_TXNS__,
    });
  } catch (e: any) {
    console.error("plaid sync error:", e?.response?.data || e);
    return NextResponse.json(
      {
        error:
          e?.response?.data?.error_message ||
          e?.message ||
          "Failed to sync transactions",
      },
      { status: 500 }
    );
  }
}
