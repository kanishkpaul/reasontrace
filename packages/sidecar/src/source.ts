import { join } from "node:path";
import { stoppedBy, type Capabilities, type EventSink, type ModelInfo, type RunOutcome, type Source } from "@reasontrace/core";
import type { CapturePlan, Completion, Depth, ResidualAttachment, RunRequest, Runtime, TokenLogprob, TraceEvent, UnavailableDepth } from "@reasontrace/format";
import { Sidecar, SidecarError, type SidecarCommand } from "./client.ts";

/** Every layer at the last position: about 115 KB for Qwen3 0.6B, small enough to keep for every run. */
export const DEFAULT_PLAN: CapturePlan = { layers: "all", positions: "last", pooling: "none" };

interface SidecarModel {
  id: string;
  name: string;
  repo: string;
  /** The cached weights' commit, or null when they will be downloaded on first run. */
  revision: string | null;
  noReasoning: string | null;
}

interface Token extends TokenLogprob {
  id: number;
}

/** What the sidecar's `run` answers. */
interface RunResult {
  reasoning: { text: string; tokens: Token[]; closed: boolean } | null;
  output: { text: string; tokens: Token[] };
  finish: "stop" | "length" | "cancelled";
  usage: { inputTokens: number; outputTokens: number };
  generation: Record<string, unknown>;
  capture: ResidualAttachment["data"] | null;
  runtime: Runtime;
}

const DEPTHS: Depth[] = ["behaviour", "stated", "probabilities", "internals"];

const withoutIds = (tokens: Token[]): TokenLogprob[] => tokens.map(({ token, logprob, top }) => ({ token, logprob, top }));

/**
 * Open weights run by the Python sidecar: the full tier (docs/CHARTER.md §1).
 * The sidecar starts on first use. When it can't (no uv, no Python, no model
 * runtime), every depth is unavailable with that reason.
 */
export function weightsSource(command: SidecarCommand): Source & { stop(): Promise<void> } {
  let sidecar: Sidecar | null = null;
  let unavailable: string | null = null;
  let models: SidecarModel[] = [];

  /** The running sidecar, starting one if needed. Throws with the reason it can't run. */
  async function ready(): Promise<Sidecar> {
    if (sidecar?.running) return sidecar;
    sidecar = new Sidecar(command);
    try {
      const hello = await sidecar.start();
      unavailable = hello.unavailable;
    } catch (error) {
      unavailable = error instanceof Error ? error.message : String(error);
    }
    if (unavailable) {
      // Stop it, so the next call starts afresh and sees a runtime installed since.
      await sidecar.stop();
      throw new SidecarError(unavailable);
    }
    return sidecar;
  }

  const capabilities = (model: string): Capabilities => {
    if (unavailable) return { tier: "full", unavailable: DEPTHS.map((depth) => ({ depth, reason: unavailable! })) };
    const reason = models.find((m) => m.id === model)?.noReasoning;
    return { tier: "full", unavailable: reason ? [{ depth: "stated", reason }] : [] };
  };

  return {
    id: "weights",
    name: "Local weights (Python sidecar)",
    baseUrl: `stdio: ${[command.command, ...command.args].join(" ")}`,
    needsKey: false,
    capabilities,

    async models(): Promise<ModelInfo[]> {
      models = await (await ready()).request<SidecarModel[]>("models", {});
      return models.map((m) => ({ id: m.id, name: m.revision ? m.name : `${m.name} (downloads on first run)` }));
    },

    async run(request: RunRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome> {
      if (!sink.dir) throw new Error("The weights source writes tensors, so its sink needs a run directory.");
      const found: UnavailableDepth[] = [];
      let process: Sidecar;
      try {
        process = await ready();
      } catch (error) {
        return { completion: { state: "error", reason: (error as Error).message }, unavailable: [] };
      }

      const plan = request.plan ?? DEFAULT_PLAN;
      const call = process.call<RunResult>("run", {
        model: request.model,
        prompt: request.prompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature ?? 0,
        seed: request.seed ?? 0,
        topLogprobs: request.topLogprobs,
        cache: request.cache ?? true,
        plan,
        tensorsDir: join(sink.dir, "tensors"),
      }, (channel, text) => sink.delta(channel, text));
      const cancel = () => process.cancel(call.id);
      signal.addEventListener("abort", cancel, { once: true });

      let result: RunResult;
      try {
        result = await call.result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        sink.event({ id: "failure", type: "failure", step: 1, depth: "behaviour", label: "observed", content: reason, supports: [], source: "Python sidecar" });
        return { completion: { state: "error", reason }, unavailable: [] };
      } finally {
        signal.removeEventListener("abort", cancel);
      }

      let step = 0;
      const record = (fields: Pick<TraceEvent, "id" | "type" | "content"> & Partial<TraceEvent>) =>
        sink.event({ step: ++step, depth: "behaviour", label: "observed", supports: [], source: result.runtime.revision ? `${request.model}@${result.runtime.revision.slice(0, 7)}` : request.model, ...fields });

      if (result.reasoning?.text) {
        record({ id: "reasoning", type: "reasoning", depth: "stated", label: "stated", content: result.reasoning.text, metadata: { via: "<think> tags", closed: result.reasoning.closed } });
        if (request.topLogprobs > 0) sink.attach({ kind: "probs.top_k/1", eventId: "reasoning", label: "measured", data: { tokens: withoutIds(result.reasoning.tokens) } });
      } else if (!capabilities(request.model).unavailable.some((u) => u.depth === "stated")) {
        found.push({ depth: "stated", reason: "The model returned no reasoning text." });
      }

      const completion: Completion = result.finish === "cancelled"
        ? stoppedBy(signal, request.timeoutMs)
        : result.finish === "length"
          ? { state: "truncated", reason: `Reached the limit of ${request.maxTokens} output tokens.` }
          : { state: "complete" };

      // An empty answer is recorded only when the model finished: a run cut off
      // before answering has no answer, which its completion state already says.
      if (result.output.text || completion.state === "complete") {
        record({ id: "output", type: "final_answer", content: result.output.text, metadata: { finish: result.finish } });
        if (request.topLogprobs > 0) sink.attach({ kind: "probs.top_k/1", eventId: "output", label: "measured", data: { tokens: withoutIds(result.output.tokens) } });
      }
      if (request.topLogprobs === 0) found.push({ depth: "probabilities", reason: "Not requested for this run." });

      if (result.capture) {
        const { layers, positions, dModel, pooling, file } = result.capture;
        record({
          id: "activations",
          type: "activation",
          depth: "internals",
          label: "measured",
          content: `Residual stream at ${layers.length} layer${layers.length === 1 ? "" : "s"} × ${pooling === "mean" ? `mean of ${positions.length}` : positions.length} position${positions.length === 1 ? "" : "s"}, ${dModel} wide, float32, in ${file}.`,
        });
        sink.attach({ kind: "activations.residual/1", eventId: "activations", label: "measured", data: result.capture });
      } else {
        found.push({ depth: "internals", reason: "The run stopped before capture, which runs after generation." });
      }

      return { completion, unavailable: found, providerRequest: result.generation, usage: result.usage, runtime: result.runtime };
    },

    async stop() {
      await sidecar?.stop();
    },
  };
}
