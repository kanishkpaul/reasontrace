import type { ReasonTrace } from "@reasontrace/format";

/**
 * The status bar names where the trace came from and what it can't show
 * (design/system/DESIGN.md: the status bar is honest). A trace file was not
 * run here, so there is no model, seed or determinism check to report.
 */
export function StatusBar({ trace, saved }: { trace: ReasonTrace; saved: boolean }) {
  const steps = new Set(trace.events.map((e) => e.step)).size;
  return (
    <footer className="app__status">
      <span>imported trace file · no model run here</span>
      <span>{trace.events.length} events · {steps} steps</span>
      {trace.unavailable.length > 0 && (
        <span title={trace.unavailable.map((u) => `${u.depth}: ${u.reason}`).join("\n")}>
          unavailable: {trace.unavailable.map((u) => u.depth).join(", ")}
        </span>
      )}
      <span>format v{trace.formatVersion}</span>
      {!saved && <span className="app__status-warn">not saved in this browser: storage refused it</span>}
    </footer>
  );
}
