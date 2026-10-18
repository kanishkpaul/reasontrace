import type { Attachment, Completion, RunManifest, RunRequest, Tier, TraceEvent, UnavailableDepth } from "@reasontrace/format";

export interface ModelInfo {
  id: string;
  name?: string;
}

/** What a source can provide for one model, declared before it runs. */
export interface Capabilities {
  tier: Tier;
  /** The depths this model can't have through this source, each with the reason. */
  unavailable: UnavailableDepth[];
}

/** Where a running source puts what it captures. */
export interface EventSink {
  /** The run directory, for sources that write tensors into its `tensors/` folder. */
  readonly dir?: string;
  /** Text as it streams in, for the live view. What is stored is what `event` receives. */
  delta(channel: "reasoning" | "output", text: string): void;
  event(event: TraceEvent): void;
  attach(attachment: Attachment): void;
}

/** How a source run ended, and what it learned that the declaration couldn't know. */
export interface RunOutcome {
  completion: Completion;
  /** Depths missing from this run beyond those declared, such as no reasoning text returned. */
  unavailable: UnavailableDepth[];
  providerRequest?: RunManifest["providerRequest"];
  respondingModel?: string;
  usage?: RunManifest["usage"];
  runtime?: RunManifest["runtime"];
}

/** A model reached over HTTP: hosted APIs and local servers. */
export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  /** Whether a key must be stored before the source can run. */
  needsKey: boolean;
  /** The viewer draws from this, so a missing depth shows as unavailable rather than empty. */
  capabilities(model: string): Capabilities;
  models(signal: AbortSignal): Promise<ModelInfo[]>;
  /**
   * Resolves with how the run ended. Provider errors, refusals, truncation and
   * timeouts are outcomes, not rejections.
   */
  run(request: RunRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome>;
}

/** Why `signal` stopped a run: its own timeout, or the person who started it. */
export function stoppedBy(signal: AbortSignal, timeoutMs: number): Completion {
  return signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
    ? { state: "timeout", reason: `No complete response within ${timeoutMs / 1000} s.` }
    : { state: "aborted", reason: "Stopped before the response finished." };
}

/** Enough of an error body to read the provider's message; more is usually HTML. */
const MAX_ERROR_CHARS = 2000;

/** The message in a provider's error body: `{error: {message}}`, `{error}`, `{message}`, or the start of the raw text. */
export function providerErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const error = parsed.error;
    const message = typeof error === "string" ? error : error?.message ?? parsed.message;
    if (message) return message;
  } catch {
    // Not JSON: the raw text is the message.
  }
  return body.slice(0, MAX_ERROR_CHARS).trim() || "(empty body)";
}

/** The message of an error a `fetch` threw, with its cause, which is where Node puts the network reason. */
export function fetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}
