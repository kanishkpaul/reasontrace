import type { Run } from "@reasontrace/format";
import { describe, expect, test } from "vitest";
import { compareRuns } from "./determinism.ts";

const run = (overrides: { content?: string; logprob?: number; temperature?: number; state?: "complete" | "truncated" } = {}): Run => ({
  manifest: {
    formatVersion: 1,
    id: "20261018-000000-aaaaaa",
    title: "t",
    createdAt: "2026-10-18T00:00:00.000Z",
    source: { id: "llamacpp", name: "llama.cpp", tier: "local", baseUrl: "http://127.0.0.1:8080/v1" },
    request: { model: "m", prompt: "p", maxTokens: 10, topLogprobs: 5, timeoutMs: 1000, temperature: overrides.temperature ?? 0 },
    unavailable: [],
    completion: { state: overrides.state ?? "complete" },
    versions: {},
  },
  trace: {
    formatVersion: 1,
    title: "t",
    unavailable: [],
    events: [{ id: "output", type: "final_answer", step: 1, content: overrides.content ?? "Paris", depth: "behaviour", label: "observed", supports: [] }],
  },
  attachments: [{ kind: "probs.top_k/1", eventId: "output", label: "measured", data: { tokens: [{ token: "Paris", logprob: overrides.logprob ?? -0.2, top: [] }] } }],
});

describe("compareRuns", () => {
  test("identical runs match", () => {
    expect(compareRuns(run(), run())).toMatchObject({ configurationDifferences: [], divergence: null, maxLogprobDifference: 0 });
  });

  test("different text is a divergence", () => {
    expect(compareRuns(run(), run({ content: "Lyon" })).divergence).toMatch(/event 1 \(final_answer\): text differs from character 1/);
  });

  test("a log-probability over the tolerance is a divergence; one under it is not", () => {
    expect(compareRuns(run(), run({ logprob: -0.2005 })).divergence).toMatch(/log-probability differs/);
    expect(compareRuns(run(), run({ logprob: -0.20001 })).divergence).toBeNull();
  });

  test("different settings are a different configuration", () => {
    expect(compareRuns(run(), run({ temperature: 0.7 })).configurationDifferences).toEqual(["request.temperature"]);
  });

  test("a different ending is a divergence", () => {
    expect(compareRuns(run(), run({ state: "truncated" })).divergence).toBe("completion: complete against truncated");
  });
});
