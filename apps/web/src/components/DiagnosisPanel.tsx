import React from "react";
import { useShallow } from "zustand/react/shallow";
import { useTraceStore } from "../store";
import { diagnosticsFor } from "../lib/diagnostics";
import { downloadFile, fileNameFor } from "../lib/download";
import { GROUNDING_TEXT } from "../lib/grounding";
import { DownloadIcon } from "../lib/icons";

// Red is kept for explicit failures (apps/web/STYLE.md); a heuristic
// finding, however severe, is a warning to check.
const SEVERITY_BADGE = {
  failure: "badge--destructive",
  critical: "badge--warn",
  warning: "badge--warn",
  info: "badge--muted",
} as const;

export const DiagnosisPanel: React.FC = () => {
  const { currentTrace, setSelectedNodeId } = useTraceStore(useShallow((s) => ({ currentTrace: s.currentTrace, setSelectedNodeId: s.setSelectedNodeId })));

  const diagnostics = currentTrace ? diagnosticsFor(currentTrace) : null;

  // 2. Export diagnosis as Markdown file
  const exportDiagnosisAsMarkdown = () => {
    if (!currentTrace || !diagnostics) return;
    const grounding = GROUNDING_TEXT[diagnostics.answerGrounding];

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
    md += `| Hypothesis/Observation Ratio | ${diagnostics.hypothesisToObservationRatio ?? "n/a (no observations)"} |\n\n`;

    md += `## 2. Evidence Grounding Status\n\n`;
    md += `**${grounding.title}.** ${grounding.detail}\n`;
    md += `\n`;

    md += `## 3. Findings\n\n`;
    if (diagnostics.findings.length === 0) {
      md += `No check raised a finding. The checks cover declared support links, repeated calls, recorded failures and stated confidence; they do not judge whether the reasoning is correct.\n`;
    } else {
      diagnostics.findings.forEach(f => {
        md += `- **${f.title}:** ${f.detail}\n  - Rule: ${f.rule}\n  - Limits: ${f.limitations}\n`;
        if (f.eventIds.length) md += `  - Events: ${f.eventIds.join(", ")}\n`;
      });
    }

    downloadFile(fileNameFor(currentTrace.title, "_diagnosis.md"), md, "text/markdown;charset=utf-8");
  };

  if (!currentTrace || !diagnostics) return null;

  const grounding = GROUNDING_TEXT[diagnostics.answerGrounding];
  const counts: [string, number | string][] = [
    ["Hypotheses", diagnostics.hypothesisCount],
    ["Actions", diagnostics.actionCount],
    ["Observations", diagnostics.observationCount],
    ["Updates", diagnostics.beliefUpdateCount],
    ["Decisions", diagnostics.decisionCount],
    ["Failures", diagnostics.failureCount],
    ["Answers", diagnostics.finalAnswerCount],
    ["Hypotheses per observation", diagnostics.hypothesisToObservationRatio ?? "—"],
  ];

  return (
    <div className="findings">
      <div className="findings__head">
        <span className="dot" data-grounding={diagnostics.answerGrounding} />
        <strong>{grounding.title}</strong>
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportDiagnosisAsMarkdown}>
          <DownloadIcon />
          Export Markdown
        </button>
      </div>
      <p className="hint">{grounding.detail}</p>
      <p className="hint">
        Claims linked to observations:{" "}
        <span className="findings__number">
          {diagnostics.evidenceCoverage === null ? "not recorded" : `${diagnostics.evidenceCoverage}%`}
        </span>
      </p>

      <h3 className="section-heading">
        Findings · {diagnostics.findings.length}, {diagnostics.findings.filter((f) => f.severity !== "info").length} to check
      </h3>
      {diagnostics.findings.length === 0 ? (
        <p className="hint">No check raised a finding. The checks cover declared support links, repeated calls, recorded failures and stated confidence; they do not judge whether the reasoning is correct.</p>
      ) : (
        diagnostics.findings.map((finding) => (
          <button
            key={finding.id}
            type="button"
            className="row finding"
            disabled={finding.eventIds.length === 0}
            onClick={() => setSelectedNodeId(finding.eventIds[0])}
          >
            <span className="row__title">{finding.title}</span>
            <span className={`badge ${SEVERITY_BADGE[finding.category === "failure" ? "failure" : finding.severity]}`}>{finding.severity}</span>
            <span className="row__desc">
              {finding.detail}
              <span className="finding__rule"><b>Rule:</b> {finding.rule}</span>
              <span className="finding__rule"><b>Limits:</b> {finding.limitations}</span>
              <span className="finding__rule">{finding.recommendation}</span>
            </span>
          </button>
        ))
      )}

      <h3 className="section-heading">Event counts</h3>
      <dl className="findings__counts">
        {counts.map(([name, value]) => (<div key={name}><dt>{name}</dt><dd>{value}</dd></div>))}
      </dl>
    </div>
  );
};
