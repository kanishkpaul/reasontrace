import type { EvidenceLabel as Label } from "@reasontrace/format";

/**
 * The fixed treatment of each evidence label (design/README.md, Evidence
 * labels): a mark, a colour and, where the label is weak, a badge that is
 * always shown, never left to a tooltip.
 */
const TREATMENT: Record<Label, { word: string; badge?: string }> = {
  observed: { word: "observed" },
  stated: { word: "stated" },
  exact: { word: "exact" },
  measured: { word: "measured" },
  // Unvalidated unless the caller says its controls passed (docs/CHARTER.md §3, rule 1).
  decoded: { word: "decoded", badge: "unvalidated" },
  inferred: { word: "inferred", badge: "analyst's guess" },
};

export function EvidenceMark({ label, validated }: { label: Label | "unavailable"; validated?: boolean }) {
  return <span className="evidence-mark" data-label={label} data-validated={validated || undefined} aria-hidden="true" />;
}

/**
 * The mark, the label's name, and its badge if it has one. Stated text a
 * provider summarised says so, since another model wrote it. Decoded values
 * are unvalidated unless `validated`, which only a validation that passed sets.
 */
export function EvidenceLabel({ label, providerSummary, validated }: { label: Label; providerSummary?: boolean; validated?: boolean }) {
  const { word } = TREATMENT[label];
  const passed = label === "decoded" && validated === true;
  const badge = label === "stated" && providerSummary ? "summary by provider" : passed ? "validated" : TREATMENT[label].badge;
  return (
    <span className="evidence-label" data-label={label}>
      <EvidenceMark label={label} validated={passed} />
      {word}
      {badge && <span className="badge badge--outline">{badge}</span>}
    </span>
  );
}

/** A depth or value the source can't provide, with the reason in words. */
export function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="evidence-label" data-label="unavailable">
      <EvidenceMark label="unavailable" />
      unavailable: {reason}
    </span>
  );
}
