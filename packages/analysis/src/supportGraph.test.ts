import { describe, expect, test } from "vitest";
import { parsed } from "../../../test/traces";
import { supportGraph, supportOrder, typeMask } from "./supportGraph";

// h supports a, a supports o; x stands alone. Listed out of order on purpose.
const events = parsed(JSON.stringify({
  events: [
    { id: "o", type: "observation", step: 1, supports: ["a"] },
    { id: "x", type: "decision", step: 1 },
    { id: "a", type: "action", step: 2, supports: ["h"] },
    { id: "h", type: "hypothesis", step: 3 },
  ],
})).events;

describe("support graph", () => {
  test("orders every event after the events that support it", () => {
    const order = supportOrder(events).map((e) => e.id);
    expect(order.indexOf("h")).toBeLessThan(order.indexOf("a"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("o"));
  });

  test("collects the types upstream and downstream of each event, transitively", () => {
    const { upstream, downstream } = supportGraph(events);
    expect(upstream.get("o")).toBe(typeMask(["hypothesis", "action"]));
    expect(downstream.get("h")).toBe(typeMask(["action", "observation"]));
    expect(upstream.get("x")).toBe(0);
    expect(downstream.get("x")).toBe(0);
  });
});
