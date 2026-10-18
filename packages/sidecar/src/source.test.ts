import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newRunId, readRun, RunWriter } from "@reasontrace/core";
import type { RunRequest } from "@reasontrace/format";
import { afterEach, describe, expect, test } from "vitest";
import { weightsSource } from "./source.ts";

const FAKE = join(import.meta.dirname, "../../../test/fakeSidecar.mjs");
const request: RunRequest = { model: "qwen3-0.6b", prompt: "What is 2+2? Answer in one word.", maxTokens: 400, topLogprobs: 3, timeoutMs: 10_000 };
const sources: ReturnType<typeof weightsSource>[] = [];

function source(mode = "replay") {
  const s = weightsSource({ command: process.execPath, args: [FAKE, mode], cwd: tmpdir() });
  sources.push(s);
  return s;
}

function writer() {
  const root = mkdtempSync(join(tmpdir(), "rt-weights-"));
  const deltas: string[] = [];
  const w = new RunWriter(root, {
    id: newRunId(),
    title: "t",
    createdAt: new Date().toISOString(),
    source: { id: "weights", name: "w", tier: "full", baseUrl: "stdio" },
    request,
    unavailable: [],
    versions: {},
  }, (_, text) => deltas.push(text));
  return { root, w, deltas };
}

afterEach(async () => {
  await Promise.all(sources.splice(0).map((s) => s.stop()));
});

describe("weights source, replaying a recorded Qwen3 run", () => {
  test("lists models and declares what each can't show", async () => {
    const s = source();
    expect(await s.models(new AbortController().signal)).toEqual([
      { id: "qwen3-0.6b", name: "Qwen3 0.6B" },
      { id: "gemma-3-1b-it", name: "Gemma 3 1B instruct (downloads on first run)" },
    ]);
    expect(s.capabilities("qwen3-0.6b")).toEqual({ tier: "full", unavailable: [] });
    expect(s.capabilities("gemma-3-1b-it").unavailable).toEqual([{ depth: "stated", reason: "Gemma 3 1B instruct emits no reasoning text before its answer." }]);
  });

  test("a run records reasoning, answer, probabilities and the captured residual stream", async () => {
    const s = source();
    const { root, w, deltas } = writer();
    const outcome = await s.run(request, w, new AbortController().signal);
    w.finish(outcome);
    const run = readRun(root, w.manifest.id);

    expect(outcome.completion).toEqual({ state: "complete" });
    expect(run.trace.events.map((e) => [e.id, e.type, e.depth, e.label])).toEqual([
      ["reasoning", "reasoning", "stated", "stated"],
      ["output", "final_answer", "behaviour", "observed"],
      ["activations", "activation", "internals", "measured"],
    ]);
    expect(run.trace.events[1].content).toBe("four");
    expect(run.trace.events[2].content).toBe("Residual stream at 28 layers × 1 position, 1024 wide, float32, in tensors/residual.safetensors.");
    expect(deltas.join("")).toContain("four");

    const residual = run.attachments.find((a) => a.kind === "activations.residual/1");
    expect(residual?.data).toMatchObject({ file: "tensors/residual.safetensors", layers: Array.from({ length: 28 }, (_, i) => i), positions: [212], dModel: 1024 });
    expect(existsSync(join(root, w.manifest.id, "tensors", "residual.safetensors"))).toBe(true);
    expect(run.attachments.filter((a) => a.kind === "probs.top_k/1").map((a) => a.eventId)).toEqual(["reasoning", "output"]);

    expect(run.manifest.runtime).toMatchObject({ device: "mps", dtype: "float32", cache: true, seed: 0, revision: "c1899de289a04d12100db370d81485cdf75e47ca" });
    expect(run.manifest.runtime?.peakMemoryBytes).toBeGreaterThan(0);
    expect(run.manifest.providerRequest).toMatchObject({ do_sample: false, use_cache: true, max_new_tokens: 400 });
    expect(run.manifest.unavailable).toEqual([]);
  });
});

describe("weights source, when things go wrong", () => {
  test("without uv, every depth is unavailable with the reason, and runs fail with it", async () => {
    const s = weightsSource({ command: "uv-that-does-not-exist", args: [], cwd: tmpdir() });
    sources.push(s);
    await expect(s.models(new AbortController().signal)).rejects.toThrow(/uv-that-does-not-exist was not found on PATH/);
    const { unavailable } = s.capabilities("qwen3-0.6b");
    expect(unavailable.map((u) => u.depth)).toEqual(["behaviour", "stated", "probabilities", "internals"]);
    expect(unavailable[0].reason).toMatch(/Install uv/);
    const { w } = writer();
    expect((await s.run(request, w, new AbortController().signal)).completion).toMatchObject({ state: "error", reason: expect.stringMatching(/not found on PATH/) });
  });

  test("without the model runtime, the sidecar's reason is what the viewer sees", async () => {
    const s = source("unavailable");
    await expect(s.models(new AbortController().signal)).rejects.toThrow(/uv sync --extra model/);
    expect(s.capabilities("qwen3-0.6b").unavailable[3]).toEqual({ depth: "internals", reason: expect.stringMatching(/No module named 'torch'/) });
  });

  test("stopping a run cancels it in the sidecar and records it as stopped, with no capture", async () => {
    const s = source("stall");
    await s.models(new AbortController().signal);
    const { w } = writer();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const outcome = await s.run(request, w, controller.signal);
    expect(outcome.completion.state).toBe("aborted");
    expect(outcome.unavailable).toContainEqual({ depth: "internals", reason: "The run stopped before capture, which runs after generation." });
  });

  test("a sidecar that dies mid-run is an error carrying its last words", async () => {
    const s = source("crash");
    await s.models(new AbortController().signal);
    const { w } = writer();
    const outcome = await s.run(request, w, new AbortController().signal);
    expect(outcome.completion).toMatchObject({ state: "error", reason: expect.stringMatching(/exited \(code 3\): RuntimeError: MPS backend out of memory/) });
  });

  test("an error the sidecar returns, such as a gated model, is the run's error", async () => {
    const s = source("refuse");
    await s.models(new AbortController().signal);
    const { w } = writer();
    expect((await s.run({ ...request, model: "gemma-3-1b-it" }, w, new AbortController().signal)).completion.reason).toMatch(/GatedRepoError/);
  });
});
