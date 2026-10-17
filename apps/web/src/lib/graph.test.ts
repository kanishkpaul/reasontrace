import { describe, expect, test } from "vitest";
import { parsed, traceFixture } from "../../../../test/traces";
import { buildGraphData } from "./graph";

const layout = (fixture: string) =>
  buildGraphData(parsed(traceFixture(fixture)).events, null, null, false, false);

describe("graph layout", () => {
  test("G3: timestamp steps are laid out by order, not by value", () => {
    const ys = layout("timestamp-steps.json").nodes.map((n) => n.position.y);
    expect(Math.max(...ys)).toBeLessThan(10_000);
  });

  test("G4: a child listed before its parent is placed under that parent", () => {
    const x = Object.fromEntries(layout("child-before-parent.json").nodes.map((n) => [n.id, n.position.x]));
    expect(x.c).toBe(x.d);
  });

  test("G5: siblings stay centred under a parent that was moved aside", () => {
    const text = '{"events":[{"id":"r1","step":1},{"id":"r2","step":1},{"id":"p","step":2,"supports":["r2"]},{"id":"q","step":2,"supports":["r2"]}]}';
    const x = Object.fromEntries(buildGraphData(parsed(text).events, null, null, false, false).nodes.map((n) => [n.id, n.position.x]));
    expect((x.p + x.q) / 2).toBe(x.r2);
  });

  test("nodes in one row never overlap", () => {
    const text = '{"events":[{"id":"a","step":1},{"id":"b","step":1},{"id":"c","step":1}]}';
    const xs = buildGraphData(parsed(text).events, null, null, false, false).nodes.map((n) => n.position.x).sort((m, n) => m - n);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(200);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(200);
  });

  test("G6: duplicate links produce one edge", () => {
    const ids = layout("duplicate-links.json").edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
