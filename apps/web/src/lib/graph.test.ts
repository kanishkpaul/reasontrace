import { describe, expect, test } from "vitest";
import { knownBug } from "../../../../test/knownBug";
import { parsed, traceFixture } from "../../../../test/traces";
import { buildGraphData } from "./graph";

const layout = (fixture: string) =>
  buildGraphData(parsed(traceFixture(fixture)).events, null, null, false, false);

describe("graph layout", () => {
  test("G3: timestamp steps are laid out by order, not by value", () => {
    const ys = layout("timestamp-steps.json").nodes.map((n) => n.position.y);
    expect(Math.max(...ys)).toBeLessThan(10_000);
  });

  knownBug("G4: a child listed before its parent is placed under that parent", () => {
    const x = Object.fromEntries(layout("child-before-parent.json").nodes.map((n) => [n.id, n.position.x]));
    expect(x.c).toBe(x.d);
  });

  test("G6: duplicate links produce one edge", () => {
    const ids = layout("duplicate-links.json").edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
