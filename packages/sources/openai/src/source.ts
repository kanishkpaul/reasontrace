import { fetchErrorMessage, providerErrorMessage, readSse, stoppedBy, type Capabilities, type EventSink, type ModelInfo, type RunOutcome, type Source } from "@reasontrace/core";
import type { Completion, RunRequest, TokenLogprob, TraceEvent, UnavailableDepth } from "@reasontrace/format";
import { redact, type KeyStore, type Secret } from "@reasontrace/keys";
import type { Preset } from "./presets.ts";
import { splitThink, ThinkSplitter } from "./think.ts";

export interface Deps {
  keys: KeyStore;
  fetch?: typeof fetch;
}

/** OpenAI caps `top_logprobs` at 20, and most compatible servers follow it. */
const MAX_TOP_LOGPROBS = 20;

interface Chunk {
  model?: string;
  error?: { message?: string } | string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  choices?: {
    delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; refusal?: string | null };
    logprobs?: { content?: { token: string; logprob: number; top_logprobs?: { token: string; logprob: number }[] }[] | null } | null;
    finish_reason?: string | null;
  }[];
}

/** Everything read from one streamed reply, kept as it arrives so a run cut short still has it. */
class Reply {
  reasoningField = "";
  content = "";
  refusal = "";
  /**
   * Token probabilities by the channel their chunk carried. Servers that
   * separate reasoning (llama.cpp, vLLM) still send its tokens' probabilities.
   */
  reasoningTokens: TokenLogprob[] = [];
  contentTokens: TokenLogprob[] = [];
  finishReason: string | null = null;
  respondingModel?: string;
  usage?: RunOutcome["usage"];
  error?: string;
}

const internalsUnavailable = (name: string): UnavailableDepth => ({
  depth: "internals",
  reason: `${name} is reached over HTTP, which exposes no activations. The full tier reads them from local weights.`,
});

/** Splits the token list at a character offset into the reply, for replies whose reasoning was inline. */
function tokensBefore(tokens: TokenLogprob[], offset: number): [TokenLogprob[], TokenLogprob[]] {
  let consumed = 0;
  let index = 0;
  while (index < tokens.length && consumed < offset) consumed += tokens[index++].token.length;
  return [tokens.slice(0, index), tokens.slice(index)];
}

/** One OpenAI-compatible endpoint (docs/ARCHITECTURE.md §4). */
export function openaiCompatible(preset: Preset, deps: Deps): Source {
  const doFetch = deps.fetch ?? fetch;

  const headersFor = (key: Secret | null): Record<string, string> => ({
    "content-type": "application/json",
    ...(key ? { authorization: `Bearer ${key.reveal()}` } : {}),
  });

  const capabilities = (model: string): Capabilities => {
    const declared = preset.declare?.(model) ?? { unavailable: [] };
    return { tier: declared.tier ?? preset.tier, unavailable: [...declared.unavailable, internalsUnavailable(preset.name)] };
  };

  return {
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    needsKey: preset.needsKey,
    capabilities,

    async models(signal) {
      const key = await deps.keys.get(preset.id);
      let response: Response;
      try {
        response = await doFetch(`${preset.baseUrl}/models`, { headers: headersFor(key), signal });
      } catch (error) {
        throw new Error(redact(`Could not reach ${preset.name} at ${preset.baseUrl}: ${fetchErrorMessage(error)}`, key), { cause: error });
      }
      const body = await response.text();
      if (!response.ok) throw new Error(redact(`${preset.name} answered HTTP ${response.status}: ${providerErrorMessage(body)}`, key));
      const { data } = JSON.parse(body) as { data?: { id: string; name?: string }[] };
      if (!Array.isArray(data)) throw new Error(`${preset.name} answered without a model list.`);
      return data.map((m): ModelInfo => ({ id: m.id, ...(m.name ? { name: m.name } : {}) })).sort((a, b) => a.id.localeCompare(b.id));
    },

    async run(request: RunRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome> {
      const key = await deps.keys.get(preset.id);
      const unavailable: UnavailableDepth[] = [];
      if (preset.needsKey && !key) {
        return { completion: { state: "error", reason: `No ${preset.name} key is stored. Add one before running.` }, unavailable };
      }

      const body: Record<string, unknown> = {
        model: request.model,
        messages: [{ role: "user", content: request.prompt }],
        stream: true,
        stream_options: { include_usage: true },
        [preset.maxTokensField]: request.maxTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      };
      const topLogprobs = Math.min(request.topLogprobs, MAX_TOP_LOGPROBS);
      if (topLogprobs > 0) Object.assign(body, { logprobs: true, top_logprobs: topLogprobs });

      const reply = new Reply();
      const splitter = new ThinkSplitter();
      let completion: Completion | null = null;

      const post = () => doFetch(`${preset.baseUrl}/chat/completions`, { method: "POST", headers: headersFor(key), body: JSON.stringify(body), signal });

      try {
        let response = await post();
        if (!response.ok) {
          const message = redact(providerErrorMessage(await response.text()), key);
          // Some providers and models refuse the probabilities request outright.
          // Run without it, and record that refusal as the reason the depth is missing.
          if (response.status === 400 && "logprobs" in body && /logprob/i.test(message)) {
            delete body.logprobs;
            delete body.top_logprobs;
            unavailable.push({ depth: "probabilities", reason: `${preset.name} refused the request for log-probabilities: ${message}` });
            response = await post();
            if (!response.ok) completion = { state: "error", reason: `HTTP ${response.status}: ${redact(providerErrorMessage(await response.text()), key)}` };
          } else {
            completion = { state: "error", reason: `HTTP ${response.status}: ${message}` };
          }
        }

        if (!completion) {
          if (!response.body) throw new Error("The response has no body.");
          for await (const message of readSse(response.body)) {
            if (message.data === "[DONE]") break;
            let chunk: Chunk;
            try {
              chunk = JSON.parse(message.data) as Chunk;
            } catch {
              reply.error = `The stream sent an event that is not JSON: ${message.data.slice(0, 200)}`;
              break;
            }
            if (chunk.error) {
              reply.error = typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "The stream reported an error with no message.";
              break;
            }
            if (chunk.model) reply.respondingModel = chunk.model;
            if (chunk.usage) {
              reply.usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
              };
            }
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta ?? {};
            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (reasoning) {
              reply.reasoningField += reasoning;
              sink.delta("reasoning", reasoning);
            }
            if (delta.content) {
              reply.content += delta.content;
              for (const part of splitter.feed(delta.content)) sink.delta(part.channel, part.text);
            }
            if (delta.refusal) reply.refusal += delta.refusal;
            // A chunk with neither text, such as llama.cpp's `<think>` tag token,
            // belongs with reasoning until the answer has started.
            const tokens = reasoning || (!delta.content && !reply.content) ? reply.reasoningTokens : reply.contentTokens;
            for (const t of choice.logprobs?.content ?? []) {
              tokens.push({ token: t.token, logprob: t.logprob, top: (t.top_logprobs ?? []).map(({ token, logprob }) => ({ token, logprob })) });
            }
            if (choice.finish_reason) reply.finishReason = choice.finish_reason;
          }
          for (const part of splitter.flush()) sink.delta(part.channel, part.text);
        }
      } catch (error) {
        completion = signal.aborted
          ? stoppedBy(signal, request.timeoutMs)
          : { state: "error", reason: redact(`Could not reach ${preset.name} at ${preset.baseUrl}: ${fetchErrorMessage(error)}`, key) };
      }

      if (reply.error) reply.error = redact(reply.error, key);
      completion ??= completionOf(reply, request);
      recordReply(reply, sink, preset.name, completion);

      if (completion.state !== "error" || reply.content || reply.reasoningField) {
        if (!reply.reasoningField && splitThink(reply.content).reasoning === null && !capabilities(request.model).unavailable.some((u) => u.depth === "stated")) {
          unavailable.push({ depth: "stated", reason: "The model returned no reasoning text." });
        }
        if (topLogprobs > 0 && reply.reasoningTokens.length + reply.contentTokens.length === 0 && !unavailable.some((u) => u.depth === "probabilities")) {
          unavailable.push({ depth: "probabilities", reason: `${preset.name} returned no log-probabilities for this model.` });
        }
      }
      if (topLogprobs === 0) unavailable.push({ depth: "probabilities", reason: "Not requested for this run." });

      return { completion, unavailable, providerRequest: body, respondingModel: reply.respondingModel, usage: reply.usage };
    },
  };
}

function completionOf(reply: Reply, request: RunRequest): Completion {
  if (reply.error) return { state: "error", reason: reply.error };
  if (reply.refusal) return { state: "refused", reason: reply.refusal };
  switch (reply.finishReason) {
    case "length":
      return { state: "truncated", reason: `Reached the limit of ${request.maxTokens} output tokens.` };
    case "content_filter":
      return { state: "refused", reason: "The provider's content filter stopped the response." };
    case null:
      return { state: "error", reason: "The stream ended without a finish reason." };
    default:
      return { state: "complete" };
  }
}

/** Turns a reply into events: reasoning, then the answer, then any failure, with token probabilities attached. */
function recordReply(reply: Reply, sink: EventSink, sourceName: string, completion: Completion): void {
  const inline = splitThink(reply.content);
  const viaField = reply.reasoningField.trim();
  const reasoning = viaField || inline.reasoning;
  let step = 0;
  const event = (fields: Pick<TraceEvent, "id" | "type" | "content"> & Partial<TraceEvent>): TraceEvent => {
    const e: TraceEvent = { step: ++step, depth: "behaviour", label: "observed", supports: [], source: sourceName, ...fields };
    sink.event(e);
    return e;
  };

  // With inline reasoning the content tokens cover reasoning and answer; split them where the answer starts.
  const [reasoningTokens, outputTokens] = !viaField && inline.reasoning !== null
    ? tokensBefore([...reply.reasoningTokens, ...reply.contentTokens], inline.outputStart)
    : [reply.reasoningTokens, reply.contentTokens];

  if (reasoning) {
    event({ id: "reasoning", type: "reasoning", depth: "stated", label: "stated", content: reasoning, metadata: { via: viaField ? "reasoning field" : "<think> tags" } });
    if (reasoningTokens.length) sink.attach({ kind: "probs.top_k/1", eventId: "reasoning", label: "measured", data: { tokens: reasoningTokens } });
  }
  const output = viaField ? reply.content : inline.output;
  // An empty answer is recorded only when the model finished: a run cut off
  // before answering has no answer, which its completion state already says.
  if (output || completion.state === "complete") {
    event({ id: "output", type: "final_answer", content: output, metadata: { finishReason: reply.finishReason } });
    if (outputTokens.length) sink.attach({ kind: "probs.top_k/1", eventId: "output", label: "measured", data: { tokens: outputTokens } });
  }
  if (reply.refusal) event({ id: "refusal", type: "final_answer", content: reply.refusal, metadata: { refusal: true } });
  if (completion.state === "error" || completion.state === "timeout") {
    event({ id: "failure", type: "failure", content: completion.reason ?? completion.state });
  }
}
