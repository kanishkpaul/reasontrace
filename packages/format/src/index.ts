/**
 * The trace format's version. Version 0 is the prototype's JSON: `{title,
 * events}` whose events carry `links` and `evidenceMode`. Readers for it live
 * in `@reasontrace/analysis`.
 */
export const FORMAT_VERSION = 1;

export type EventType =
  | "hypothesis"
  | "action"
  | "observation"
  | "belief_update"
  | "failure"
  | "decision"
  | "final_answer";

/** Which depth of a model an event comes from (docs/CHARTER.md §1). */
export type Depth = "behaviour" | "stated" | "probabilities" | "internals";

/** How far a value can be trusted (docs/CHARTER.md §2). */
export type EvidenceLabel = "observed" | "stated" | "exact" | "measured" | "decoded" | "inferred";

export interface TraceEvent {
  id: string;
  type: EventType;
  /**
   * The producer's own step number. Steps may be sparse, repeat, or be
   * timestamps; time order is the event's position in `ReasonTrace.events`.
   */
  step: number;
  content: string;
  /** In [0, 1]. Absent when the source gave none. */
  confidence?: number;
  tool?: string;
  depth: Depth;
  label: EvidenceLabel;
  /**
   * Events the producer declared as evidence for this one. Time order never
   * implies support.
   */
  supports: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

/** A depth the source could not provide, with the reason, shown in place of an empty panel. */
export interface UnavailableDepth {
  depth: Depth;
  reason: string;
}

export interface ReasonTrace {
  formatVersion: typeof FORMAT_VERSION;
  title: string;
  /** In time order. */
  events: TraceEvent[];
  unavailable: UnavailableDepth[];
}

export interface TraceDiagnostics {
  hypothesisCount: number;
  actionCount: number;
  observationCount: number;
  failureCount: number;
  beliefUpdateCount: number;
  decisionCount: number;
  finalAnswerCount: number;
  /** Null when there are no observations to divide by. */
  hypothesisToObservationRatio: number | null;
  unsupportedHypotheses: string[]; // Event IDs
  actionsWithoutPriorHypothesis: string[]; // Event IDs
  answerGrounding: AnswerGrounding;
  /**
   * Percentage of claims (hypotheses, updates, decisions, answers) with an
   * observation upstream along declared support links. Null when the trace
   * declares no links or has no claims.
   */
  evidenceCoverage: number | null;
  groundedAnswerCount: number;
  opaqueEventCount: number;
  inferredEventCount: number;
  findings: TraceFinding[];
  warnings: string[];
}

/**
 * Whether the final answers rest on observations, along the `supports` links
 * the trace declares. `not_recorded`: the trace declares no links at all, so
 * the question can't be answered from it.
 */
export type AnswerGrounding = "grounded" | "ungrounded" | "no_answer" | "not_recorded";

export type FindingSeverity = "critical" | "warning" | "info";

export interface TraceFinding {
  id: string;
  severity: FindingSeverity;
  category: "grounding" | "planning" | "loop" | "failure" | "visibility" | "confidence";
  title: string;
  detail: string;
  eventIds: string[];
  recommendation: string;
}
