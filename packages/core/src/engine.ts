import type { SolveRequest } from "@reasontrace/format";
import type { Capabilities, EventSink, RunOutcome } from "./source.ts";

/** A symbolic engine run on this machine. Its derivations are recorded as `exact` (docs/CHARTER.md §2). */
export interface Engine {
  id: string;
  name: string;
  /** The language problems are written in. */
  language: string;
  /** Where it runs, recorded as the run's `source.baseUrl`. */
  where: string;
  capabilities(): Capabilities;
  /** Resolves with how the solve ended. A parse error, a timeout and `unknown` are outcomes, not rejections. */
  solve(request: SolveRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome>;
}
