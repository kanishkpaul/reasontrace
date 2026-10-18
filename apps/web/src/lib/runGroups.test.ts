import type { RunManifest } from "@reasontrace/format";
import { describe, expect, test } from "vitest";
import { groupRuns } from "./runGroups";

const run = (id: string, source: string, tier: RunManifest["source"]["tier"], model: string) => ({
  id,
  source: { id: source, name: source, tier },
  request: { model, prompt: "hi", maxTokens: 1, topLogprobs: 0, timeoutMs: 1000 },
}) as RunManifest;

describe("the run list", () => {
  test("one model served by sources of different tiers makes a group per source, each with its own tier", () => {
    const groups = groupRuns([
      run("a", "llamacpp", "local", "Qwen/Qwen3-0.6B-GGUF:Q8_0"),
      run("b", "anthropic", "frontier", "Qwen/Qwen3-0.6B-GGUF:Q8_0"),
      run("c", "llamacpp", "local", "Qwen/Qwen3-0.6B-GGUF:Q8_0"),
    ]);
    expect(groups.map((g) => [g.name, g.tier, g.runs.map((r) => r.id)])).toEqual([
      ["Qwen/Qwen3-0.6B-GGUF:Q8_0", "local", ["a", "c"]],
      ["Qwen/Qwen3-0.6B-GGUF:Q8_0", "frontier", ["b"]],
    ]);
  });
});
