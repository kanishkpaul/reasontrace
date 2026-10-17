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
  | "final_answer"
  /** Reasoning text a model emitted before its answer: `<think>` text, a reasoning field, a thinking block. */
  | "reasoning";

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
  /**
   * The text is a summary of the model's reasoning written by the provider's
   * own summariser, not the model's reasoning text (docs/CHARTER.md §2).
   */
  providerSummary?: boolean;
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
  /** The events the finding rests on. */
  eventIds: string[];
  recommendation: string;
  /** What was checked, in one sentence. */
  rule: string;
  /** What the check cannot tell, so the finding is not read as more than it is. */
  limitations: string;
}

/** How a model was reached, which decides the depths it can have (docs/CHARTER.md §1). */
export type Tier = "full" | "local" | "open" | "frontier" | "symbolic";

/**
 * How a run ended. Each is shown as itself, so a timeout or a refusal never
 * reads as an empty answer (docs/CHARTER.md §3, rule 5).
 */
export type CompletionState = "running" | "complete" | "truncated" | "refused" | "error" | "timeout" | "aborted";

export interface Completion {
  state: CompletionState;
  /** In words, from the provider where it gave one. */
  reason?: string;
}

/** What was asked for, before any source turned it into a provider request. */
export interface RunRequest {
  model: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  seed?: number;
  /** How many alternatives to keep for each token, where the source returns probabilities. */
  topLogprobs: number;
  timeoutMs: number;
}

/** Everything needed to repeat a run and judge whether two runs are comparable. */
export interface RunManifest {
  formatVersion: typeof FORMAT_VERSION;
  id: string;
  title: string;
  createdAt: string;
  finishedAt?: string;
  source: { id: string; name: string; tier: Tier; baseUrl: string };
  request: RunRequest;
  /** The body sent to the provider, as sent. Keys travel in headers and never appear here. */
  providerRequest?: Record<string, unknown>;
  /** The model the provider says answered, which can differ from the one asked for. */
  respondingModel?: string;
  unavailable: UnavailableDepth[];
  completion: Completion;
  /** `cachedInputTokens`: prompt tokens the server reused from its cache, which can change outputs (docs/CHARTER.md §3, rule 3). */
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  versions: Record<string, string>;
}

/** One generated token with its log-probability and the alternatives the source returned. */
export interface TokenLogprob {
  token: string;
  logprob: number;
  top: { token: string; logprob: number }[];
}

/**
 * Typed data hung on an event. `kind` is namespaced and versioned
 * (docs/ARCHITECTURE.md §3).
 */
export type Attachment = TopKAttachment;

export interface TopKAttachment {
  kind: "probs.top_k/1";
  eventId: string;
  label: "measured";
  data: { tokens: TokenLogprob[] };
}

/** A run as stored in its run directory. */
export interface Run {
  manifest: RunManifest;
  trace: ReasonTrace;
  attachments: Attachment[];
}
