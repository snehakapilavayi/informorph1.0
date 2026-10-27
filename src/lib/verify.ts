// Deterministic verification helpers (shared, pure). Used server-side after the AI verifier.
export type ClaimStatus = "Supported" | "Contradiction" | "Unsupported" | "Needs Review";
export interface Claim {
  claim: string;
  status: ClaimStatus;
  source_quote?: string;
  explanation?: string;
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const DATE_RX = new RegExp(
  `\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})(?:,?\\s+\\d{4})?|(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})\\b`,
  "gi",
);
const MONEY_RX = /(?:₹|\$|€|£|Rs\.?\s?|INR\s?)\s?\d[\d,]*(?:\.\d+)?/gi;

export const normalize = (s: string) => s.toLowerCase().replace(/[“”"'’‘]/g, "").replace(/\s+/g, " ").trim();

/** Canonical "day month" key so "15 November 2026" and "November 15, 2026" compare equal. */
function dateKey(d: string): string {
  const m = d.toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)|([a-z]+)\s+(\d{1,2})/);
  if (!m) return normalize(d);
  const day = m[1] ?? m[4];
  const mon = (m[2] ?? m[3] ?? "").slice(0, 3);
  return `${Number(day)} ${mon}`;
}

export function extractDates(s: string): string[] {
  return [...s.matchAll(DATE_RX)].map((m) => m[0]);
}
export function extractMoney(s: string): string[] {
  return [...s.matchAll(MONEY_RX)].map((m) => m[0]);
}
const digits = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");

/** Dates and money amounts that appear in generated text but nowhere in the source. */
export function findUnsupportedValues(generated: string, source: string): string[] {
  const srcDates = new Set(extractDates(source).map(dateKey));
  const srcMoney = new Set(extractMoney(source).map(digits));
  const bad: string[] = [];
  for (const d of extractDates(generated)) if (!srcDates.has(dateKey(d))) bad.push(d);
  for (const m of extractMoney(generated)) if (!srcMoney.has(digits(m))) bad.push(m);
  return [...new Set(bad)];
}

export function quoteInSource(quote: string | undefined, source: string): boolean {
  if (!quote) return false;
  return normalize(source).includes(normalize(quote));
}

/** Apply deterministic checks on top of AI verdicts. Never upgrades a status. */
export function reconcileClaims(claims: Claim[], generated: string, source: string): Claim[] {
  const out = claims.map((c) => {
    if (c.status === "Supported" && !quoteInSource(c.source_quote, source)) {
      return { ...c, status: "Needs Review" as ClaimStatus, explanation: (c.explanation ? c.explanation + " " : "") + "Cited quote could not be found verbatim in the source." };
    }
    if (c.status === "Supported") {
      const bad = findUnsupportedValues(c.claim, source);
      if (bad.length) return { ...c, status: "Unsupported" as ClaimStatus, explanation: `Value(s) not in source: ${bad.join(", ")}` };
    }
    return c;
  });
  for (const v of findUnsupportedValues(generated, source)) {
    if (!out.some((c) => c.claim.includes(v) && c.status !== "Supported")) {
      out.push({ claim: v, status: "Unsupported", explanation: `The output mentions “${v}”, which does not appear in the source.` });
    }
  }
  return out;
}

export function overallStatus(claims: Claim[]): "verified" | "blocked" | "review" {
  if (claims.some((c) => c.status === "Contradiction")) return "blocked";
  if (claims.length === 0 || claims.some((c) => c.status !== "Supported")) return "review";
  return "verified";
}
