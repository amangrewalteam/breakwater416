// src/lib/normalizeMerchant.ts
export function normalizeMerchant(input?: string | null) {
  const s = (input || "").toLowerCase().trim();
  if (!s) return "";

  return s
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
