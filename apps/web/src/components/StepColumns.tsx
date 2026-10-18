import type { Depth, TraceEvent } from "@reasontrace/format";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { EVENT_TYPES } from "../lib/eventTypes";
import { ICON } from "../lib/icons";
import { useTraceStore } from "../store";
import { useVisibleEvents } from "../useVisibleEvents";
import { EvidenceLabel, Unavailable } from "./EvidenceLabel";

const COLUMNS: { depth: Depth; title: string; depths: Depth[] }[] = [
  { depth: "behaviour", title: "Behaviour", depths: ["behaviour"] },
  { depth: "stated", title: "Stated reasoning", depths: ["stated"] },
  { depth: "internals", title: "Internals", depths: ["internals"] },
];

/**
 * The trace as three columns on one step axis, so a row reads across what the
 * model did, what it said it thought, and what happened inside it. A column the
 * source can't provide is one panel naming the reason, never empty space.
 */
export function StepColumns() {
  const { trace, selectedId, select } = useTraceStore(useShallow((s) => ({
    trace: s.currentTrace,
    selectedId: s.selectedNodeId,
    select: s.setSelectedNodeId,
  })));
  const events = useVisibleEvents();

  const rows = useMemo(() => {
    const bySteps = new Map<number, TraceEvent[]>();
    for (const e of events) {
      const row = bySteps.get(e.step);
      if (row) row.push(e);
      else bySteps.set(e.step, [e]);
    }
    return [...bySteps.entries()].sort(([a], [b]) => a - b);
  }, [events]);

  if (!trace) return null;
  // A pipeline's model can lack a depth its engine provides, so a column with events shows them and its reason both.
  const reasons = new Map(trace.unavailable.map((u) => [u.depth, u.reason]));
  const hasEvents = (depth: Depth) => trace.events.some((e) => e.depth === depth);
  const unavailable = new Map([...reasons].filter(([depth]) => !hasEvents(depth)));
  const probabilities = unavailable.get("probabilities");

  return (
    <div className="step-columns" role="table" aria-label="Trace by step and depth">
      <div className="step-columns__head" role="row">
        <span role="columnheader" className="section-heading">Step</span>
        {COLUMNS.map((column) => (
          <span key={column.depth} role="columnheader" className="section-heading">
            {column.title}
            {!unavailable.has(column.depth) && (
              <span className="step-columns__count"> · {events.filter((e) => column.depths.includes(e.depth)).length}</span>
            )}
            {!unavailable.has(column.depth) && reasons.has(column.depth) && <span className="step-columns__partly"><Unavailable reason={reasons.get(column.depth)!} /></span>}
          </span>
        ))}
      </div>
      {probabilities && (
        <div className="step-columns__band">
          <span className="section-heading">Token probabilities</span> <Unavailable reason={probabilities} />
        </div>
      )}
      <div className="step-columns__body" style={{ gridTemplateRows: `repeat(${Math.max(rows.length, 1)}, auto)` }}>
        {rows.map(([step, rowEvents], index) => (
          <div key={step} className="step-columns__row" role="row" style={{ gridRow: index + 1 }}>
            <span className="step-columns__step" role="rowheader">{index + 1}</span>
            {COLUMNS.map((column, i) =>
              unavailable.has(column.depth) ? null : (
                <div key={column.depth} role="cell" className="step-columns__cell" style={{ gridColumn: i + 2 }}>
                  {rowEvents.filter((e) => column.depths.includes(e.depth)).map((event) => (
                    <EventCell key={event.id} event={event} selected={event.id === selectedId} onSelect={select} />
                  ))}
                </div>
              ),
            )}
          </div>
        ))}
        {COLUMNS.map((column, i) => {
          const reason = unavailable.get(column.depth);
          return reason ? (
            <div key={column.depth} className="step-columns__unavailable" style={{ gridColumn: i + 2, gridRow: `1 / span ${Math.max(rows.length, 1)}` }}>
              <Unavailable reason={reason} />
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

function EventCell({ event, selected, onSelect }: { event: TraceEvent; selected: boolean; onSelect: (id: string) => void }) {
  const { label, icon: Icon } = EVENT_TYPES[event.type];
  return (
    <button type="button" className="event-cell" data-type={event.type} aria-current={selected} onClick={() => onSelect(event.id)}>
      <span className="event-cell__head">
        <Icon size={ICON.size} stroke={ICON.stroke} />
        <span className="event-cell__type">{label}</span>
        {event.tool && <span className="badge badge--mono badge--muted">{event.tool}</span>}
        {event.confidence !== undefined && <span className="event-cell__confidence">{Math.round(event.confidence * 100)}%</span>}
        <EvidenceLabel label={event.label} providerSummary={event.providerSummary} />
      </span>
      <span className="event-cell__content evidence-text" data-label={event.label}>{event.content || "(no text)"}</span>
    </button>
  );
}
