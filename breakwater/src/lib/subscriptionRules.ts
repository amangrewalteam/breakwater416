// src/lib/subscriptionRules.ts
// Phase 3.1: rules engine for categorization / rename / ignore

export type RuleResult = {
  canonicalName: string;
  category?: string;
  status?: "suggested" | "confirmed" | "ignored";
  reason?: string[];
};

export type Rule = {
  id: string;
  match: RegExp;
  category?: string;
  rename?: (rawName: string) => string;
  ignore?: boolean;
};

export const CATEGORIES = [
  "SaaS",
  "Media",
  "Utilities",
  "Finance",
  "Health",
  "Home",
  "Travel",
  "Other",
] as const;

export function normalizeMerchantName(raw: string): string {
  return (
    raw
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[•·]/g, " ")
      .replace(/\b\d{4,}\b/g, "")
      .replace(/\b(USA|US|CA|CANADA|INC|LLC|LTD|CORP)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
  );
}

const RULES: Rule[] = [
  // --- Ignore rails / transfers / deposits (extra guard)
  { id: "ignore-ach", match: /\bACH\b/i, ignore: true },
  { id: "ignore-transfer", match: /\bTRANSFER\b|\bXFER\b/i, ignore: true },
  { id: "ignore-deposit", match: /\bDEPOSIT\b|\bDIRECT\s*DEP(OSIT)?\b/i, ignore: true },
  { id: "ignore-payroll", match: /\bPAYROLL\b|\bGUSTO\b/i, ignore: true },
  { id: "ignore-loan", match: /\bLOAN\b|\bMORTGAGE\b/i, ignore: true },
  { id: "ignore-interest", match: /\bINTEREST\b/i, ignore: true },
  { id: "ignore-refund", match: /\bREFUND\b|\bREVERS(AL)?\b|\bCHARGEBACK\b/i, ignore: true },
  { id: "ignore-auto-payment", match: /\bAUTOMATIC\s+PAYMENT\b|\bTHANK\b/i, ignore: true },

  // --- Media
  { id: "media-netflix", match: /\bNETFLIX\b/i, category: "Media", rename: () => "Netflix" },
  { id: "media-spotify", match: /\bSPOTIFY\b/i, category: "Media", rename: () => "Spotify" },
  { id: "media-youtube", match: /\bYOUTUBE\b/i, category: "Media", rename: () => "YouTube" },
  { id: "media-apple", match: /\bAPPLE\b.*\bMUSIC\b|\bAPPLE\s+TV\b/i, category: "Media", rename: () => "Apple Media" },

  // --- SaaS
  { id: "saas-adobe", match: /\bADOBE\b/i, category: "SaaS", rename: () => "Adobe" },
  { id: "saas-notion", match: /\bNOTION\b/i, category: "SaaS", rename: () => "Notion" },
  { id: "saas-figma", match: /\bFIGMA\b/i, category: "SaaS", rename: () => "Figma" },
  { id: "saas-slack", match: /\bSLACK\b/i, category: "SaaS", rename: () => "Slack" },
  { id: "saas-google", match: /\bGOOGLE\b.*\bWORKSPACE\b|\bGOOGLE\s+SERVICES\b/i, category: "SaaS", rename: () => "Google Workspace" },

  // --- Utilities
  { id: "util-hydro", match: /\bHYDRO\b|\bELECTRIC\b/i, category: "Utilities" },
  { id: "util-internet", match: /\bROGERS\b|\bBELL\b|\bTELUS\b|\bINTERNET\b|\bFIBRE\b/i, category: "Utilities" },

  // --- Finance
  { id: "fin-stripe", match: /\bSTRIPE\b/i, category: "Finance", rename: () => "Stripe" },
  { id: "fin-square", match: /\bSQUARE\b/i, category: "Finance", rename: () => "Square" },

  // --- Travel
  { id: "travel-uber", match: /\bUBER\b/i, category: "Travel", rename: () => "Uber" },
  { id: "travel-lyft", match: /\bLYFT\b/i, category: "Travel", rename: () => "Lyft" },

  // --- Health
  { id: "health-peloton", match: /\bPELOTON\b/i, category: "Health", rename: () => "Peloton" },
];

export function applySubscriptionRules(rawName: string): RuleResult {
  const reasons: string[] = [];
  let canonicalName = rawName.trim();
  let category: string | undefined;
  let status: RuleResult["status"];

  for (const rule of RULES) {
    if (!rule.match.test(rawName)) continue;

    reasons.push(`rule:${rule.id}`);

    if (rule.ignore) {
      status = "ignored";
      reasons.push("ignored_by_rule");
      break;
    }

    if (rule.rename) canonicalName = rule.rename(rawName);
    if (rule.category) category = rule.category;
  }

  return {
    canonicalName,
    category,
    status,
    reason: reasons.length ? reasons : undefined,
  };
}
