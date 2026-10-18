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
  | "reasoning"
  /** Internal values captured from a model, such as its residual stream. */
  | "activation";

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
  /** Whether generation may reuse its key-value cache. Sources that run the weights honour it; HTTP sources can't. */
  cache?: boolean;
  /** What to capture from inside the model, for sources that run the weights. */
  plan?: CapturePlan;
}

/** Which layers and positions to keep from the residual stream, and how to pool them (docs/CHARTER.md §3, rule 4). */
export interface CapturePlan {
  layers: "all" | number[];
  positions: "all" | "generated" | "last";
  pooling: "none" | "mean";
}

/** How a model was run, for sources that run the weights themselves. */
export interface Runtime {
  device: string;
  dtype: string;
  quantization: string;
  cache: boolean;
  seed: number;
  /** The weights' commit on Hugging Face. */
  revision: string;
  libraries: Record<string, string>;
  /** The largest figure seen when memory was sampled, at each generated token and after capture; the true peak can be higher. */
  peakMemoryBytes: number;
  captureMethod: string;
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
  runtime?: Runtime;
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
export type Attachment = TopKAttachment | ResidualAttachment | DecodedAttachment;

export interface TopKAttachment {
  kind: "probs.top_k/1";
  eventId: string;
  label: "measured";
  data: { tokens: TokenLogprob[] };
}

/** Residual-stream slices stored in the run's `tensors/` folder, one tensor per layer named `layer.<i>`. */
export interface ResidualAttachment {
  kind: "activations.residual/1";
  eventId: string;
  label: "measured";
  data: {
    /** Relative to the run directory. */
    file: string;
    layers: number[];
    /** Sequence positions kept, counting the prompt from 0. */
    positions: number[];
    /** The token at each kept position. */
    tokens: string[];
    pooling: CapturePlan["pooling"];
    dModel: number;
    dtype: string;
    /** The L2 norm of the last kept position at each layer: a raw number, not an interpretation. */
    norms: number[];
  };
}

/** A run where the decoder has nothing to find. It should fail (docs/CHARTER.md §3, rule 1). */
export type ControlName = "random direction" | "shuffled inputs" | "untrained weights";

/**
 * A decoder's result on a model with a planted circuit, and its controls'
 * results, as the sidecar's harness writes it
 * (bridge/python/reasontrace_sidecar/ground_truth). It is `unvalidated` when
 * the decoder misses the planted variable or any control also finds it.
 */
export interface Validation {
  decoder: { kind: string; name: string; version: string };
  status: "validated" | "unvalidated";
  /** Why it is unvalidated. Null when it is validated. */
  reason: string | null;
  /** The planted circuit, in words. */
  groundTruth: string;
  metric: string;
  items: number;
  /** The decoder's best score over layers. */
  score: number;
  /** The score needed to count as recovering the planted variable. */
  required: number;
  chance: number;
  /** A control scoring this or more counts as succeeding: guessing reaches it with probability under 1%. */
  chanceBound: number;
  byLayer: number[];
  /** The first layer where the decoder recovers the variable, or null when it never does. */
  recoveredFrom: number | null;
  controls: { control: ControlName; score: number; succeeded: boolean }[];
}

/** An interpretation of internals by a decoder (docs/CHARTER.md §2, `decoded`). */
export type DecodedAttachment = LogitLensAttachment | SaeFeaturesAttachment;

interface Decoded {
  /** The activation event whose captured stream was decoded. */
  eventId: string;
  label: "decoded";
  method: { name: string; version: string };
  /** Null when no control was run; the viewer then shows the attachment as unvalidated. */
  validation: Validation | null;
}

/** Each captured layer read through the final norm and unembedding, at each captured position. */
export interface LogitLensAttachment extends Decoded {
  kind: "lens.logit/1";
  data: {
    layers: number[];
    positions: number[];
    /** The token at each position. */
    tokens: string[];
    /** By layer, then position: the likeliest tokens, likeliest first. */
    top: { token: string; logprob: number }[][][];
  };
}

/** One layer's residual stream encoded by a sparse autoencoder, at each captured position. */
export interface SaeFeaturesAttachment extends Decoded {
  kind: "sae.features/1";
  data: {
    /** The SAE as SAELens names it. */
    release: string;
    saeId: string;
    layer: number;
    /** How many features the SAE has. */
    width: number;
    positions: number[];
    tokens: string[];
    /** By position: the strongest active features, strongest first. */
    top: { feature: number; activation: number }[][];
    /** By position: how many features are active. */
    l0: number[];
    /** By position: whether the token is a special token, which FVU leaves out. */
    special: boolean[];
    /** Fraction of variance unexplained by the reconstruction, over the positions that are not special tokens. Null when there are too few to estimate the variance. */
    fvu: number | null;
    fvuPositions: number;
  };
}

/** What became of one decoder on a run, recorded on the activation event as `metadata.decoders`. */
export interface DecoderOutcome {
  kind: string;
  attached: boolean;
  /** Why it did not attach. Null when it did. */
  reason: string | null;
}

/** A run as stored in its run directory. */
export interface Run {
  manifest: RunManifest;
  trace: ReasonTrace;
  attachments: Attachment[];
}
