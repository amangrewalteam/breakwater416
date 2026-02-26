// src/lib/subscriptionRepo.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SubscriptionRepo
 * IMPORTANT: Do NOT create a Supabase client here.
 * Always inject a cookie-aware client from:
 * - await supabaseServer() (server/routes)
 * - supabaseBrowser() (client)
 */
export class SubscriptionRepo {
  constructor(private supabase: SupabaseClient) {}

  // ---- Keep/adjust these methods to match your existing schema ----
  async listForUser(userId: string) {
    return this.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
  }

  async upsertForUser(userId: string, rows: any[]) {
    // If you have a stricter type for rows, replace `any[]`
    return this.supabase
      .from("subscriptions")
      .upsert(rows.map((r) => ({ ...r, user_id: userId })));
  }

  async deleteForUser(userId: string, id: string | number) {
    return this.supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
  }
}