import { computeDiagnostics } from "@reasontrace/analysis";
import { describe, expect } from "vitest";
import { knownBug } from "../../../../test/knownBug";
import { sampleTraces } from "./sampleTraces";

describe("bundled samples", () => {
  knownBug("D3: evidence coverage can tell the samples apart", () => {
    const coverage = Object.values(sampleTraces).map((trace) => computeDiagnostics(trace).evidenceCoverage);
    expect(new Set(coverage).size).toBeGreaterThan(1);
  });

  knownBug("D6: the web-agent sample's click loop is reported", () => {
    const loops = computeDiagnostics(sampleTraces["flight-booker"]).findings.filter((f) => f.category === "loop");
    expect(loops.length).toBeGreaterThan(0);
  });
});
