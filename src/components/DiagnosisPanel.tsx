import React, { useMemo } from "react";
import { useTraceStore } from "../store";
import { computeDiagnostics } from "../lib/diagnostics";
import { AlertCircle, CheckCircle, BarChart3, Download, Sparkles } from "lucide-react";

export const DiagnosisPanel: React.FC = () => {
  const { currentTrace } = useTraceStore();

  // 1. Calculate diagnostics
  const diagnostics = useMemo(() => {
    if (!currentTrace) return null;
    return computeDiagnostics(currentTrace);
  }, [currentTrace]);

  // 2. Export diagnosis as Markdown file
  const exportDiagnosisAsMarkdown = () => {
    if (!currentTrace || !diagnostics) return;

    let md = `# ReasonTrace Diagnostics Report\n`;
    md += `**Trace Title:** ${currentTrace.title}\n`;
    md += `**Date of Diagnosis:** ${new Date().toLocaleDateString()}\n\n`;

    md += `## 1. Summary Metrics\n\n`;
    md += `| Metric | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| Total Events | ${currentTrace.events.length} |\n`;
    md += `| Hypotheses | ${diagnostics.hypothesisCount} |\n`;
    md += `| Actions | ${diagnostics.actionCount} |\n`;
    md += `| Observations | ${diagnostics.observationCount} |\n`;
    md += `| Belief Updates | ${diagnostics.beliefUpdateCount} |\n`;
    md += `| Decisions | ${diagnostics.decisionCount} |\n`;
    md += `| Failures | ${diagnostics.failureCount} |\n`;
    md += `| Final Answers | ${diagnostics.finalAnswerCount} |\n`;
    md += `| Hypothesis/Observation Ratio | ${diagnostics.hypothesisToObservationRatio} |\n\n`;

    md += `## 2. Evidence Grounding Status\n\n`;
    md += diagnostics.hasEvidenceChain 
      ? `✅ **Grounded:** The final answer shares a valid causal link tracing back to observations or evidence.\n`
      : `⚠️ **Weakly Grounded:** The final answer does not have a direct causal connection tracing back to observations or belief updates in the reasoning graph.\n`;
    md += `\n`;

    md += `## 3. Cognitive Warnings & Inconsistencies\n\n`;
    if (diagnostics.warnings.length === 0) {
      md += `✅ No reasoning issues or looping behaviors were detected. The cognitive trajectory appears sound.\n`;
    } else {
      diagnostics.warnings.forEach(w => {
        md += `- ${w}\n`;
      });
    }

    // Trigger download
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${currentTrace.title.replace(/\s+/g, "_")}_diagnosis.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentTrace || !diagnostics) {
    return (
      <div className="h-full flex items-center justify-center text-center p-6 text-cyber-muted text-xs">
        No active trace loaded for diagnosis.
      </div>
    );
  }

  const hasWarnings = diagnostics.warnings.length > 0;

  return (
    <div className="flex flex-col bg-cyber-card border border-cyber-border rounded-xl overflow-hidden h-full shadow-cyber-glow">
      {/* Header */}
      <div className="p-4 border-b border-cyber-border bg-cyber-bg/50 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-cyber-primary">
          <Sparkles className="w-5 h-5" />
          <h3 className="text-sm font-bold text-cyber-text tracking-wide uppercase">
            Trace Diagnosis
          </h3>
        </div>
        <button
          onClick={exportDiagnosisAsMarkdown}
          className="flex items-center space-x-1 px-2.5 py-1 text-[10px] font-semibold text-cyber-text bg-cyber-border hover:bg-cyber-hover hover:text-cyber-primary border border-cyber-border rounded-lg transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export MD</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Metrics Grid */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted flex items-center">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Cognitive Metrics
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center">
              <span className="text-[9px] text-cyber-muted uppercase block">Hypotheses</span>
              <span className="text-sm font-bold text-cyan-400 font-mono">{diagnostics.hypothesisCount}</span>
            </div>
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center">
              <span className="text-[9px] text-cyber-muted uppercase block">Actions</span>
              <span className="text-sm font-bold text-blue-400 font-mono">{diagnostics.actionCount}</span>
            </div>
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center">
              <span className="text-[9px] text-cyber-muted uppercase block">Observations</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">{diagnostics.observationCount}</span>
            </div>
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center">
              <span className="text-[9px] text-cyber-muted uppercase block">Updates</span>
              <span className="text-sm font-bold text-purple-400 font-mono">{diagnostics.beliefUpdateCount}</span>
            </div>
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center">
              <span className="text-[9px] text-cyber-muted uppercase block">Failures</span>
              <span className={`text-sm font-bold font-mono ${diagnostics.failureCount > 0 ? "text-rose-400" : "text-cyber-muted"}`}>
                {diagnostics.failureCount}
              </span>
            </div>
            <div className="bg-cyber-bg border border-cyber-border p-2 rounded-lg text-center" title="Hypothesis to Observation Ratio">
              <span className="text-[9px] text-cyber-muted uppercase block">H-O Ratio</span>
              <span className="text-sm font-bold text-amber-400 font-mono">{diagnostics.hypothesisToObservationRatio}</span>
            </div>
          </div>
        </div>

        {/* Grounding Status Card */}
        <div className={`p-3 rounded-lg border flex items-start space-x-2.5 ${
          diagnostics.hasEvidenceChain 
            ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400" 
            : "bg-rose-950/10 border-rose-500/20 text-rose-400"
        }`}>
          {diagnostics.hasEvidenceChain ? (
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <span className="font-semibold block">
              {diagnostics.hasEvidenceChain ? "Evidence-Grounded Output" : "Weak Evidence Grounding"}
            </span>
            <span className="text-cyber-muted block mt-0.5">
              {diagnostics.hasEvidenceChain 
                ? "The final answer is successfully linked back to empirical observations."
                : "The final answer lacks a path tracking back to environmental observations."}
            </span>
          </div>
        </div>

        {/* Heuristic Issues Warnings */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted block">
            Cognitive Diagnostics ({diagnostics.warnings.length})
          </span>
          {hasWarnings ? (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {diagnostics.warnings.map((warn, i) => (
                <div key={i} className="p-2.5 bg-cyber-bg border border-cyber-border rounded-lg flex items-start space-x-2 text-xs">
                  <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                    warn.includes("breakdown") || warn.includes("loop") || warn.includes("weakly")
                      ? "text-rose-400 animate-pulse" 
                      : "text-amber-400"
                  }`} />
                  <span className="text-cyber-text font-sans leading-relaxed">
                    {warn}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-cyber-bg border border-cyber-border rounded-lg text-center text-xs text-cyber-muted flex flex-col items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-400 mb-2" />
              <span>Perfect cognitive coherence. No warnings or loop patterns detected in reasoning logs.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
