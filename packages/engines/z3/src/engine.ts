import { stoppedBy, type Engine, type EventSink, type RunOutcome } from "@reasontrace/core";
import type { ModelAttachment, ProofTreeAttachment, SolveRequest, TraceEvent, UnsatCoreAttachment } from "@reasontrace/format";
import { init, type Expr, type FuncDecl, type FuncInterp, type Model } from "z3-solver";

type Z3 = Awaited<ReturnType<typeof init>>;

/** How many proof steps a run keeps. Past it the steps nearest the conclusion are kept and the cut is recorded. */
export const PROOF_LIMIT = 1000;

/** A core this size or smaller is listed by number in its event's text; a larger one is counted. */
const CORE_LISTED = 10;

let loaded: Promise<Z3> | null = null;

/** z3 loads once per process. Proof production is a global setting that each new context reads. */
function load(): Promise<Z3> {
  loaded ??= init().then((z3) => {
    z3.setParam("proof", true);
    return z3;
  });
  return loaded;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * The proof read breadth first from its conclusion. Every z3 proof term ends
 * with the formula it proves; the arguments before it are the proofs it uses.
 */
export function proofTree(proof: Expr, limit: number): ProofTreeAttachment["data"] {
  const index = new Map([[proof.id(), 0]]);
  const queue = [proof];
  const steps: ProofTreeAttachment["data"]["steps"] = [];
  for (let i = 0; i < queue.length; i++) {
    const term = queue[i];
    const args = range(term.numArgs()).map((j) => term.arg(j));
    const premises = args.slice(0, -1).map((premise) => {
      if (!index.has(premise.id())) {
        index.set(premise.id(), queue.length);
        queue.push(premise);
      }
      return index.get(premise.id())!;
    });
    if (i < limit) {
      steps.push({ rule: String(term.decl().name()), params: term.decl().params().map(String), premises, conclusion: args[args.length - 1].toString() });
    }
  }
  const truncated = queue.length > limit
    ? `The proof has ${queue.length} steps, over the limit of ${limit}; the ${limit} nearest the conclusion are kept.`
    : null;
  return { steps, total: queue.length, limit, truncated };
}

function valueOf(model: Model, decl: FuncDecl): string {
  const value = model.get(decl);
  if (decl.arity() === 0) return String(value);
  const interp = value as FuncInterp;
  const entries = range(interp.numEntries()).map((i) => {
    const entry = interp.entry(i);
    return `(${range(entry.numArgs()).map((j) => String(entry.argValue(j))).join(", ")}) ↦ ${entry.value()}`;
  });
  return [...entries, `else ↦ ${interp.elseValue()}`].join("; ");
}

function sortOf(decl: FuncDecl): string {
  const domain = range(decl.arity()).map((i) => String(decl.domain(i)));
  return domain.length ? `(${domain.join(", ")}) → ${decl.range()}` : String(decl.range());
}

/**
 * z3 through its official WebAssembly build, on SMT-LIB 2 problems. A run
 * records the result as the engine's behaviour and, as `exact` derivations, the
 * model when it is satisfiable, or the proof and an unsat core when it is not.
 */
export function z3Engine(limit = PROOF_LIMIT): Engine {
  return {
    id: "z3",
    name: "z3",
    language: "SMT-LIB 2",
    where: "this machine: z3-solver WebAssembly",
    capabilities: () => ({
      tier: "symbolic",
      unavailable: [
        { depth: "stated", reason: "A solver does not narrate. Its derivation is under internals." },
        { depth: "probabilities", reason: "A solver has no token probabilities." },
      ],
    }),
    async solve(request: SolveRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome> {
      const z3 = await load();
      const engine = { name: "z3", version: z3.getVersionString() };
      const end = (outcome: RunOutcome): RunOutcome => ({ ...outcome, versions: { z3: engine.version } });
      const ctx = new z3.Context("main");
      const interrupt = () => ctx.interrupt();
      signal.addEventListener("abort", interrupt);
      try {
        const solver = new ctx.Solver();
        try {
          solver.fromString(request.problem);
        } catch (error) {
          return end({ completion: { state: "error", reason: `Could not read the problem: ${error instanceof Error ? error.message : String(error)}` }, unavailable: [] });
        }
        const assertions = [...solver.assertions()];
        const result = await solver.check();
        if (signal.aborted) return end({ completion: stoppedBy(signal, request.timeoutMs), unavailable: [] });

        const derived: TraceEvent[] = [];
        const missing: string[] = [];
        const derivation = (content: string): TraceEvent => {
          const event: TraceEvent = { id: `d${derived.length + 1}`, type: "derivation", step: 1, content, depth: "internals", label: "exact", supports: [], source: "z3" };
          derived.push(event);
          sink.event(event);
          return event;
        };

        if (result === "sat") {
          const model = solver.model();
          const values = model.decls().map((decl) => ({ name: String(decl.name()), sort: sortOf(decl), value: valueOf(model, decl) }));
          const event = derivation(`Model: ${values.length} value${values.length === 1 ? "" : "s"}`);
          sink.attach({ kind: "symbolic.model/1", eventId: event.id, label: "exact", engine, data: { values } } satisfies ModelAttachment);
        } else if (result === "unsat") {
          const proof = solver.proof();
          if (proof) {
            const data = proofTree(proof, limit);
            const event = derivation(`Proof of unsatisfiability: ${data.total} steps${data.truncated ? `, ${data.steps.length} kept` : ""}`);
            sink.attach({ kind: "symbolic.proof_tree/1", eventId: event.id, label: "exact", engine, data } satisfies ProofTreeAttachment);
          } else {
            missing.push("z3 returned no proof.");
          }
          // Tracking each assertion changes the proof, so the core comes from a second check.
          const tracked = new ctx.Solver();
          const trackers = assertions.map((assertion, i) => {
            const tracker = ctx.Bool.const(`assertion ${i + 1}`);
            tracked.addAndTrack(assertion, tracker);
            return tracker.id();
          });
          const tracking = await tracked.check();
          if (signal.aborted) return end({ completion: stoppedBy(signal, request.timeoutMs), unavailable: [] });
          if (tracking === "unsat") {
            const core = [...tracked.unsatCore()].map((tracker) => trackers.indexOf(tracker.id())).sort((a, b) => a - b)
              .map((i) => ({ index: i + 1, formula: String(assertions[i]) }));
            const which = core.length <= CORE_LISTED ? `assertion${core.length === 1 ? "" : "s"} ${core.map((c) => c.index).join(", ")}` : `${core.length} assertions`;
            const event = derivation(`Unsat core: ${which} of ${assertions.length}`);
            sink.attach({ kind: "symbolic.unsat_core/1", eventId: event.id, label: "exact", engine, data: { assertions: assertions.length, core } } satisfies UnsatCoreAttachment);
          } else {
            missing.push(`The second check, for an unsat core, returned ${tracking}.`);
          }
        }

        if (result === "unknown") missing.push(`z3 returned unknown (${solver.reasonUnknown()}), so it has no model or proof.`);
        const answer = result === "unknown" ? `unknown: ${solver.reasonUnknown()}` : result;
        sink.event({ id: "a1", type: "final_answer", step: 1, content: answer, depth: "behaviour", label: "observed", supports: derived.map((e) => e.id), source: "z3" });
        return end({ completion: { state: "complete" }, unavailable: missing.length ? [{ depth: "internals", reason: missing.join(" ") }] : [] });
      } finally {
        signal.removeEventListener("abort", interrupt);
      }
    },
  };
}
