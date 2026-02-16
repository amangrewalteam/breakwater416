export type Tx = {
  merchant_name: string | null;
  name: string | null;
  amount: number | null;
  date: string; // YYYY-MM-DD
};

const normalizeMerchant = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const daysBetween = (a: Date, b: Date) =>
  Math.round(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const inferCadence = (gaps: number[]) => {
  // crude but effective: cluster around ~7 or ~30
  const avg = gaps.reduce((s, x) => s + x, 0) / Math.max(1, gaps.length);
  if (avg >= 25 && avg <= 35) return "monthly";
  if (avg >= 6 && avg <= 8) return "weekly";
  return "unknown";
};

export function detectRecurring(transactions: Tx[]) {
  // group by merchant (merchant_name fallback to name)
  const groups = new Map<string, Tx[]>();

  for (const t of transactions) {
    const label = (t.merchant_name || t.name || "").trim();
    if (!label) continue;
    const key = normalizeMerchant(label);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const results: Array<{
    merchant_key: string;
    merchant_name: string;
    cadence: string;
    avg_amount: number;
    last_date: string;
    confidence: number;
  }> = [];

  for (const [merchant_key, txs] of groups.entries()) {
    // Sort newest first
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : -1));

    // must have >= 3 occurrences to feel "recurring"
    if (sorted.length < 3) continue;

    const dates = sorted.map((t) => new Date(t.date));
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push(daysBetween(dates[i], dates[i + 1]));
    }

    const cadence = inferCadence(gaps);

    // amount stability (ignore negative / refunds)
    const amts = sorted
      .map((t) => Number(t.amount || 0))
      .filter((x) => x > 0);

    if (amts.length < 3) continue;

    const avg_amount = amts.reduce((s, x) => s + x, 0) / amts.length;
    const variance =
      amts.reduce((s, x) => s + Math.abs(x - avg_amount), 0) / amts.length;

    // confidence heuristic
    let confidence = 0;
    if (cadence !== "unknown") confidence += 0.5;
    if (variance / Math.max(1, avg_amount) < 0.15) confidence += 0.3;
    if (sorted.length >= 5) confidence += 0.2;

    if (confidence < 0.6) continue;

    results.push({
      merchant_key,
      merchant_name: (sorted[0].merchant_name || sorted[0].name || "Unknown").trim(),
      cadence,
      avg_amount: Number(avg_amount.toFixed(2)),
      last_date: sorted[0].date,
      confidence: Number(confidence.toFixed(2)),
    });
  }

  // Sort by impact (avg amount desc)
  results.sort((a, b) => b.avg_amount - a.avg_amount);
  return results;
}
