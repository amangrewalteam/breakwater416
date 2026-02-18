// src/lib/subscriptionStore.ts
import fs from "fs";
import path from "path";

export type StoredSubscription = {
  id: string;
  name: string;
  normalized: string;

  amount: number; // positive
  cadence: "monthly" | "yearly";
  annualCost: number;

  lastSeen?: string;
  occurrences?: number;

  status: "suggested" | "confirmed" | "ignored";
  category?: string;

  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), ".subscriptions.json");

function nowISO() {
  return new Date().toISOString();
}

export function readSubscriptions(): StoredSubscription[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as StoredSubscription[]) : [];
  } catch {
    return [];
  }
}

export function writeSubscriptions(subs: StoredSubscription[]) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(subs, null, 2), "utf8");
}

export function upsertMany(incoming: StoredSubscription[]) {
  const existing = readSubscriptions();
  const map = new Map(existing.map((s) => [s.id, s]));

  for (const s of incoming) {
    const prev = map.get(s.id);

    // Never overwrite a user decision once confirmed/ignored
    if (prev && (prev.status === "confirmed" || prev.status === "ignored")) {
      map.set(s.id, {
        ...prev,
        lastSeen: s.lastSeen ?? prev.lastSeen,
        occurrences: s.occurrences ?? prev.occurrences,
        updatedAt: nowISO(),
      });
      continue;
    }

    map.set(s.id, {
      ...(prev || {}),
      ...s,
      status: prev?.status ?? "suggested",
      category: prev?.category ?? s.category,
      updatedAt: nowISO(),
    });
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => (b.annualCost || 0) - (a.annualCost || 0)
  );

  writeSubscriptions(merged);
  return merged;
}

export function updateSubscription(
  id: string,
  patch: Partial<Omit<StoredSubscription, "id" | "updatedAt">>
) {
  const subs = readSubscriptions();

  const next = subs.map((s) => {
    if (s.id !== id) return s;

    const nextName = patch.name ?? s.name;
    const nextNormalized = patch.normalized ?? s.normalized;
    const nextAmount = typeof patch.amount === "number" ? patch.amount : s.amount;
    const nextCadence = (patch.cadence ?? s.cadence) as "monthly" | "yearly";
    const nextAnnual =
      nextCadence === "monthly" ? nextAmount * 12 : nextAmount;

    return {
      ...s,
      ...patch,
      name: nextName,
      normalized: nextNormalized,
      amount: nextAmount,
      cadence: nextCadence,
      annualCost: nextAnnual,
      updatedAt: nowISO(),
    };
  });

  writeSubscriptions(next);
  return next.find((s) => s.id === id) || null;
}
