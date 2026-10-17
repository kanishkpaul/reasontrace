import { fetchErrorMessage, providerErrorMessage, readSse, stoppedBy, type EventSink, type RunOutcome, type Source } from "@reasontrace/core";
import type { Completion, RunRequest, TraceEvent, UnavailableDepth } from "@reasontrace/format";
import { redact, type KeyStore, type Secret } from "@reasontrace/keys";

export interface Deps {
  keys: KeyStore;
  fetch?: typeof fetch;
  baseUrl?: string;
}

const NAME = "Anthropic";
const API_VERSION = "2023-06-01";

/**
 * Adaptive thinking with summaries shown. Current models think by default but
 * omit the text unless `display` asks for it.
 */
const THINKING = { type: "adaptive", display: "summarized" } as const;

/** Present on refusals; `category` and `explanation` can each be null. */
interface StopDetails {
  category?: string | null;
  explanation?: string | null;
}

interface StreamEvent {
  type: string;
  message?: { model?: string; usage?: { input_tokens?: number } };
  content_block?: { type: string };
  delta?: { type?: string; thinking?: string; text?: string; stop_reason?: string | null; stop_details?: StopDetails | null };
  usage?: { output_tokens?: number };
  stop_details?: StopDetails | null;
  error?: { type?: string; message?: string };
}

/** The Anthropic Messages API (docs/ARCHITECTURE.md §4). Thinking text is a provider summary. */
export function anthropicSource(deps: Deps): Source {
  const doFetch = deps.fetch ?? fetch;
  const baseUrl = deps.baseUrl ?? "https://api.anthropic.com/v1";
  const headersFor = (key: Secret): Record<string, string> => ({
    "content-type": "application/json",
    "anthropic-version": API_VERSION,
    "x-api-key": key.reveal(),
  });

  return {
    id: "anthropic",
    name: NAME,
    baseUrl,
    needsKey: true,

    capabilities: () => ({
      tier: "frontier",
      unavailable: [
        { depth: "probabilities", reason: "Anthropic's API does not return token probabilities." },
        { depth: "internals", reason: "Anthropic is reached over HTTP, which exposes no activations, and its weights are closed." },
      ],
    }),

    async models(signal) {
      const key = await deps.keys.get("anthropic");
      if (!key) throw new Error(`No ${NAME} key is stored.`);
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/models?limit=100`, { headers: headersFor(key), signal });
      } catch (error) {
        throw new Error(redact(`Could not reach ${NAME}: ${fetchErrorMessage(error)}`, key), { cause: error });
      }
      const body = await response.text();
      if (!response.ok) throw new Error(redact(`${NAME} answered HTTP ${response.status}: ${providerErrorMessage(body)}`, key));
      const { data } = JSON.parse(body) as { data?: { id: string; display_name?: string }[] };
      if (!Array.isArray(data)) throw new Error(`${NAME} answered without a model list.`);
      return data.map((m) => ({ id: m.id, ...(m.display_name ? { name: m.display_name } : {}) }));
    },

    async run(request: RunRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome> {
      const key = await deps.keys.get("anthropic");
      const unavailable: UnavailableDepth[] = [];
      if (!key) return { completion: { state: "error", reason: `No ${NAME} key is stored. Add one before running.` }, unavailable };

      // No temperature: the API accepts only the default while thinking is on.
      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.maxTokens,
        messages: [{ role: "user", content: request.prompt }],
        stream: true,
        thinking: THINKING,
      };

      let thinking = "";
      let text = "";
      let redactedBlocks = 0;
      let stopReason: string | null = null;
      let stopDetails: StopDetails | null = null;
      let streamError: string | undefined;
      let respondingModel: string | undefined;
      const usage: NonNullable<RunOutcome["usage"]> = {};
      let completion: Completion | null = null;

      const post = () => doFetch(`${baseUrl}/messages`, { method: "POST", headers: headersFor(key), body: JSON.stringify(body), signal });

      try {
        let response = await post();
        if (!response.ok) {
          const message = redact(providerErrorMessage(await response.text()), key);
          // Models before Claude 4.6 reject adaptive thinking. Run them without
          // thinking and say why the stated depth is missing.
          if (response.status === 400 && /adaptive/i.test(message)) {
            delete body.thinking;
            unavailable.push({ depth: "stated", reason: `${request.model} does not take adaptive thinking, so it ran without thinking: ${message}` });
            response = await post();
            if (!response.ok) completion = { state: "error", reason: `HTTP ${response.status}: ${redact(providerErrorMessage(await response.text()), key)}` };
          } else {
            completion = { state: "error", reason: `HTTP ${response.status}: ${message}` };
          }
        }

        if (!completion) {
          if (!response.body) throw new Error("The response has no body.");
          for await (const message of readSse(response.body)) {
            let event: StreamEvent;
            try {
              event = JSON.parse(message.data) as StreamEvent;
            } catch {
              streamError = `The stream sent an event that is not JSON: ${message.data.slice(0, 200)}`;
              break;
            }
            if (event.type === "error") {
              streamError = `${event.error?.type ?? "error"}: ${event.error?.message ?? "no message"}`;
              break;
            }
            if (event.type === "message_start") {
              respondingModel = event.message?.model;
              usage.inputTokens = event.message?.usage?.input_tokens;
            } else if (event.type === "content_block_start" && event.content_block?.type === "redacted_thinking") {
              redactedBlocks++;
            } else if (event.type === "content_block_delta") {
              if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
                thinking += event.delta.thinking;
                sink.delta("reasoning", event.delta.thinking);
              } else if (event.delta?.type === "text_delta" && event.delta.text) {
                text += event.delta.text;
                sink.delta("output", event.delta.text);
              }
            } else if (event.type === "message_delta") {
              stopReason = event.delta?.stop_reason ?? stopReason;
              stopDetails = event.delta?.stop_details ?? event.stop_details ?? stopDetails;
              if (event.usage?.output_tokens !== undefined) usage.outputTokens = event.usage.output_tokens;
            } else if (event.type === "message_stop") {
              break;
            }
          }
        }
      } catch (error) {
        completion = signal.aborted
          ? stoppedBy(signal, request.timeoutMs)
          : { state: "error", reason: redact(`Could not reach ${NAME}: ${fetchErrorMessage(error)}`, key) };
      }

      completion ??= streamError ? { state: "error", reason: redact(streamError, key) } : completionOf(stopReason, stopDetails, request);

      let step = 0;
      const record = (fields: Pick<TraceEvent, "id" | "type" | "content"> & Partial<TraceEvent>) =>
        sink.event({ step: ++step, depth: "behaviour", label: "observed", supports: [], source: NAME, ...fields });

      if (thinking.trim()) {
        record({ id: "reasoning", type: "reasoning", depth: "stated", label: "stated", providerSummary: true, content: thinking.trim(), metadata: { redactedBlocks } });
      } else if (completion.state !== "error" && !unavailable.some((u) => u.depth === "stated")) {
        unavailable.push({
          depth: "stated",
          reason: redactedBlocks
            ? "Anthropic redacted this run's thinking; the blocks hold encrypted data and no text."
            : "The model returned no thinking text. Adaptive thinking can skip thinking on simple prompts.",
        });
      }
      // An empty answer is recorded only when the model finished: a run cut off
      // before answering has no answer, which its completion state already says.
      if (text || completion.state === "complete") {
        record({ id: "output", type: "final_answer", content: text, metadata: { stopReason } });
      }
      if (completion.state === "error" || completion.state === "timeout") {
        record({ id: "failure", type: "failure", content: completion.reason ?? completion.state });
      }

      return { completion, unavailable, providerRequest: body, respondingModel, usage };
    },
  };
}

function completionOf(stopReason: string | null, details: StopDetails | null, request: RunRequest): Completion {
  switch (stopReason) {
    case "max_tokens":
      return { state: "truncated", reason: `Reached the limit of ${request.maxTokens} output tokens.` };
    case "model_context_window_exceeded":
      return { state: "truncated", reason: "Reached the end of the model's context window." };
    case "refusal":
      // A refusal can come after partial output, which Anthropic says to treat as incomplete.
      return { state: "refused", reason: details?.explanation ?? (details?.category ? `The model declined (${details.category}).` : "The model declined.") };
    case null:
      return { state: "error", reason: "The stream ended without a stop reason." };
    default:
      return { state: "complete" };
  }
}
