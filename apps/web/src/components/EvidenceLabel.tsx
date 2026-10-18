import type { CompletionState, EvidenceLabel as Label } from "@reasontrace/format";
import { COMPLETION } from "../lib/completion";
import { EVIDENCE, UNAVAILABLE, VALIDATED } from "../lib/marks";

export function EvidenceMark({ label, validated }: { label: Label | "unavailable"; validated?: boolean }) {
  const mark = label === "unavailable" ? UNAVAILABLE.mark : validated ? VALIDATED.mark : EVIDENCE[label].mark;
  return <span className="evidence-mark" data-label={label} data-validated={validated || undefined} aria-hidden="true">{mark}</span>;
}

/**
 * The mark, the label's name, and its badge if it has one. Stated text a
 * provider summarised says so, since another model wrote it. Decoded values
 * are unvalidated unless `validated`, which only a validation that passed sets.
 */
export function EvidenceLabel({ label, providerSummary, validated }: { label: Label; providerSummary?: boolean; validated?: boolean }) {
  const { word } = EVIDENCE[label];
  const passed = label === "decoded" && validated === true;
  const badge = label === "stated" && providerSummary ? "summary by provider" : passed ? VALIDATED.badge : EVIDENCE[label].badge;
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
      {UNAVAILABLE.word}: {reason}
    </span>
  );
}

/** How a run ended: its tag and its word. */
export function Ending({ state, reason }: { state: CompletionState; reason?: string }) {
  const { tag, word } = COMPLETION[state];
  return (
    <span className="ending" data-state={state}>
      <span className="ending__tag" aria-hidden="true">{tag}</span> {word}{reason ? `: ${reason}` : ""}
    </span>
  );
}
