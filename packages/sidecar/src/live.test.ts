import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareRunDirs, newRunId, RunWriter } from "@reasontrace/core";
import type { RunRequest } from "@reasontrace/format";
import { afterAll, describe, expect, test } from "vitest";
import { weightsSource } from "./source.ts";

const BRIDGE = join(import.meta.dirname, "../../../bridge/python");

// Runs only with RT_LIVE_TESTS=1, uv and the Qwen3 0.6B weights: the phase 4
// determinism gate, on the real sidecar.
describe.runIf(process.env.RT_LIVE_TESTS === "1")("weights source, live", () => {
  const source = weightsSource({ command: "uv", args: ["run", "--frozen", "--extra", "model", "python", "-m", "reasontrace_sidecar"], cwd: BRIDGE });
  const root = mkdtempSync(join(tmpdir(), "rt-live-weights-"));
  const request: RunRequest = {
    model: "qwen3-0.6b",
    prompt: "Name a prime number between 10 and 20.",
    maxTokens: 60,
    topLogprobs: 5,
    timeoutMs: 120_000,
    plan: { layers: [0, 13, 27], positions: "all", pooling: "none" },
  };

  async function run(cache: boolean): Promise<string> {
    const writer = new RunWriter(root, {
      id: newRunId(),
      title: "live",
      createdAt: new Date().toISOString(),
      source: { id: source.id, name: source.name, tier: "full", baseUrl: source.baseUrl },
      request: { ...request, cache },
      unavailable: [],
      versions: {},
    });
    const outcome = await source.run({ ...request, cache }, writer, AbortSignal.timeout(request.timeoutMs));
    writer.finish(outcome);
    expect(["complete", "truncated"]).toContain(outcome.completion.state);
    return writer.manifest.id;
  }

  afterAll(() => source.stop());

  test("two runs of one plan pass the determinism check; toggling the cache is a different configuration", async () => {
    const first = await run(true);
    const second = await run(true);
    const same = compareRunDirs(root, first, second);
    expect(same.configurationDifferences).toEqual([]);
    expect(same.divergence).toBeNull();
    expect(same.maxTensorDifference).not.toBeNull();

    const uncached = await run(false);
    expect(compareRunDirs(root, first, uncached).configurationDifferences).toContain("runtime.cache");
  }, 300_000);
});
