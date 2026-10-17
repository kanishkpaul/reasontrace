import { describe, expect } from "vitest";
import { knownBug } from "../../../test/knownBug";
import { parsed, traceFixture } from "../../../test/traces";
import { computeDiagnostics } from "./diagnostics";

const diagnose = (text: string) => computeDiagnostics(parsed(text));
/** A trace of `length` events of one type, each supported by the one before. */
const chain = (type: string, length: number) =>
  JSON.stringify({
    events: Array.from({ length }, (_, i) => ({
      id: `c${i}`,
      type,
      step: i + 1,
      content: `step ${i}`,
      supports: i ? [`c${i - 1}`] : [],
    })),
  });

describe("diagnostics", () => {
  // Chains with no event of the type a walk looks for make the recursive walk
  // visit every event, so their depth equals the trace length.
  knownBug("D1: an 8,000-event chain of thoughts does not overflow the stack", () => {
    expect(() => diagnose(chain("hypothesis", 8000))).not.toThrow();
  });

  knownBug("D1: an 8,000-event chain of actions does not overflow the stack", () => {
    expect(() => diagnose(chain("action", 8000))).not.toThrow();
  });

  // Each walk restarts from scratch, so the cost grows with the square of the
  // trace length: 76 ms at 1,000 events, 297 ms at 2,000 and 729 ms at 3,000 on
  // an M5 MacBook. One linear pass takes a few milliseconds at 2,000. Longer
  // chains would overflow the stack (D1) before the timing could be read.
  knownBug("D2: diagnostics over 2,000 events take under 100 ms", () => {
    const text = chain("hypothesis", 2000);
    const start = performance.now();
    diagnose(text);
    expect(performance.now() - start).toBeLessThan(100);
  });

  knownBug("D4: a trace with no final answer does not report an evidence chain", () => {
    expect(diagnose("Thought: a\nAction: b()").hasEvidenceChain).toBe(false);
  });

  knownBug("D5: an answer resting on an unsupported update is not grounded", () => {
    expect(diagnose(traceFixture("answer-via-unsupported-update.json")).hasEvidenceChain).toBe(false);
  });

  knownBug("D7: two identical actions are reported as a repeat, naming only those two", () => {
    const repeat = diagnose("Action: a()\nAction: a()\nAction: b()").findings.find((f) => f.category === "loop");
    expect(repeat?.eventIds).toEqual(["e1", "e2"]);
  });

  knownBug("D8: chat actions are not called unexplained when the source never states plans", () => {
    expect(diagnose(traceFixture("chat-tools.json")).actionsWithoutPriorHypothesis).toEqual([]);
  });

  knownBug("D9: chat updates without confidence raise no calibration finding", () => {
    const findings = diagnose(traceFixture("chat-tools.json")).findings;
    expect(findings.filter((f) => f.category === "confidence")).toEqual([]);
  });

  knownBug("D10: a recorded failure is not categorised as a contradiction", () => {
    const failure = diagnose("Failure: timed out").findings.find((f) => f.eventIds.includes("e1"));
    expect(failure?.category).not.toBe("contradiction");
  });

  knownBug("D11: the hypothesis/observation ratio is undefined with no observations", () => {
    expect(diagnose("Thought: a\nThought: b").hypothesisToObservationRatio).toBeNull();
  });
});
