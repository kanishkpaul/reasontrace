import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { closeInterruptedRuns, isRunId, listRuns, newRunId, readRun, RunReadError, RunWriter } from "./runDir.ts";

const manifest = (id: string) => ({
  id,
  title: "t",
  createdAt: "2026-10-18T00:00:00.000Z",
  source: { id: "llamacpp", name: "llama.cpp", tier: "local" as const, baseUrl: "http://127.0.0.1:8080/v1" },
  request: { model: "m", prompt: "p", maxTokens: 10, topLogprobs: 5, timeoutMs: 1000 },
  unavailable: [{ depth: "internals" as const, reason: "HTTP only" }],
  versions: {},
});

describe("run directories", () => {
  test("newRunId makes sortable IDs that isRunId accepts, and isRunId refuses paths", () => {
    const id = newRunId(new Date("2026-10-18T01:02:03Z"));
    expect(id).toMatch(/^20261018-010203-[0-9a-f]{6}$/);
    expect(isRunId(id)).toBe(true);
    expect(isRunId("../etc")).toBe(false);
    expect(isRunId(`${id}/..`)).toBe(false);
  });

  test("a written run reads back as manifest, trace and attachments", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-runs-"));
    const id = newRunId();
    const deltas: string[] = [];
    const writer = new RunWriter(root, manifest(id), (_, text) => deltas.push(text));
    writer.delta("output", "Hi");
    writer.event({ id: "output", type: "final_answer", step: 1, content: "Hi", depth: "behaviour", label: "observed", supports: [] });
    writer.attach({ kind: "probs.top_k/1", eventId: "output", label: "measured", data: { tokens: [{ token: "Hi", logprob: -0.1, top: [] }] } });
    writer.finish({ completion: { state: "complete" }, unavailable: [{ depth: "stated", reason: "none returned" }, { depth: "internals", reason: "dup" }] });

    const run = readRun(root, id);
    expect(deltas).toEqual(["Hi"]);
    expect(run.manifest.completion).toEqual({ state: "complete" });
    expect(run.trace.events.map((e) => e.content)).toEqual(["Hi"]);
    expect(run.attachments).toHaveLength(1);
    expect(run.trace.unavailable).toEqual([{ depth: "internals", reason: "HTTP only" }, { depth: "stated", reason: "none returned" }]);
  });

  test("a run still marked running when a server starts is closed as aborted, keeping its events", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-runs-"));
    const id = newRunId();
    const writer = new RunWriter(root, manifest(id));
    writer.event({ id: "output", type: "final_answer", step: 1, content: "partial", depth: "behaviour", label: "observed", supports: [] });

    expect(closeInterruptedRuns(root)).toEqual([id]);
    const run = readRun(root, id);
    expect(run.manifest.completion.state).toBe("aborted");
    expect(run.trace.events[0].content).toBe("partial");
    expect(closeInterruptedRuns(root)).toEqual([]);
  });

  test("listRuns is newest first and skips directories that aren't runs", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-runs-"));
    new RunWriter(root, manifest("20261018-000000-aaaaaa"));
    new RunWriter(root, manifest("20261018-000001-bbbbbb"));
    writeFileSync(join(root, "notes.txt"), "x");
    expect(listRuns(root).map((m) => m.id)).toEqual(["20261018-000001-bbbbbb", "20261018-000000-aaaaaa"]);
  });

  test("a corrupt events line is an error naming the file and line", () => {
    const root = mkdtempSync(join(tmpdir(), "rt-runs-"));
    const id = newRunId();
    const writer = new RunWriter(root, manifest(id));
    writeFileSync(join(writer.dir, "events.jsonl"), "{\"id\":1}\n{oops\n");
    expect(() => readRun(root, id)).toThrow(RunReadError);
    expect(() => readRun(root, id)).toThrow(/line 2/);
    expect(readFileSync(join(writer.dir, "manifest.json"), "utf8")).toContain("running");
  });
});
