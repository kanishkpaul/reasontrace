import type { EventType, TraceEvent } from "@reasontrace/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { EVENT_TYPES } from "../lib/eventTypes";
import { CheckIcon, CopyIcon, ICON } from "../lib/icons";
import { useTraceStore } from "../store";
import { EvidenceLabel } from "./EvidenceLabel";

/** What each event type can show, and what to check next. Says no more than the event records. */
function readingOf(event: TraceEvent): string {
  const readings: Record<EventType, string> = {
    hypothesis: "A claim or plan. Check whether later actions and observations bear it out, and where it is revised.",
    action: "A tool call or other step taken. Check what it was meant to find out, and what came back.",
    observation: "What a tool or the environment returned. Check whether the next steps take it into account.",
    belief_update: event.label === "stated"
      ? "The model says it changed its belief. This is its own account, not a reading of its internal state. Check whether the evidence before it supports the change."
      : "Output the model produced between steps. It shows what the model said, not what it believed.",
    failure: "A failure the trace recorded. Look at the steps around it to see what led there and whether the agent recovered.",
    decision: "A choice between options. Compare it with the alternatives the trace mentions.",
    reasoning: event.providerSummary
      ? "A summary of the model's reasoning, written by the provider's summariser rather than the model. It can leave out or reword what drove the answer."
      : "Reasoning text the model emitted before answering. It is the model's own account, not a reading of its internal state; it can leave out what drove the answer.",
    final_answer: "The trace's final answer. Follow its support links back to see which observations it rests on; the links show what the trace declares, not whether the answer is right.",
  };
  return readings[event.type];
}

/** The rail's step detail: the selected event, its evidence label and the events linked to it. */
export function NodeInspector() {
  const { trace, selectedId, select } = useTraceStore(useShallow((s) => ({
    trace: s.currentTrace,
    selectedId: s.selectedNodeId,
    select: s.setSelectedNodeId,
  })));
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const event = useMemo(() => trace?.events.find((e) => e.id === selectedId) ?? null, [trace, selectedId]);
  const supportedBy = useMemo(() => (trace && event ? trace.events.filter((e) => event.supports.includes(e.id)) : []), [trace, event]);
  const supports = useMemo(() => (trace && event ? trace.events.filter((e) => e.supports.includes(event.id)) : []), [trace, event]);

  if (!event) {
    return (
      <div className="empty">
        <p className="empty__title">No step selected</p>
        <p>Select an event in the columns or the graph to see its detail and links.</p>
      </div>
    );
  }

  const { label, icon: Icon } = EVENT_TYPES[event.type];

  const copyAsMarkdown = () => {
    let md = `### [Step ${event.step}] ${label} (${event.label})\n\n`;
    if (event.confidence !== undefined) md += `**Confidence:** ${Math.round(event.confidence * 100)}%\n`;
    if (event.tool) md += `**Tool:** \`${event.tool}\`\n`;
    md += `\n${event.content}\n`;
    if (supportedBy.length) md += `\n**Supported by:**\n${supportedBy.map((p) => `- Step ${p.step} (${EVENT_TYPES[p.type].label}): ${p.content.slice(0, 80)}`).join("\n")}\n`;
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="step-detail">
      <div className="step-detail__head">
        <Icon size={ICON.size} stroke={ICON.stroke} />
        <span className="step-detail__type">{label}</span>
        <span className="badge badge--mono badge--muted">{event.id}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={copyAsMarkdown}>
          {copied ? <CheckIcon size={ICON.size} stroke={ICON.stroke} /> : <CopyIcon size={ICON.size} stroke={ICON.stroke} />}
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
      </div>
      <EvidenceLabel label={event.label} providerSummary={event.providerSummary} />
      <p className="step-detail__content evidence-text" data-label={event.label}>{event.content || "(no text)"}</p>

      <dl className="step-detail__facts">
        <dt>Step</dt><dd>{event.step}</dd>
        {event.tool && (<><dt>Tool</dt><dd>{event.tool}</dd></>)}
        <dt>Confidence</dt><dd>{event.confidence === undefined ? "none recorded" : `${Math.round(event.confidence * 100)}%`}</dd>
        {event.source && (<><dt>Source</dt><dd>{event.source}</dd></>)}
      </dl>

      <p className="hint">{readingOf(event)}</p>

      <LinkedEvents title="Supported by" events={supportedBy} empty="No support declared." onSelect={select} />
      <LinkedEvents title="Supports" events={supports} empty="Nothing declares this as support." onSelect={select} />
    </div>
  );
}

function LinkedEvents({ title, events, empty, onSelect }: { title: string; events: TraceEvent[]; empty: string; onSelect: (id: string) => void }) {
  return (
    <section>
      <h3 className="section-heading">{title}</h3>
      {events.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        events.map((e) => (
          <button key={e.id} type="button" className="row step-detail__link" onClick={() => onSelect(e.id)}>
            <span className="row__title">{EVENT_TYPES[e.type].label}: {e.content}</span>
            <span className="row__meta">step {e.step}</span>
          </button>
        ))
      )}
    </section>
  );
}
