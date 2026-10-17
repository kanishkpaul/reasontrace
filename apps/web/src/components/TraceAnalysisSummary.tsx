import React, { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTraceStore } from "../store";
import { computeDiagnostics } from "@reasontrace/analysis";
import { Activity, Eye, ShieldCheck, TriangleAlert } from "lucide-react";

export const TraceAnalysisSummary: React.FC = () => {
  const { currentTrace } = useTraceStore(useShallow((s) => ({ currentTrace: s.currentTrace })));
  const diagnostics = useMemo(() => currentTrace ? computeDiagnostics(currentTrace) : null, [currentTrace]);

  if (!currentTrace || !diagnostics) return null;

  const critical = diagnostics.findings.filter(finding => finding.severity === "critical").length;
  const isGrounded = diagnostics.answerGrounding === "grounded";

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-cyber-border overflow-hidden rounded-lg border border-cyber-border bg-cyber-card sm:grid-cols-4 sm:divide-y-0 shrink-0">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-cyber-muted text-[10px] uppercase font-medium tracking-wider"><Activity className="w-3.5 h-3.5" /> Trace</div>
        <div className="mt-1 flex items-baseline gap-1.5"><span className="text-base font-semibold text-cyber-text">{currentTrace.events.length}</span><span className="text-[11px] text-cyber-muted">events</span></div>
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-cyber-muted text-[10px] uppercase font-medium tracking-wider"><ShieldCheck className="w-3.5 h-3.5" /> Linked to observations</div>
        {diagnostics.evidenceCoverage === null ? (
          <div className="mt-1 text-[11px] leading-tight text-cyber-muted">{diagnostics.answerGrounding === "not_recorded" ? "Not recorded: the trace has no support links" : "No claims to check"}</div>
        ) : (
          <div className="mt-1 flex items-baseline gap-1.5"><span className="text-base font-semibold text-cyber-text">{diagnostics.evidenceCoverage}%</span><span className="text-[11px] text-cyber-muted">of claims, by declared links</span></div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-cyber-muted text-[10px] uppercase font-medium tracking-wider"><Eye className="w-3.5 h-3.5" /> Visibility</div>
        <div className="mt-1 text-[11px] leading-tight text-cyber-text">{diagnostics.opaqueEventCount ? <><span className="font-bold text-cyan-400">Observed behavior</span><span className="text-cyber-muted"> · {diagnostics.opaqueEventCount} records</span></> : <><span className="font-bold text-purple-400">Explicit trace</span><span className="text-cyber-muted"> · reasoning provided</span></>}</div>
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-cyber-muted text-[10px] uppercase font-medium tracking-wider"><TriangleAlert className="w-3.5 h-3.5" /> Review status</div>
        <div className="mt-1 text-[11px] leading-tight">{critical ? <span className="font-bold text-rose-400">{critical} critical finding{critical > 1 ? "s" : ""}</span> : isGrounded ? <span className="font-bold text-emerald-400">Evidence path found</span> : <span className="font-bold text-amber-400">Needs review</span>}</div>
      </div>
    </div>
  );
};
