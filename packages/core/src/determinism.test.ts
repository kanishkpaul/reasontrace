import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Run } from "@reasontrace/format";
import { describe, expect, test } from "vitest";
import { compareRunDirs, compareRuns } from "./determinism.ts";
import { RunWriter } from "./runDir.ts";
import { safetensorsBytes } from "../../../test/safetensors";

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

describe("compareRunDirs", () => {
  /** Writes a finished run with one activation event and its tensor file. */
  function writeRun(root: string, id: string, values: number[], cache = true) {
    const writer = new RunWriter(root, {
      id,
      title: "t",
      createdAt: "2026-10-18T00:00:00.000Z",
      source: { id: "weights", name: "Local weights", tier: "full", baseUrl: "stdio" },
      request: { model: "qwen3-0.6b", prompt: "p", maxTokens: 4, topLogprobs: 0, timeoutMs: 1000 },
      unavailable: [],
      versions: {},
    });
    writer.event({ id: "activations", type: "activation", step: 1, content: "residual stream", depth: "internals", label: "measured", supports: [] });
    mkdirSync(join(writer.dir, "tensors"));
    writeFileSync(join(writer.dir, "tensors", "residual.safetensors"), safetensorsBytes({ "layer.0": { shape: [2], values } }));
    writer.attach({
      kind: "activations.residual/1",
      eventId: "activations",
      label: "measured",
      data: { file: "tensors/residual.safetensors", layers: [0], positions: [3], tokens: ["x"], pooling: "none", dModel: 2, dtype: "float32", norms: [1] },
    });
    writer.finish({
      completion: { state: "complete" },
      unavailable: [],
      runtime: { device: "mps", dtype: "float32", quantization: "none", cache, seed: 0, revision: "abc", libraries: {}, peakMemoryBytes: values[0], captureMethod: "m" },
    });
  }

  test("matching tensors pass, and peak memory is not a setting", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-det-"));
    writeRun(root, "20261018-000000-aaaaaa", [100, -50]);
    writeRun(root, "20261018-000001-bbbbbb", [100.001, -50]);
    const comparison = compareRunDirs(root, "20261018-000000-aaaaaa", "20261018-000001-bbbbbb");
    expect(comparison).toMatchObject({ configurationDifferences: [], divergence: null });
    expect(comparison.maxTensorDifference).toBeCloseTo(1e-5, 6);
  });

  test("a tensor over the tolerance is a divergence", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-det-"));
    writeRun(root, "20261018-000000-aaaaaa", [100, -50]);
    writeRun(root, "20261018-000001-bbbbbb", [101, -50]);
    expect(compareRunDirs(root, "20261018-000000-aaaaaa", "20261018-000001-bbbbbb").divergence).toMatch(/tensor layer\.0: differs by 0\.00990/);
  });

  test("a run with the cache toggled is a different configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-det-"));
    writeRun(root, "20261018-000000-aaaaaa", [100, -50], true);
    writeRun(root, "20261018-000001-bbbbbb", [100, -50], false);
    expect(compareRunDirs(root, "20261018-000000-aaaaaa", "20261018-000001-bbbbbb").configurationDifferences).toEqual(["runtime.cache"]);
  });
});
