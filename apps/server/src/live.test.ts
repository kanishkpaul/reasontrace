import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Source } from "@reasontrace/core";
import { readSse } from "@reasontrace/core";
import type { RunManifest } from "@reasontrace/format";
import { keychainStore, memoryStore, type KeyStore } from "@reasontrace/keys";
import { anthropicSource } from "@reasontrace/source-anthropic";
import { openaiCompatible, PRESETS } from "@reasontrace/source-openai";
import { weightsSource } from "@reasontrace/sidecar";
import { afterAll, describe, expect, test, type TestContext } from "vitest";
import { createApp, TOKEN_HEADER } from "./app.ts";
import { engines } from "./registry.ts";

// `npm run test:live`. Every source runs through the server as the viewer runs
// it, leaves a run directory in RT_LIVE_RUNS (default: a new temporary folder)
// and is reported as passed, failed or skipped with the reason.
//
// A hosted source runs against its provider when the keychain holds its key.
// Otherwise, with RT_LIVE_STAND_IN set to a local server's /v1 address and
// RT_LIVE_STAND_IN_KEY to the dummy key that server was started with (for
// llama.cpp, `--api-key`), it runs against that server standing in for the
// provider: that checks our side of the API, not the provider's.

const LIVE = process.env.RT_LIVE_TESTS === "1";
const TOKEN = "live-test-token";
const BRIDGE = join(import.meta.dirname, "../../../bridge/python");
const Z3_FIXTURES = join(import.meta.dirname, "../../../packages/engines/z3/fixtures");
const RUNS = process.env.RT_LIVE_RUNS ?? mkdtempSync(join(tmpdir(), "rt-live-"));
const STAND_IN = process.env.RT_LIVE_STAND_IN;
const STAND_IN_KEY = process.env.RT_LIVE_STAND_IN_KEY;
const PROMPT = "Reply with just the word: hi";

/**
 * Virgil's click point (virgil-cc src/virgil/perception/symbolic.py,
 * `SymObject.click_point`) as a problem in words. The last claim is false,
 * since the centroid's row clamps to the box's last row, 14, so a faithful
 * translation is unsatisfiable.
 */
const VIRGIL_TASK = [
  "An object's bounding box spans rows 10 to 14 and columns 3 to 9.",
  "Its click point is its centroid clamped into the bounding box, one coordinate at a time.",
  "The centroid is at row 16 and column 6.",
  "So the click point's row is 16.",
].join(" ");

const results: { name: string; result: string }[] = [];

afterAll(() => {
  if (!LIVE) return;
  const width = Math.max(...results.map((r) => r.name.length));
  console.log([`live runs in ${RUNS}`, ...results.map((r) => `${r.name.padEnd(width)}  ${r.result}`)].join("\n"));
});

/** Runs `body`, recording the source as passed, failed with the error, or skipped with the reason. */
function live(name: string, body: (skip: (reason: string) => never) => Promise<string | void>, timeout = 180_000) {
  test(name, async (context: TestContext) => {
    const skip = (reason: string): never => {
      results.push({ name, result: `skipped: ${reason}` });
      return context.skip(reason);
    };
    try {
      const note = await body(skip);
      results.push({ name, result: note ? `passed: ${note}` : "passed" });
    } catch (error) {
      if (!results.some((r) => r.name === name)) results.push({ name, result: `failed: ${(error as Error).message.split("\n")[0]}` });
      throw error;
    }
  }, timeout);
}

/** A server with one source, its run directories in RUNS. */
function serve(sources: Source[], keys: KeyStore) {
  const log: string[] = [];
  const app = createApp({ token: TOKEN, sources, engines: engines(), keys, runsDir: RUNS, log: (line) => log.push(line), versions: { reasontrace: "live" } });
  const call = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("host", "127.0.0.1:4317");
    headers.set(TOKEN_HEADER, TOKEN);
    if (init.body) headers.set("content-type", "application/json");
    return app.request(path, { ...init, headers });
  };
  /** Posts a run, a pipeline or a problem and returns the manifest it ends with. */
  const post = async (path: string, body: Record<string, unknown>): Promise<RunManifest> => {
    const response = await call(path, { method: "POST", body: JSON.stringify(body) });
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}: ${await response.text()}`);
    if (path === "/api/solve") return ((await response.json()) as { manifest: RunManifest }).manifest;
    for await (const message of readSse(response.body!)) {
      if (message.event === "done") return (JSON.parse(message.data) as { manifest: RunManifest }).manifest;
    }
    throw new Error(`${path} ended without a done message`);
  };
  return { call, post, log };
}

/** Every file in a run directory, as text. */
function runFiles(id: string): string {
  const read = (dir: string): string => readdirSync(dir).map((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? read(path) : readFileSync(path, "latin1");
  }).join("\n");
  return read(join(RUNS, id));
}

/** The key check: no key bytes in the run directory or the server log. */
function expectNoKey(ids: string[], log: string[], key: string) {
  for (const id of ids) expect(runFiles(id), `run ${id}`).not.toContain(key);
  expect(log.join("\n")).not.toContain(key);
}

/** The first model a source lists, or RT_LIVE_MODEL. */
async function firstModel(source: Source): Promise<string> {
  if (process.env.RT_LIVE_MODEL) return process.env.RT_LIVE_MODEL;
  const models = await source.models(AbortSignal.timeout(30_000));
  if (!models.length) throw new Error(`${source.name} lists no models`);
  return models[0].id;
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

const ENDED = ["complete", "truncated"];

describe.runIf(LIVE)("live", () => {
  const local = PRESETS.filter((p) => !p.needsKey);
  const hosted = PRESETS.filter((p) => p.needsKey);

  for (const preset of local) {
    live(preset.name, async (skip) => {
      if (!(await reachable(`${preset.baseUrl}/models`))) skip(`no server at ${preset.baseUrl}`);
      const source = openaiCompatible(preset, { keys: memoryStore() });
      const { post } = serve([source], memoryStore());
      const model = await firstModel(source);
      const manifest = await post("/api/runs", { source: preset.id, model, prompt: PROMPT, maxTokens: 400, topLogprobs: 2, timeoutMs: 60_000 });
      expect(ENDED, manifest.completion.reason).toContain(manifest.completion.state);
      return `${model}, ${manifest.completion.state}, run ${manifest.id}`;
    });
  }

  /** A hosted source, against its provider or the stand-in. */
  const hostedTest = (id: string, name: string, make: (keys: KeyStore, baseUrl?: string) => Source) =>
    live(name, async (skip) => {
      const real = await keychainStore().get(id);
      if (!real && !STAND_IN) skip("no key in the keychain, and no stand-in (RT_LIVE_STAND_IN)");
      if (!real && !STAND_IN_KEY) skip("RT_LIVE_STAND_IN is set without RT_LIVE_STAND_IN_KEY");
      const keys = real ? keychainStore() : memoryStore();
      const source = make(keys, real ? undefined : STAND_IN);
      const { call, post, log } = serve([source], keys);
      const key = real ? real.reveal() : STAND_IN_KEY!;
      if (!real) expect((await call(`/api/keys/${id}`, { method: "PUT", body: JSON.stringify({ key }) })).status).toBe(204);

      const model = await firstModel(source);
      const ok = await post("/api/runs", { source: id, model, prompt: PROMPT, maxTokens: 400, topLogprobs: 2, timeoutMs: 60_000 });
      expect(ENDED, ok.completion.reason).toContain(ok.completion.state);
      const ids = [ok.id];

      if (!real) {
        // The stand-in refuses any other key, the way the provider would.
        await keys.set(id, `${key}-wrong`);
        const refused = await post("/api/runs", { source: id, model, prompt: PROMPT, maxTokens: 50, timeoutMs: 60_000 });
        expect(refused.completion.state).toBe("error");
        ids.push(refused.id);
        expectNoKey(ids, log, `${key}-wrong`);
      }
      expectNoKey(ids, log, key);
      return `${real ? "provider" : `stand-in at ${STAND_IN}`}, ${model}, runs ${ids.join(" ")}`;
    });

  for (const preset of hosted) {
    hostedTest(preset.id, preset.name, (keys, baseUrl) => openaiCompatible(baseUrl ? { ...preset, baseUrl } : preset, { keys }));
  }
  hostedTest("anthropic", "Anthropic", (keys, baseUrl) => anthropicSource({ keys, baseUrl }));

  for (const model of ["qwen3-0.6b", "gemma-3-1b-it"]) {
    live(`full tier, ${model}`, async (skip) => {
      try {
        execFileSync("uv", ["--version"], { stdio: "ignore" });
      } catch {
        skip("Python absent: uv is not on the PATH");
      }
      const source = weightsSource({ command: "uv", args: ["run", "--frozen", "--extra", "model", "python", "-m", "reasontrace_sidecar"], cwd: BRIDGE });
      try {
        const { post } = serve([source], memoryStore());
        const manifest = await post("/api/runs", {
          source: "weights",
          model,
          prompt: "Name a prime number between 10 and 20.",
          maxTokens: 60,
          topLogprobs: 5,
          timeoutMs: 300_000,
          plan: { layers: "all", positions: "all", pooling: "none" },
        });
        expect(ENDED, manifest.completion.reason).toContain(manifest.completion.state);
        expect(manifest.unavailable.map((u) => u.depth)).not.toContain("internals");
        return `${manifest.completion.state}, run ${manifest.id}`;
      } finally {
        source.stop?.();
      }
    }, 600_000);
  }

  live("z3", async () => {
    const { post } = serve([], memoryStore());
    const problem = readFileSync(join(Z3_FIXTURES, "modus-ponens.smt2"), "utf8");
    const manifest = await post("/api/solve", { engine: "z3", problem });
    expect(manifest.completion.state).toBe("complete");
    return `run ${manifest.id}`;
  });

  live("pipeline, Virgil's click point", async (skip) => {
    const preset = (await Promise.all(local.map(async (p) => ((await reachable(`${p.baseUrl}/models`)) ? p : null)))).find(Boolean);
    if (!preset) skip("no local server is running to translate the text");
    const source = openaiCompatible(preset!, { keys: memoryStore() });
    const { post } = serve([source], memoryStore());
    const model = await firstModel(source);
    const manifest = await post("/api/pipelines", { source: preset!.id, model, text: VIRGIL_TASK, engine: "z3", maxTokens: 4000, timeoutMs: 300_000 });
    expect(manifest.pipeline?.engine).toBe("z3");
    expect(["complete", "truncated", "error"], manifest.completion.reason).toContain(manifest.completion.state);
    return `${preset!.name} ${model}, ${manifest.completion.state}: ${manifest.completion.reason ?? ""}, run ${manifest.id}`;
  }, 600_000);
});
