// src/lib/subscriptionRepo.ts
import { createClient } from "@supabase/supabase-js";
import type { StoredSubscription } from "@/lib/subscriptionStore";
import {
  readSubscriptions as readFileSubscriptions,
  upsertMany as upsertManyFile,
  updateSubscription as updateFileSubscription,
} from "@/lib/subscriptionStore";

export interface SubscriptionRepo {
  list(): Promise<StoredSubscription[]>;
  upsertMany(incoming: StoredSubscription[]): Promise<StoredSubscription[]>;
  update(id: string, patch: Partial<Omit<StoredSubscription, "id" | "updatedAt">>): Promise<StoredSubscription | null>;
}

function sortByAnnualDesc(a: StoredSubscription, b: StoredSubscription) {
  return (b.annualCost || 0) - (a.annualCost || 0);
}

class FileRepo implements SubscriptionRepo {
  async list() {
    return readFileSubscriptions().sort(sortByAnnualDesc);
  }
  async upsertMany(incoming: StoredSubscription[]) {
    return upsertManyFile(incoming).sort(sortByAnnualDesc);
  }
  async update(id: string, patch: Partial<Omit<StoredSubscription, "id" | "updatedAt">>) {
    return updateFileSubscription(id, patch);
  }
}

class SupabaseRepo implements SubscriptionRepo {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  private table() {
    return process.env.SUPABASE_SUBSCRIPTIONS_TABLE || "subscriptions";
  }

  private userId() {
    return process.env.SUPABASE_USER_ID || "dev-user";
  }

  async list() {
    const { data, error } = await this.supabase
      .from(this.table())
      .select("*")
      .eq("user_id", this.userId())
      .order("annual_cost", { ascending: false });

    if (error) throw error;

    return (data || []).map(this.fromRow);
  }

  async upsertMany(incoming: StoredSubscription[]) {
    const rows = incoming.map((s) => this.toRow(s));

    // upsert on primary key id
    const { error } = await this.supabase
      .from(this.table())
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;

    return this.list();
  }

  async update(id: string, patch: Partial<Omit<StoredSubscription, "id" | "updatedAt">>) {
    const rowPatch: any = { ...patch };

    // Map camelCase -> snake_case
    if ("annualCost" in rowPatch) {
      rowPatch.annual_cost = rowPatch.annualCost;
      delete rowPatch.annualCost;
    }
    if ("lastSeen" in rowPatch) {
      rowPatch.last_seen = rowPatch.lastSeen ? new Date(rowPatch.lastSeen).toISOString() : null;
      delete rowPatch.lastSeen;
    }
    if ("needsReview" in rowPatch) {
      rowPatch.needs_review = rowPatch.needsReview;
      delete rowPatch.needsReview;
    }
    rowPatch.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(this.table())
      .update(rowPatch)
      .eq("id", id)
      .eq("user_id", this.userId())
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? this.fromRow(data) : null;
  }

  private toRow(s: StoredSubscription) {
    return {
      id: s.id,
      user_id: this.userId(),
      name: s.name,
      normalized: s.normalized,
      amount: s.amount,
      cadence: s.cadence,
      annual_cost: s.annualCost,
      last_seen: s.lastSeen ? new Date(s.lastSeen).toISOString() : null,
      occurrences: typeof s.occurrences === "number" ? s.occurrences : null,
      status: s.status,
      category: s.category || null,
      confidence: s.confidence || null,
      needs_review: typeof s.needsReview === "boolean" ? s.needsReview : null,
      reason: s.reason ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  private fromRow = (r: any): StoredSubscription => {
    return {
      id: r.id,
      name: r.name,
      normalized: r.normalized,
      amount: Number(r.amount),
      cadence: r.cadence,
      annualCost: Number(r.annual_cost),
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : undefined,
      occurrences: typeof r.occurrences === "number" ? r.occurrences : undefined,
      status: r.status,
      category: r.category || undefined,
      confidence: r.confidence || undefined,
      needsReview: typeof r.needs_review === "boolean" ? r.needs_review : undefined,
      reason: Array.isArray(r.reason) ? r.reason : (r.reason ? Object.values(r.reason) : undefined),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    };
  };
}

export function getSubscriptionRepo(): SubscriptionRepo {
  const driver = (process.env.STORAGE_DRIVER || "file").toLowerCase();
  if (driver === "supabase") {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // fail safe: if env missing, fall back to file so dev doesn't hard-crash
      return new FileRepo();
    }
    return new SupabaseRepo();
  }
  return new FileRepo();
}
