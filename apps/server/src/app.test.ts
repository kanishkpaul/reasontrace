import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSse } from "@reasontrace/core";
import type { Run, RunManifest } from "@reasontrace/format";
import { memoryStore } from "@reasontrace/keys";
import { describe, expect, test } from "vitest";
import { readFixture, replay, type HttpFixture, type ReplayStep } from "../../../test/fixtureFetch";
import { createApp, TOKEN_HEADER } from "./app.ts";
import { engines, registry } from "./registry.ts";

const TOKEN = "launch-token-for-tests";
const OPENAI_FIXTURES = join(import.meta.dirname, "../../../packages/sources/openai/fixtures");
const ANTHROPIC_FIXTURES = join(import.meta.dirname, "../../../packages/sources/anthropic/fixtures");
const Z3_FIXTURES = join(import.meta.dirname, "../../../packages/engines/z3/fixtures");
const PIPELINE_FIXTURES = join(import.meta.dirname, "../../../fixtures/pipelines");

/** A stored run without what changes each time it is made. */
const stable = (run: Run) => ({ ...run, manifest: { ...run.manifest, id: "run", createdAt: "", finishedAt: "" } });

function setup(steps: ReplayStep[] = [], initialKeys: Record<string, string> = {}, webDir?: string) {
  const runsDir = mkdtempSync(join(tmpdir(), "rt-server-"));
  const keys = memoryStore(initialKeys);
  const fake = replay(...steps);
  const log: string[] = [];
  const app = createApp({ token: TOKEN, sources: registry({ keys, fetch: fake.fetch }), engines: engines(), keys, runsDir, webDir, log: (line) => log.push(line), versions: { reasontrace: "test" } });
  const call = (path: string, init: RequestInit & { token?: string | null; host?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("host", init.host ?? "127.0.0.1:4317");
    if (init.token !== null) headers.set(TOKEN_HEADER, init.token ?? TOKEN);
    if (init.body) headers.set("content-type", "application/json");
    return app.request(path, { ...init, headers });
  };
  return { app, call, runsDir, keys, log, requests: fake.requests };
}

/** Starts a run over the API and reads its stream to the end. */
async function runOver(call: ReturnType<typeof setup>["call"], body: Record<string, unknown>) {
  const response = await call("/api/runs", { method: "POST", body: JSON.stringify(body) });
  expect(response.status).toBe(200);
  const messages: { event: string; data: unknown }[] = [];
  for await (const message of readSse(response.body!)) messages.push({ event: message.event, data: JSON.parse(message.data) });
  const done = messages.find((m) => m.event === "done")?.data as { manifest: RunManifest };
  return { messages, manifest: done.manifest };
}

/** Every file under `dir`, read as text. */
function allFiles(dir: string): string {
  return readdirSync(dir).map((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allFiles(path) : readFileSync(path, "utf8");
  }).join("\n");
}

describe("the launch token and host check", () => {
  test("an API request without the token, or with the wrong one, is rejected", async () => {
    const { call } = setup();
    expect((await call("/api/sources", { token: null })).status).toBe(401);
    expect((await call("/api/sources", { token: "launch-token-for-tesTS" })).status).toBe(401);
    expect((await call("/api/sources", { token: "x" })).status).toBe(401);
    expect((await call("/api/runs", { token: null, method: "POST", body: "{}" })).status).toBe(401);
    expect((await call("/api/sources")).status).toBe(200);
  });

  test("a request naming any host but this machine is refused, token or not", async () => {
    const { call } = setup();
    expect((await call("/api/sources", { host: "attacker.example:4317" })).status).toBe(403);
    expect((await call("/api/sources", { host: "localhost:4317" })).status).toBe(200);
    expect((await call("/api/sources", { host: "[::1]:4317" })).status).toBe(200);
  });
});

describe("keys over the API", () => {
  test("a key can be stored and removed but never read back", async () => {
    const { call, keys } = setup();
    expect((await call("/api/keys/openai", { method: "PUT", body: JSON.stringify({ key: " sk-stored-0123 " }) })).status).toBe(204);
    expect((await keys.get("openai"))?.reveal()).toBe("sk-stored-0123");

    const listing = await (await call("/api/sources")).text();
    expect(listing).not.toContain("sk-stored-0123");
    expect(JSON.parse(listing).sources.find((s: { id: string }) => s.id === "openai")).toMatchObject({ needsKey: true, hasKey: true });
    expect((await call("/api/keys/openai")).status).toBe(404);

    expect((await call("/api/keys/openai", { method: "DELETE" })).status).toBe(204);
    expect(await keys.has("openai")).toBe(false);
  });

  test("a local server takes no key", async () => {
    const { call } = setup();
    expect((await call("/api/keys/llamacpp", { method: "PUT", body: JSON.stringify({ key: "x" }) })).status).toBe(404);
  });
});

describe("runs over the API", () => {
  test("a run streams its text, writes its directory and reads back with its declared and found gaps", async () => {
    const { call, runsDir, log } = setup([readFixture(OPENAI_FIXTURES, "llamacpp-reasoning-field")]);
    const { messages, manifest } = await runOver(call, { source: "llamacpp", model: "Qwen/Qwen3-0.6B-GGUF:Q8_0", prompt: "Reply with just the word: hi", topLogprobs: 2 });

    expect(messages[0].event).toBe("start");
    expect(messages.filter((m) => m.event === "delta").length).toBeGreaterThan(10);
    expect(manifest.completion).toEqual({ state: "complete" });
    expect(manifest.source).toMatchObject({ id: "llamacpp", tier: "local" });
    expect(manifest.unavailable.map((u) => u.depth)).toEqual(["internals"]);
    expect(log.at(-1)).toMatch(/capture\s+llama\.cpp server · Qwen\/Qwen3-0\.6B-GGUF:Q8_0 · complete/);

    const runs = (await (await call("/api/runs")).json()) as { runs: RunManifest[] };
    expect(runs.runs.map((r) => r.id)).toEqual([manifest.id]);
    const run = (await (await call(`/api/runs/${manifest.id}`)).json()) as Run;
    expect(run.trace.events.map((e) => e.type)).toEqual(["reasoning", "final_answer"]);
    expect(run.attachments.map((a) => a.eventId)).toEqual(["reasoning", "output"]);
    expect(readdirSync(join(runsDir, manifest.id)).sort()).toEqual(["attachments", "events.jsonl", "manifest.json"]);
  });

  test("a model without a depth gets an unavailable record with its reason, before and after the run", async () => {
    const { call } = setup([readFixture(ANTHROPIC_FIXTURES, "anthropic-no-thinking")], { anthropic: "sk-ant-x" });
    const capabilities = (await (await call("/api/sources/anthropic/capabilities?model=claude-opus-5-5")).json()) as { unavailable: { depth: string }[] };
    expect(capabilities.unavailable.map((u) => u.depth)).toEqual(["probabilities", "internals"]);

    const { manifest } = await runOver(call, { source: "anthropic", model: "claude-opus-5-5", prompt: "hi" });
    expect(manifest.unavailable.map((u) => u.depth)).toEqual(["probabilities", "internals", "stated"]);
    for (const u of manifest.unavailable) expect(u.reason).toBeTruthy();
  });

  test("bad requests are refused before anything runs", async () => {
    const { call, runsDir } = setup();
    const status = async (body: unknown) => (await call("/api/runs", { method: "POST", body: JSON.stringify(body) })).status;
    expect(await status({ source: "llamacpp", model: "m" })).toBe(400);
    expect(await status({ source: "llamacpp", model: "m", prompt: "hi", maxTokens: 0 })).toBe(400);
    expect(await status({ source: "llamacpp", model: "m", prompt: "hi", temperature: 9 })).toBe(400);
    expect(await status({ source: "weights", model: "m", prompt: "hi", cache: "yes" })).toBe(400);
    expect(await status({ source: "weights", model: "m", prompt: "hi", plan: { layers: [-1], positions: "last", pooling: "none" } })).toBe(400);
    expect(await status({ source: "weights", model: "m", prompt: "hi", plan: { layers: "all", positions: "first", pooling: "none" } })).toBe(400);
    expect(await status({ source: "nope", model: "m", prompt: "hi" })).toBe(404);
    expect(await status([1])).toBe(400);
    expect(readdirSync(runsDir)).toEqual([]);
  });

  test("a run ID that isn't one can't reach outside the runs directory", async () => {
    const { call } = setup();
    expect((await call("/api/runs/..%2F..%2Fetc")).status).toBe(404);
    expect((await call("/api/runs/20261018-000000-abcdef")).status).toBe(404);
  });
});

describe("solves over the API", () => {
  test("a solve writes a symbolic run whose derivations read back as exact", async () => {
    const { call, runsDir, log } = setup();
    const engines = (await (await call("/api/engines")).json()) as { engines: { id: string; language: string }[] };
    expect(engines.engines).toEqual([{ id: "z3", name: "z3", language: "SMT-LIB 2" }]);

    const problem = readFileSync(join(Z3_FIXTURES, "modus-ponens.smt2"), "utf8");
    const response = await call("/api/solve", { method: "POST", body: JSON.stringify({ engine: "z3", problem }) });
    expect(response.status).toBe(200);
    const { manifest } = (await response.json()) as { manifest: RunManifest };
    expect(manifest.completion).toEqual({ state: "complete" });
    expect(manifest.title).toBe("z3 · p, and p implies q, yet not q.");
    expect(manifest.source).toMatchObject({ id: "z3", tier: "symbolic" });
    expect(manifest.request).toEqual({ engine: "z3", problem, timeoutMs: 30_000 });
    expect(manifest.versions).toEqual({ reasontrace: "test", z3: "5.1.0" });
    expect(manifest.unavailable.map((u) => u.depth)).toEqual(["stated", "probabilities"]);
    expect(log.at(-1)).toMatch(/solve\s+z3 · complete/);

    const run = (await (await call(`/api/runs/${manifest.id}`)).json()) as Run;
    expect(run.trace.events.map((e) => [e.type, e.label])).toEqual([["derivation", "exact"], ["derivation", "exact"], ["final_answer", "observed"]]);
    expect(run.attachments.map((a) => a.kind)).toEqual(["symbolic.proof_tree/1", "symbolic.unsat_core/1"]);
    expect(readdirSync(join(runsDir, manifest.id)).sort()).toEqual(["attachments", "events.jsonl", "manifest.json"]);
  });

  test("a problem z3 cannot read is recorded as an error with the reason", async () => {
    const { call } = setup();
    const response = await call("/api/solve", { method: "POST", body: JSON.stringify({ engine: "z3", problem: "(assert (> x 1))" }) });
    const { manifest } = (await response.json()) as { manifest: RunManifest };
    expect(manifest.completion.state).toBe("error");
    expect(manifest.completion.reason).toMatch(/unknown constant x/);
  });

  test("bad requests are refused before anything runs", async () => {
    const { call, runsDir } = setup();
    const status = async (body: unknown) => (await call("/api/solve", { method: "POST", body: JSON.stringify(body) })).status;
    expect(await status({ engine: "z3" })).toBe(400);
    expect(await status({ engine: "z3", problem: "  " })).toBe(400);
    expect(await status({ engine: "z3", problem: "(check-sat)", timeoutMs: 10 })).toBe(400);
    expect(await status({ engine: "nope", problem: "(check-sat)" })).toBe(404);
    expect(readdirSync(runsDir)).toEqual([]);
  });
});

describe("pipelines over the API", () => {
  const AGES = "Ann is 30. Ben is more than 5 years older than Ann. Ben is younger than 34.";

  test("a translation with a deliberate error shows where the formula departs from the text", async () => {
    const { call, log, requests } = setup([readFixture(PIPELINE_FIXTURES, "ages-deliberate-error")]);
    const response = await call("/api/pipelines", { method: "POST", body: JSON.stringify({ source: "llamacpp", model: "Qwen/Qwen3-0.6B-GGUF:Q8_0", text: AGES, engine: "z3", topLogprobs: 0 }) });
    const messages: { event: string; data: unknown }[] = [];
    for await (const message of readSse(response.body!)) messages.push({ event: message.event, data: JSON.parse(message.data) });
    const { manifest } = messages.find((m) => m.event === "done")!.data as { manifest: RunManifest };

    // The model was asked to quote the words each assertion encodes.
    expect(JSON.parse(requests[0].body).messages[0].content).toContain(`Problem:\n${AGES}`);
    expect(manifest.completion).toEqual({ state: "complete" });
    expect(manifest.pipeline).toEqual({ text: AGES, engine: "z3", timeoutMs: 30_000 });
    expect(manifest.title).toBe(`Qwen/Qwen3-0.6B-GGUF:Q8_0 → z3 · ${AGES.slice(0, 60)}`);
    expect(log.at(-1)).toMatch(/pipeline\s+llama\.cpp server · Qwen\/Qwen3-0\.6B-GGUF:Q8_0 → z3 · complete/);

    const run = (await (await call(`/api/runs/${manifest.id}`)).json()) as Run;
    expect(run.trace.events.map((e) => [e.id, e.type, e.step])).toEqual([["output", "final_answer", 1], ["translation", "translation", 2], ["d1", "derivation", 3], ["a1", "final_answer", 3]]);
    const translation = run.attachments.find((a) => a.kind === "nesy.translation/1")!.data;
    expect(translation.assertions.map((a) => a.departures)).toEqual([[], [], [{ check: "numbers", detail: "The words give 34; the assertion has 43." }]]);
    expect(AGES.slice(...translation.assertions[2].span!)).toBe("Ben is younger than 34");
    // The departure changes the answer: the problem has no solution, the formula has one.
    expect(run.trace.events.at(-1)?.content).toBe("sat");

    // The viewer's tests read this run as stored.
    expect(stable(run)).toEqual(JSON.parse(readFileSync(join(PIPELINE_FIXTURES, "ages-deliberate-error.run.json"), "utf8")));
  });

  test("a reply with no SMT-LIB ends the pipeline with the reason, and nothing is solved", async () => {
    const { call } = setup([readFixture(OPENAI_FIXTURES, "llamacpp-reasoning-field")]);
    const response = await call("/api/pipelines", { method: "POST", body: JSON.stringify({ source: "llamacpp", model: "m", text: AGES, engine: "z3" }) });
    let manifest: RunManifest | undefined;
    for await (const message of readSse(response.body!)) if (message.event === "done") manifest = JSON.parse(message.data).manifest;
    expect(manifest!.completion).toEqual({ state: "error", reason: "The model's reply has no SMT-LIB in it, so there was nothing to solve." });
    const run = (await (await call(`/api/runs/${manifest!.id}`)).json()) as Run;
    expect(run.trace.events.some((e) => e.type === "translation" || e.type === "derivation")).toBe(false);
  });

  test("bad requests are refused before anything runs", async () => {
    const { call, runsDir } = setup();
    const status = async (body: unknown) => (await call("/api/pipelines", { method: "POST", body: JSON.stringify(body) })).status;
    expect(await status({ source: "llamacpp", model: "m", engine: "z3" })).toBe(400);
    expect(await status({ source: "llamacpp", model: "m", text: "x" })).toBe(400);
    expect(await status({ source: "llamacpp", model: "m", text: "x", engine: "z3", solveTimeoutMs: 1 })).toBe(400);
    expect(await status({ source: "llamacpp", model: "m", text: "x", engine: "nope" })).toBe(404);
    expect(await status({ source: "nope", model: "m", text: "x", engine: "z3" })).toBe(404);
    expect(readdirSync(runsDir)).toEqual([]);
  });
});

describe("keys never reach the run directory or the log", () => {
  const keyed = registry({ keys: memoryStore() }).filter((s) => s.needsKey);

  /** An error reply that repeats the key, as some providers do. */
  const echo = (key: string): HttpFixture => ({
    recorded: "test",
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: `Incorrect API key provided: ${key}` } }),
  });

  test.each(keyed.map((s) => [s.id]))("%s", async (id) => {
    const key = `sk-${id}-secret-bytes-0123456789`;
    const success = id === "anthropic" ? readFixture(ANTHROPIC_FIXTURES, "anthropic-thinking") : readFixture(OPENAI_FIXTURES, "llamacpp-reasoning-field");
    const { call, runsDir, log, requests } = setup([success, echo(key)]);

    expect((await call(`/api/keys/${id}`, { method: "PUT", body: JSON.stringify({ key }) })).status).toBe(204);
    const ok = await runOver(call, { source: id, model: "some-model", prompt: "hi" });
    const failed = await runOver(call, { source: id, model: "some-model", prompt: "hi" });

    expect(ok.manifest.completion.state).toBe("complete");
    expect(failed.manifest.completion.state).toBe("error");
    // The key did go to the provider, so its absence below means something.
    expect(JSON.stringify(requests.map((r) => r.headers))).toContain(key);
    expect(allFiles(runsDir)).not.toContain(key);
    expect(log.join("\n")).not.toContain(key);
    expect(JSON.stringify([ok.messages, failed.messages])).not.toContain(key);
  });
});

describe("serving the viewer", () => {
  test("the page carries the launch token; files outside the build are not served", async () => {
    const webDir = mkdtempSync(join(tmpdir(), "rt-web-"));
    mkdirSync(join(webDir, "assets"));
    writeFileSync(join(webDir, "index.html"), "<html><head><title>t</title></head><body></body></html>");
    writeFileSync(join(webDir, "assets", "app.js"), "console.log(1)");
    const { call } = setup([], {}, webDir);

    const page = await (await call("/", { token: null })).text();
    expect(page).toContain(`<meta name="reasontrace-token" content="${TOKEN}">`);
    const asset = await call("/assets/app.js", { token: null });
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toBe("console.log(1)");
    expect(await (await call("/..%2F..%2Fpackage.json", { token: null })).text()).toContain("<html>");
    expect((await call("/", { token: null, host: "attacker.example" })).status).toBe(403);
  });
});
