import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const auth = typeof searchParams?.auth === "string" ? searchParams?.auth : "";
  const reason =
    typeof searchParams?.reason === "string" ? searchParams?.reason : "";

  // If auth failed, show debug info instead of redirecting away
  if (auth === "error") {
    return (
      <main style={{ padding: 40, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        <h1>Auth error</h1>
        <p>We need the reason string to fix this.</p>
        <pre style={{ marginTop: 16 }}>
          {JSON.stringify({ auth, reason, searchParams }, null, 2)}
        </pre>
        <p style={{ marginTop: 16 }}>
          Next step: open the magic link again (or request a new one) and send me
          the <strong>reason</strong> shown here.
        </p>
      </main>
    );
  }

  // Normal behavior
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8">
        <h1>Breakwater</h1>
        <p>Please log in.</p>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("plaid_items")
    .select("*")
    .eq("user_id", user.id);

  if (!items || items.length === 0) redirect("/onboarding");
  redirect("/dashboard");
}
