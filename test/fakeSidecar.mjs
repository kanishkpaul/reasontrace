// Stands in for the Python sidecar in tests: it answers JSON-RPC on stdio with
// the messages recorded from a real run (packages/sidecar/fixtures).
//
// Usage: node test/fakeSidecar.mjs [replay | unavailable | stall | crash | refuse | undecodable]
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const fixtures = join(import.meta.dirname, "../packages/sidecar/fixtures");
const recorded = readFileSync(join(fixtures, "qwen3-run.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const [hello, models] = recorded;
const deltas = recorded.filter((m) => m.method === "delta");
const result = recorded.at(-1);
const decoded = JSON.parse(readFileSync(join(fixtures, "qwen3-decode.json"), "utf8"));
const mode = process.argv[2] ?? "replay";
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
let stalled = null;

createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (method === "hello") {
    send({ id, result: mode === "unavailable" ? { protocol: 1, runtime: null, unavailable: "The model runtime is not installed (No module named 'torch'). Run `uv sync --extra model` in bridge/python." } : hello.result });
  } else if (method === "models") {
    send({ id, result: models.result });
  } else if (method === "run" && mode === "crash") {
    process.stderr.write("RuntimeError: MPS backend out of memory\n");
    process.exit(3);
  } else if (method === "run" && mode === "refuse") {
    send({ id, error: { code: -32000, message: "Could not get google/gemma-3-1b-it from Hugging Face: GatedRepoError: 403" } });
  } else if (method === "run" && mode === "stall") {
    for (const delta of deltas.slice(0, 5)) send({ method: "delta", params: { ...delta.params, id } });
    stalled = id;
  } else if (method === "run") {
    for (const delta of deltas) send({ method: "delta", params: { ...delta.params, id } });
    mkdirSync(params.tensorsDir, { recursive: true });
    copyFileSync(join(fixtures, "qwen3-run-residual.safetensors"), join(params.tensorsDir, "residual.safetensors"));
    send({ id, result: result.result });
  } else if (method === "decode" && mode === "undecodable") {
    send({ id, error: { code: -32603, message: "RuntimeError: MPS backend out of memory" } });
  } else if (method === "decode") {
    copyFileSync(join(fixtures, "qwen3-run-lens.jsonl"), join(params.runDir, "attachments", "lens.logit-1.jsonl"));
    send({ id, result: decoded });
  } else if (method === "cancel" && params.id === stalled) {
    send({ id: stalled, result: { ...result.result, finish: "cancelled", capture: null } });
  }
});
