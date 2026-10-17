import { describe, expect, test } from "vitest";
import { knownBug, traceFixture } from "../../../test/knownBug";
import { parseTrace } from "./parseTrace";

const parse = (text: string) => parseTrace(text);
const events = (text: string) => parse(text).trace.events;

describe("transcript import", () => {
  test("P1: transcript events keep their evidence label", () => {
    const labels = events("Thought: a\nAction: b()\nObservation: c").map((e) => e.label);
    expect(labels).toEqual(["stated", "observed", "observed"]);
  });

  knownBug("P2: ReAct transcripts split Action Input and Final Answer into their own fields and events", () => {
    const parsed = events(traceFixture("react-transcript.txt"));
    expect(parsed.map((e) => e.type)).toEqual(["hypothesis", "action", "observation", "hypothesis", "final_answer"]);
    expect(parsed[1].tool).toBe("search");
  });

  knownBug("P11: a 'Tool:' line keeps its tool name", () => {
    expect(events("Tool: web_search")[0].tool).toBe("web_search");
  });

  knownBug("P12: 'confidence: 100%' is read as 1", () => {
    expect(events("Update: sure (confidence: 100%)")[0].confidence).toBe(1);
  });

  knownBug("P12: a percentage inside an observation is not taken as its confidence", () => {
    expect(events("Observation: disk usage rose (5%)")[0].confidence).toBeUndefined();
  });
});

describe("JSON import", () => {
  knownBug("P3: malformed JSON is reported as an error, not read as a transcript", () => {
    const result = parse(traceFixture("malformed.json"));
    expect(result.error).toBeDefined();
    expect(result.trace.events).toHaveLength(0);
  });

  knownBug("P16: a null event is reported, not re-read as a transcript", () => {
    const result = parse(traceFixture("null-event.json"));
    expect(result.error).toBeDefined();
    expect(result.trace.events.every((e) => e.type !== "hypothesis")).toBe(true);
  });

  knownBug("P6: an 'assistant' event is observed output, not stated reasoning", () => {
    const [event] = events(traceFixture("assistant-type.json"));
    expect(event.label).toBe("observed");
  });

  knownBug("P7: numeric id 0 is kept, so links to it resolve", () => {
    const parsed = events(traceFixture("json-edge-cases.json"));
    expect(parsed.map((e) => e.id)).toEqual(["0", "1"]);
    expect(parsed[1].supports).toEqual(["0"]);
  });

  knownBug("P7: duplicate event ids are reported", () => {
    const result = parse('{"events":[{"id":"a","step":1},{"id":"a","step":2}]}');
    expect(result.error ?? "").toMatch(/duplicate/i);
  });

  knownBug("P8: object content is read as its text", () => {
    expect(events(traceFixture("json-edge-cases.json"))[0].content).toBe("Maybe the cache is stale.");
  });

  knownBug("P9: confidence above 1 is read as a percentage", () => {
    expect(events(traceFixture("json-edge-cases.json"))[0].confidence).toBe(0.85);
  });

  knownBug("P10: the trace title is always a string", () => {
    expect(typeof parse(traceFixture("json-edge-cases.json")).trace.title).toBe("string");
  });

  knownBug("P15: cyclic links are reported", () => {
    expect(parse(traceFixture("cyclic-links.json")).error ?? "").toMatch(/cycl/i);
  });
});

describe("chat and Responses import", () => {
  knownBug("P4: only the last assistant message is the final answer", () => {
    const types = events(traceFixture("chat-midturn.json")).map((e) => e.type);
    expect(types.filter((t) => t === "final_answer")).toHaveLength(1);
    expect(types.at(-1)).toBe("final_answer");
  });

  knownBug("P14: a chat tool result is labelled with the tool that produced it", () => {
    const result = events(traceFixture("chat-tools.json")).find((e) => e.source === "tool result");
    expect(result?.tool).toBe("get_order");
  });

  knownBug("P14: a Responses tool result is labelled with the tool that produced it", () => {
    const result = events(traceFixture("responses-output.json")).find((e) => e.source === "tool result");
    expect(result?.tool).toBe("get_order");
  });

  knownBug("P14: a Responses message before a tool call is not a final answer", () => {
    const types = events(traceFixture("responses-output.json")).map((e) => e.type);
    expect(types.filter((t) => t === "final_answer")).toHaveLength(1);
  });
});

describe("format versions", () => {
  test("a v0 trace reads as v1: links become supports, explicit becomes stated", () => {
    const { trace } = parse(JSON.stringify({
      title: "v0",
      events: [
        { id: "a", type: "observation", step: 1, evidenceMode: "observed", links: [] },
        { id: "b", type: "hypothesis", step: 2, evidenceMode: "explicit", links: ["a"] },
      ],
    }));
    expect(trace.formatVersion).toBe(1);
    expect(trace.events.map((e) => [e.label, e.depth, e.supports])).toEqual([
      ["observed", "behaviour", []],
      ["stated", "stated", ["a"]],
    ]);
  });

  test("a v1 trace reads back equal to what was written", () => {
    const { trace } = parse(traceFixture("answer-via-unsupported-update.json"));
    expect(parse(JSON.stringify(trace)).trace).toEqual(trace);
  });

  test("an imported trace says which depths it cannot show, with reasons", () => {
    const depths = parse("Thought: a").trace.unavailable.map((u) => u.depth);
    expect(depths).toEqual(["probabilities", "internals"]);
  });
});
