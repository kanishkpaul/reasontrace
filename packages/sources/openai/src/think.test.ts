import { describe, expect, test } from "vitest";
import { splitThink, ThinkSplitter } from "./think.ts";

describe("splitThink", () => {
  test("splits a <think> block from the answer", () => {
    const raw = "<think>\nadd them\n</think>\n\n4";
    expect(splitThink(raw)).toEqual({ reasoning: "add them", output: "4", outputStart: raw.length - 1 });
  });

  test("a reply whose template opened the tag in the prompt has only the closing tag", () => {
    expect(splitThink("add them</think>4")).toMatchObject({ reasoning: "add them", output: "4" });
  });

  test("an unclosed block is all reasoning: the model ran out while thinking", () => {
    expect(splitThink("<think>still going")).toMatchObject({ reasoning: "still going", output: "" });
  });

  test("a reply without tags is all answer", () => {
    expect(splitThink("4")).toEqual({ reasoning: null, output: "4", outputStart: 0 });
  });
});

describe("ThinkSplitter", () => {
  const stream = (...chunks: string[]) => {
    const splitter = new ThinkSplitter();
    const parts = [...chunks.flatMap((c) => splitter.feed(c)), ...splitter.flush()];
    const joined = (channel: string) => parts.filter((p) => p.channel === channel).map((p) => p.text).join("");
    return { reasoning: joined("reasoning"), output: joined("output") };
  };

  test("tags split across chunks never leak into either channel", () => {
    expect(stream("<thi", "nk>add", " them</th", "ink>", "\n\n", "4")).toEqual({ reasoning: "add them", output: "4" });
  });

  test("text that only looks like a tag start is answer", () => {
    expect(stream("<", "b>bold</b>")).toEqual({ reasoning: "", output: "<b>bold</b>" });
  });
});
