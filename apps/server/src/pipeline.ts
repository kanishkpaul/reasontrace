import { extractFormula, readTranslation } from "@reasontrace/analysis";
import type { Engine, EventSink, RunOutcome } from "@reasontrace/core";
import type { PipelineSpec, TraceEvent } from "@reasontrace/format";

/** A sink that keeps a copy of each event it passes on, so the pipeline can read the model's reply. */
export function watched(sink: EventSink): { sink: EventSink; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  return {
    events,
    sink: {
      dir: sink.dir,
      delta: (channel, text) => sink.delta(channel, text),
      event: (event) => {
        events.push(event);
        sink.event(event);
      },
      attach: (attachment) => sink.attach(attachment),
    },
  };
}

/** The engine numbers its steps from 1; in a pipeline they come after the model's. */
const after = (sink: EventSink, steps: number): EventSink => ({
  dir: sink.dir,
  delta: (channel, text) => sink.delta(channel, text),
  event: (event) => sink.event({ ...event, step: event.step + steps }),
  attach: (attachment) => sink.attach(attachment),
});

/**
 * The second half of a pipeline: the formula in the model's reply becomes a
 * translation event, lined up against the problem, and the engine solves it.
 * A model run that did not complete stops the pipeline there.
 */
export async function solveTranslation(spec: PipelineSpec, engine: Engine, events: TraceEvent[], sink: EventSink, signal: AbortSignal, model: RunOutcome): Promise<RunOutcome> {
  if (model.completion.state !== "complete") return model;
  const output = events.find((e) => e.id === "output");
  const formula = output ? extractFormula(output.content) : null;
  if (formula === null) {
    return { ...model, completion: { state: "error", reason: "The model's reply has no SMT-LIB in it, so there was nothing to solve." } };
  }

  const step = Math.max(0, ...events.map((e) => e.step));
  sink.event({ id: "translation", type: "translation", step: step + 1, depth: "behaviour", label: "observed", content: formula, supports: ["output"], source: "pipeline" });
  sink.attach({ kind: "nesy.translation/1", eventId: "translation", label: "inferred", data: readTranslation(spec.text, formula) });

  const solved = await engine.solve({ engine: engine.id, problem: formula, timeoutMs: spec.timeoutMs }, after(sink, step + 1), AbortSignal.any([signal, AbortSignal.timeout(spec.timeoutMs)]));
  const reason = solved.completion.reason && `${engine.name}: ${solved.completion.reason}`;
  return {
    ...model,
    completion: reason ? { ...solved.completion, reason } : solved.completion,
    unavailable: [...model.unavailable, ...solved.unavailable.map((u) => ({ ...u, reason: `${engine.name}: ${u.reason}` }))],
    versions: { ...model.versions, ...solved.versions },
  };
}
