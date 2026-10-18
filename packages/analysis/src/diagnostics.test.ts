import { describe, expect, test } from "vitest";
import { parsed, traceFixture } from "../../../test/traces";
import { computeDiagnostics } from "./diagnostics.ts";

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
  test("D1: an 8,000-event chain of thoughts does not overflow the stack", () => {
    expect(() => diagnose(chain("hypothesis", 8000))).not.toThrow();
  });

  test("D1: an 8,000-event chain of actions does not overflow the stack", () => {
    expect(() => diagnose(chain("action", 8000))).not.toThrow();
  });

  // Each walk restarts from scratch, so the cost grows with the square of the
  // trace length: 76 ms at 1,000 events, 297 ms at 2,000 and 729 ms at 3,000 on
  // an M5 MacBook. One linear pass takes a few milliseconds at 2,000. Longer
  // chains would overflow the stack (D1) before the timing could be read.
  test("D2: diagnostics over 2,000 events take under 100 ms", () => {
    const text = chain("hypothesis", 2000);
    const start = performance.now();
    diagnose(text);
    expect(performance.now() - start).toBeLessThan(100);
  });

  test("diagnostics over a 50,000-event chain finish in under 500 ms", () => {
    const text = chain("hypothesis", 50_000);
    const trace = parsed(text);
    const start = performance.now();
    computeDiagnostics(trace);
    expect(performance.now() - start).toBeLessThan(500);
  });

  test("D4: a trace with no final answer does not report a grounded answer", () => {
    expect(diagnose("Thought: a\nAction: b()").answerGrounding).toBe("no_answer");
  });

  test("D5: an answer resting on an unsupported update is not grounded", () => {
    expect(diagnose(traceFixture("answer-via-unsupported-update.json")).answerGrounding).toBe("ungrounded");
  });

  test("an answer supported through an update that rests on an observation is grounded", () => {
    const text = '{"events":[{"id":"o","type":"observation","step":1},{"id":"u","type":"belief_update","step":2,"supports":["o"]},{"id":"f","type":"final_answer","step":3,"supports":["u"]}]}';
    expect(diagnose(text).answerGrounding).toBe("grounded");
  });

  test("a trace that declares no support links reports grounding as not recorded", () => {
    expect(diagnose(traceFixture("chat-tools.json")).answerGrounding).toBe("not_recorded");
  });

  test("D7: two identical actions are reported as a repeat, naming only those two", () => {
    const repeat = diagnose("Action: a()\nAction: a()\nAction: b()").findings.find((f) => f.category === "loop");
    expect(repeat?.eventIds).toEqual(["e1", "e2"]);
  });

  test("D3: an observation a claim leads to does not count as support for it", () => {
    const text = '{"events":[{"id":"h","type":"hypothesis","step":1},{"id":"o","type":"observation","step":2,"supports":["h"]}]}';
    expect(diagnose(text).evidenceCoverage).toBe(0);
  });

  test("D6: each run of consecutive calls to one tool is reported with its own calls", () => {
    const loops = diagnose("Action: click(a)\nAction: click(b)\nAction: read()\nAction: click(c)\nAction: click(d)").findings.filter((f) => f.category === "loop");
    expect(loops.map((f) => f.eventIds)).toEqual([["e1", "e2"], ["e4", "e5"]]);
  });

  test("D6: calls to the same tool separated by another action are not a run", () => {
    expect(diagnose("Action: click(a)\nAction: read()\nAction: click(b)").findings.filter((f) => f.category === "loop")).toEqual([]);
  });

  test("D8: chat actions are not called unexplained when the source never states plans", () => {
    expect(diagnose(traceFixture("chat-tools.json")).actionsWithoutPriorHypothesis).toEqual([]);
  });

  test("D9: chat updates without confidence raise no calibration finding", () => {
    const findings = diagnose(traceFixture("chat-tools.json")).findings;
    expect(findings.filter((f) => f.category === "confidence")).toEqual([]);
  });

  test("D9: a stated update without confidence is still reported", () => {
    expect(diagnose("Update: the host is wrong").findings.filter((f) => f.category === "confidence")).toHaveLength(1);
  });

  test("D10: a recorded failure is not categorised as a contradiction", () => {
    const failure = diagnose("Failure: timed out").findings.find((f) => f.eventIds.includes("e1"));
    expect(failure?.category).not.toBe("contradiction");
  });

  test("D11: the hypothesis/observation ratio is undefined with no observations", () => {
    expect(diagnose("Thought: a\nThought: b").hypothesisToObservationRatio).toBeNull();
  });

  test("every finding carries its rule and limitations", () => {
    const traces = ["Thought: a\nAction: b()\nAction: b()\nFailure: x\nUpdate: y", traceFixture("answer-via-unsupported-update.json"), traceFixture("chat-tools.json")];
    const findings = traces.flatMap((text) => diagnose(text).findings);
    expect(findings.length).toBeGreaterThan(3);
    for (const f of findings) {
      expect(f.rule.length).toBeGreaterThan(0);
      expect(f.limitations.length).toBeGreaterThan(0);
    }
  });
});
