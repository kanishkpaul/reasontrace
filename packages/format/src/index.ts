export type EventType =
  | "hypothesis"
  | "action"
  | "observation"
  | "belief_update"
  | "failure"
  | "decision"
  | "final_answer";

/**
 * How much of an event is directly observable. This prevents the UI from
 * presenting an analyst's reconstruction as hidden chain-of-thought.
 */
export type EvidenceMode = "explicit" | "observed" | "inferred";

export interface TraceEvent {
  id: string;
  type: EventType;
  step: number;
  content: string;
  confidence?: number;
  tool?: string;
  links?: string[]; // parent node IDs
  evidenceMode?: EvidenceMode;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ReasonTrace {
  title: string;
  events: TraceEvent[];
}

export interface TraceDiagnostics {
  hypothesisCount: number;
  actionCount: number;
  observationCount: number;
  failureCount: number;
  beliefUpdateCount: number;
  decisionCount: number;
  finalAnswerCount: number;
  hypothesisToObservationRatio: number;
  unsupportedHypotheses: string[]; // Event IDs
  actionsWithoutPriorHypothesis: string[]; // Event IDs
  hasEvidenceChain: boolean;
  evidenceCoverage: number;
  groundedAnswerCount: number;
  opaqueEventCount: number;
  inferredEventCount: number;
  findings: TraceFinding[];
  warnings: string[];
}

export type FindingSeverity = "critical" | "warning" | "info";

export interface TraceFinding {
  id: string;
  severity: FindingSeverity;
  category: "grounding" | "planning" | "loop" | "contradiction" | "visibility" | "confidence";
  title: string;
  detail: string;
  eventIds: string[];
  recommendation: string;
}
