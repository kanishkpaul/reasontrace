import { computeDiagnostics } from "@reasontrace/analysis";
import type { ReasonTrace, TraceDiagnostics } from "@reasontrace/format";

const cache = new WeakMap<ReasonTrace, TraceDiagnostics>();

/**
 * Diagnostics for a trace, computed once per trace object however many
 * components ask. Traces are replaced, never mutated, when one opens, so the
 * object is a safe key.
 */
export function diagnosticsFor(trace: ReasonTrace): TraceDiagnostics {
  let diagnostics = cache.get(trace);
  if (!diagnostics) {
    diagnostics = computeDiagnostics(trace);
    cache.set(trace, diagnostics);
  }
  return diagnostics;
}
