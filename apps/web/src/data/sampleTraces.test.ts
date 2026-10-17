import { computeDiagnostics } from "@reasontrace/analysis";
import { describe, expect, test } from "vitest";
import { sampleTraces } from "./sampleTraces";

describe("bundled samples", () => {
  test("D3: evidence coverage can tell the samples apart", () => {
    const coverage = Object.values(sampleTraces).map((trace) => computeDiagnostics(trace).evidenceCoverage);
    expect(new Set(coverage).size).toBeGreaterThan(1);
  });

  test("the opaque-agent sample does not claim its unsupported refund is grounded", () => {
    expect(computeDiagnostics(sampleTraces["opaque-tool-agent"]).answerGrounding).toBe("not_recorded");
  });

  test("D6: the web-agent sample's click loop is reported", () => {
    const loops = computeDiagnostics(sampleTraces["flight-booker"]).findings.filter((f) => f.category === "loop");
    expect(loops.length).toBeGreaterThan(0);
  });
});
