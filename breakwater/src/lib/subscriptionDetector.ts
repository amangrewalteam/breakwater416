// src/lib/subscriptionDetector.ts
// MVP+ detector with:
// ✅ Exclude transfers & deposits
// ✅ Only count outgoing payments
// ✅ Cadence spacing check (monthly/yearly)
//
// Notes:
// - Plaid usually returns spending as POSITIVE amounts and refunds/credits as NEGATIVE.
// - If your integration is inverted, flip `isOutgoingPayment` to `t.amount < 0`
//   and convert `amountAbs` accordingly.

export type Transaction = {
  name: string;
  amount: number;
  date: string; // YYYY-MM-DD
};

export type Subscription = {
  name: string;
  amount: number; // normalized positive amount
  cadence: "monthly" | "yearly";
  annualCost: number;
  lastSeen: string;
  occurrences: number;
};

const MONTHLY_MIN_DAYS = 25;
const MONTHLY_MAX_DAYS = 35;

const YEARLY_MIN_DAYS = 350;
const YEARLY_MAX_DAYS = 380;

// Transfers/deposits & other non-subscription rails we want to exclude
const EXCLUDE_NAME_PATTERNS: RegExp[] = [
  /\bACH\b/i,
  /\bWIRE\b/i,
  /\bTRANSFER\b/i,
  /\bXFER\b/i,
  /\bDEPOSIT\b/i,
  /\bDIRECT\s*DEP(OSIT)?\b/i,
  /\bPAYROLL\b/i,
  /\bGUSTO\b/i,
  /\bVENMO\b/i,
  /\bZELLE\b/i,
  /\bCASH\s*APP\b/i,
  /\bATM\b/i,
  /\bREFUND\b/i,
  /\bREVERS(AL)?\b/i,
  /\bCHARGEBACK\b/i,
  /\bINTEREST\b/i,
  /\bLOAN\b/i,
  /\bMORTGAGE\b/i,
  /\bCREDIT\b/i,
  /\bCD\b/i,
  /\bCERTIFICATE\s+OF\s+DEPOSIT\b/i,
  /\bAUTOMATIC\s+PAYMENT\b/i, // often card/loan autopay transfers, not a subscription
];

// Basic normalization so grouping is more stable
function normalizeMerchantName(raw: string): string {
  return (
    raw
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[•·]/g, " ")
      // remove long reference numbers
      .replace(/\b\d{4,}\b/g, "")
      // remove common corporate suffixes / geo noise
      .replace(/\b(USA|US|CA|CANADA|INC|LLC|LTD|CORP)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
  );
}

function shouldExcludeName(name: string): boolean {
  return EXCLUDE_NAME_PATTERNS.some((re) => re.test(name));
}

function parseDateToUTC(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`);
}

function daysBetween(a: string, b: string): number {
  const ta = parseDateToUTC(a);
  const tb = parseDateToUTC(b);
  return Math.round(Math.abs(tb - ta) / (1000 * 60 * 60 * 24));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function closeEnoughAmounts(
  amounts: number[],
  toleranceAbs = 2,
  tolerancePct = 0.06
): boolean {
  const anchor = median(amounts);
  return amounts.every((a) => {
    const diff = Math.abs(a - anchor);
    return diff <= toleranceAbs || diff <= Math.max(1, Math.abs(anchor) * tolerancePct);
  });
}

// ✅ Only count outgoing payments
function isOutgoingPayment(t: Transaction): boolean {
  // Plaid typical: spend is positive; credits/refunds negative.
  return t.amount > 0;
}

function inferCadenceFromDiffs(
  diffs: number[]
): "monthly" | "yearly" | null {
  if (diffs.length < 2) return null; // need at least 2 intervals (3 txs) for confidence
  const m = median(diffs);
  if (m >= MONTHLY_MIN_DAYS && m <= MONTHLY_MAX_DAYS) return "monthly";
  if (m >= YEARLY_MIN_DAYS && m <= YEARLY_MAX_DAYS) return "yearly";
  return null;
}

// ✅ Cadence spacing check
function passesCadenceSpacing(
  sortedByDate: Transaction[],
  cadence: "monthly" | "yearly"
): boolean {
  const min = cadence === "monthly" ? MONTHLY_MIN_DAYS : YEARLY_MIN_DAYS;
  const max = cadence === "monthly" ? MONTHLY_MAX_DAYS : YEARLY_MAX_DAYS;

  // compute day gaps between consecutive occurrences
  const diffs: number[] = [];
  for (let i = 1; i < sortedByDate.length; i++) {
    diffs.push(daysBetween(sortedByDate[i - 1].date, sortedByDate[i].date));
  }

  // require at least two gaps (already true if len>=3)
  if (diffs.length < 2) return false;

  // Allow one “miss” for real-life delays, but require most to be in range
  const inRange = diffs.filter((d) => d >= min && d <= max).length;
  return inRange >= Math.max(2, Math.ceil(diffs.length * 0.66));
}

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const cleaned = (transactions || [])
    .filter(
      (t) =>
        t &&
        typeof t.name === "string" &&
        typeof t.amount === "number" &&
        typeof t.date === "string"
    )
    // ✅ Only outgoing payments
    .filter(isOutgoingPayment)
    // ✅ Exclude transfers & deposits (by name patterns)
    .filter((t) => !shouldExcludeName(t.name))
    .map((t) => {
      const normalized = normalizeMerchantName(t.name);
      return {
        ...t,
        normalized,
        // normalize amount to positive magnitude
        amountAbs: Math.abs(t.amount),
      };
    })
    .filter((t) => t.normalized.length >= 2)
    // also run exclusion on normalized form
    .filter((t) => !shouldExcludeName(t.normalized));

  // Group by normalized merchant name
  const grouped: Record<
    string,
    { originalNames: Record<string, number>; txs: Transaction[] }
  > = {};

  for (const t of cleaned) {
    if (!grouped[t.normalized]) grouped[t.normalized] = { originalNames: {}, txs: [] };
    grouped[t.normalized].txs.push({ name: t.name.trim(), amount: t.amountAbs, date: t.date });
    grouped[t.normalized].originalNames[t.name.trim()] =
      (grouped[t.normalized].originalNames[t.name.trim()] || 0) + 1;
  }

  const subs: Subscription[] = [];

  for (const key of Object.keys(grouped)) {
    const txs = grouped[key].txs;

    // Require at least 3 occurrences (MVP)
    if (txs.length < 3) continue;

    const sorted = txs.slice().sort((a, b) => parseDateToUTC(a.date) - parseDateToUTC(b.date));

    const amounts = sorted.map((t) => t.amount);

    // Amount consistency check
    if (!closeEnoughAmounts(amounts)) continue;

    // Cadence inference from spacing
    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) diffs.push(daysBetween(sorted[i - 1].date, sorted[i].date));

    const cadence = inferCadenceFromDiffs(diffs);
    if (!cadence) continue;

    // ✅ Cadence spacing check (guardrail)
    if (!passesCadenceSpacing(sorted, cadence)) continue;

    // Display name: most frequent original merchant string in the group
    const originalCounts = grouped[key].originalNames;
    const displayName =
      Object.keys(originalCounts).sort(
        (a, b) => (originalCounts[b] || 0) - (originalCounts[a] || 0)
      )[0] || key;

    const amount = median(amounts);
    const annualCost = cadence === "monthly" ? amount * 12 : amount;

    subs.push({
      name: displayName,
      amount,
      cadence,
      annualCost,
      lastSeen: sorted[sorted.length - 1].date,
      occurrences: sorted.length,
    });
  }

  return subs.sort((a, b) => b.annualCost - a.annualCost);
}
