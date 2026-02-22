import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in
  if (!user) {
    return (
      <div className="p-8">
        <h1>Breakwater</h1>
        <p>Please log in.</p>
      </div>
    );
  }

  // Check if user has connected bank
  const { data: items } = await supabase
    .from("plaid_items")
    .select("*")
    .eq("user_id", user.id);

  if (!items || items.length === 0) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
