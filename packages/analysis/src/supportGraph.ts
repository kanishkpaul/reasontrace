import type { EventType, TraceEvent } from "@reasontrace/format";

const TYPE_BIT: Record<EventType, number> = {
  hypothesis: 1,
  action: 2,
  observation: 4,
  belief_update: 8,
  failure: 16,
  decision: 32,
  final_answer: 64,
  reasoning: 128,
  activation: 256,
  derivation: 512,
};

/** A set of event types as a bitmask, for testing against `SupportGraph` masks. */
export const typeMask = (types: EventType[]): number => types.reduce((mask, type) => mask | TYPE_BIT[type], 0);

export interface SupportGraph {
  /** For each event, the types found among the events that support it, directly or transitively. */
  upstream: Map<string, number>;
  /** For each event, the types found among the events it supports, directly or transitively. */
  downstream: Map<string, number>;
}

/**
 * Orders events so that every event comes after the events that support it,
 * keeping time order among events with no support relation. Supports naming
 * no event are ignored.
 *
 * @throws {Error} if the support graph has a cycle, which `readTrace` rules out.
 */
export function supportOrder(events: TraceEvent[]): TraceEvent[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const supported = new Map<string, string[]>();
  const waiting = new Map<string, number>();
  for (const e of events) {
    const known = e.supports.filter((id) => byId.has(id));
    waiting.set(e.id, known.length);
    for (const id of known) {
      const children = supported.get(id);
      if (children) children.push(e.id);
      else supported.set(id, [e.id]);
    }
  }
  const order = events.filter((e) => waiting.get(e.id) === 0);
  for (let i = 0; i < order.length; i++) {
    for (const child of supported.get(order[i].id) ?? []) {
      const left = (waiting.get(child) ?? 0) - 1;
      waiting.set(child, left);
      if (left === 0) order.push(byId.get(child) as TraceEvent);
    }
  }
  if (order.length !== byId.size) throw new Error("supportOrder: the support graph has a cycle");
  return order;
}

/**
 * Computes, in one pass each way, which event types lie upstream and
 * downstream of every event along `supports` edges. This replaces a walk per
 * event, which was quadratic and recursed once per event (D1, D2).
 *
 * @throws {Error} if the support graph has a cycle, which `readTrace` rules out.
 */
export function supportGraph(events: TraceEvent[]): SupportGraph {
  const order = supportOrder(events);
  const byId = new Map(events.map((e) => [e.id, e]));
  const bit = (id: string) => TYPE_BIT[(byId.get(id) as TraceEvent).type];
  const upstream = new Map<string, number>();
  for (const e of order) {
    let mask = 0;
    for (const parent of e.supports) {
      if (byId.has(parent)) mask |= (upstream.get(parent) ?? 0) | bit(parent);
    }
    upstream.set(e.id, mask);
  }
  // In reverse order every event's children are final before the event
  // passes its own mask up to its parents.
  const downstream = new Map(order.map((e) => [e.id, 0]));
  for (let i = order.length - 1; i >= 0; i--) {
    const e = order[i];
    const below = (downstream.get(e.id) ?? 0) | bit(e.id);
    for (const parent of e.supports) {
      if (byId.has(parent)) downstream.set(parent, (downstream.get(parent) ?? 0) | below);
    }
  }
  return { upstream, downstream };
}
