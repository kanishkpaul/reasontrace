import type { EvidenceLabel } from "@reasontrace/format";

/**
 * Each evidence label's mark and word (docs/CHARTER.md §2). Marks are text,
 * so a label reads the same without colour; a weak label also carries a
 * badge that is always shown, never left to a tooltip.
 */
export const EVIDENCE: Record<EvidenceLabel, { mark: string; word: string; badge?: string }> = {
  observed: { mark: "■", word: "observed" },
  stated: { mark: "“", word: "stated" },
  exact: { mark: "✓", word: "exact" },
  measured: { mark: "●", word: "measured" },
  // Unvalidated unless the caller says its controls passed (docs/CHARTER.md §3, rule 1).
  decoded: { mark: "◇", word: "decoded", badge: "unvalidated" },
  inferred: { mark: "?", word: "inferred", badge: "analyst's guess" },
};

/** A decoded value whose validation passed. */
export const VALIDATED = { mark: "◆", badge: "validated" };

/** A depth or value the source can't provide. */
export const UNAVAILABLE = { mark: "∅", word: "unavailable" };
