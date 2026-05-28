export type EventType =
  | "hypothesis"
  | "action"
  | "observation"
  | "belief_update"
  | "failure"
  | "decision"
  | "final_answer";

export interface TraceEvent {
  id: string;
  type: EventType;
  step: number;
  content: string;
  confidence?: number;
  tool?: string;
  links?: string[]; // parent node IDs
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
  warnings: string[];
}
