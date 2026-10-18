import { isSolveRequest, type ReasonTrace } from "@reasontrace/format";
import { useTraceStore } from "../store";
import { COMPLETION, TIER } from "../lib/completion";

/**
 * The status bar names where the trace came from and what it can't show
 * (design/system/DESIGN.md: the status bar is honest). A run shows its
 * manifest; a trace file was not run here, so it has no model or seed to report.
 */
export function StatusBar({ trace, saved }: { trace: ReasonTrace; saved: boolean }) {
  const manifest = useTraceStore((s) => s.run?.manifest);
  const steps = new Set(trace.events.map((e) => e.step)).size;
  const { request } = manifest ?? {};
  return (
    <footer className="app__status">
      {manifest && request ? (
        <>
          <span>tier {TIER[manifest.source.tier]} · {manifest.source.name}</span>
          {isSolveRequest(request) ? (
            <span>{request.engine} · timeout {request.timeoutMs / 1000} s</span>
          ) : (
            <span>{manifest.respondingModel ?? request.model}{manifest.pipeline ? ` → ${manifest.pipeline.engine}` : ""}</span>
          )}
          {isSolveRequest(request) ? null : manifest.runtime ? (
            <span>
              {manifest.runtime.device} · {manifest.runtime.dtype} · {manifest.runtime.quantization === "none" ? "not quantised" : manifest.runtime.quantization} · KV cache {manifest.runtime.cache ? "on" : "off"} · seed {manifest.runtime.seed} · peak memory ≥ {(manifest.runtime.peakMemoryBytes / 2 ** 30).toFixed(1)} GiB
            </span>
          ) : (
            <span>temperature {request.temperature ?? "default"} · seed {request.seed ?? "none"}</span>
          )}
          <span><span className={`dot ${COMPLETION[manifest.completion.state].dot}`} /> {COMPLETION[manifest.completion.state].word}</span>
          <span>determinism not checked</span>
          <span>run {manifest.id}</span>
        </>
      ) : (
        <span>imported trace file · no model run here</span>
      )}
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
