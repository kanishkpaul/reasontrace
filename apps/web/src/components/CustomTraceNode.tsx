import { Handle, Position } from "@xyflow/react";
import type { TraceEvent } from "@reasontrace/format";
import { EVENT_TYPES } from "../lib/eventTypes";
import { EvidenceLabel } from "./EvidenceLabel";

const PREVIEW_CHARS = 80;

export const CustomTraceNode = (props: { data: unknown }) => {
  const { event, isSelected, isHighlightedFailure, isNewest } = props.data as {
    event: TraceEvent;
    isSelected: boolean;
    isHighlightedFailure: boolean;
    isNewest: boolean;
  };
  const { label, icon: Icon } = EVENT_TYPES[event.type];
  const preview = event.content.length > PREVIEW_CHARS ? `${event.content.slice(0, PREVIEW_CHARS)}…` : event.content;

  return (
    <div
      className="trace-node"
      data-type={event.type}
      aria-current={isSelected}
      data-failure={isHighlightedFailure || undefined}
      data-newest={isNewest || undefined}
    >
      <Handle type="target" position={Position.Top} className="trace-node__handle" />
      <div className="event-cell__head">
        <Icon />
        <span className="event-cell__type">{label}</span>
        {event.tool && <span className="badge badge--mono badge--muted">{event.tool}</span>}
        {event.confidence !== undefined && <span className="event-cell__confidence">{Math.round(event.confidence * 100)}%</span>}
      </div>
      <p className="trace-node__content evidence-text" data-label={event.label}>{preview || "(no text)"}</p>
      <EvidenceLabel label={event.label} providerSummary={event.providerSummary} />
      <Handle type="source" position={Position.Bottom} className="trace-node__handle" />
    </div>
  );
};
