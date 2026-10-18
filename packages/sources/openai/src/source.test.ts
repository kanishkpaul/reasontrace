import type { RunRequest } from "@reasontrace/format";
import { memoryStore } from "@reasontrace/keys";
import { describe, expect, test } from "vitest";
import { memorySink, readFixture, replay, type HttpFixture } from "../../../../test/fixtureFetch";
import { PRESETS } from "./presets.ts";
import { openaiCompatible } from "./source.ts";

const FIXTURES = `${import.meta.dirname}/../fixtures`;
const fixture = (name: string) => readFixture(FIXTURES, name);
const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
const KEY = "sk-fixture-key-0123456789";

const request: RunRequest = { model: "Qwen/Qwen3-0.6B-GGUF:Q8_0", prompt: "Reply with just the word: hi", maxTokens: 300, temperature: 0, seed: 7, topLogprobs: 2, timeoutMs: 1000 };

/** The fixture with every chunk's `logprobs` removed, as from a server that ignores the request. */
function withoutLogprobs(f: HttpFixture): HttpFixture {
  const body = f.body.split("\n").map((line) => {
    if (!line.startsWith("data: {")) return line;
    const chunk = JSON.parse(line.slice(6));
    for (const choice of chunk.choices ?? []) delete choice.logprobs;
    return `data: ${JSON.stringify(chunk)}`;
  }).join("\n");
  return { ...f, body };
}

async function run(id: string, ...steps: Parameters<typeof replay>) {
  const fake = replay(...steps);
  const source = openaiCompatible(preset(id), { keys: memoryStore({ openai: KEY, groq: KEY }), fetch: fake.fetch });
  const sink = memorySink();
  const outcome = await source.run(request, sink, new AbortController().signal);
  return { outcome, sink, requests: fake.requests };
}

describe("OpenAI-compatible source, recorded llama.cpp replies", () => {
  test("reasoning in its own field is stated reasoning; the answer is observed; probabilities follow each channel", async () => {
    const { outcome, sink, requests } = await run("llamacpp", fixture("llamacpp-reasoning-field"));
    expect(outcome.completion).toEqual({ state: "complete" });
    expect(sink.events.map((e) => [e.id, e.type, e.depth, e.label])).toEqual([
      ["reasoning", "reasoning", "stated", "stated"],
      ["output", "final_answer", "behaviour", "observed"],
    ]);
    expect(sink.events[0].content).toMatch(/^Okay, the user just said "hi"/);
    expect(sink.events[0].providerSummary).toBeUndefined();
    expect(sink.events[1].content).toBe("hi");
    const [reasoningProbs, outputProbs] = sink.probs();
    expect(reasoningProbs).toMatchObject({ kind: "probs.top_k/1", eventId: "reasoning", label: "measured" });
    expect(reasoningProbs.data.tokens[0].token).toBe("<think>");
    expect(outputProbs.eventId).toBe("output");
    expect(outputProbs.data.tokens.map((t) => t.token)).toEqual(["hi"]);
    expect(outputProbs.data.tokens[0].top).toHaveLength(2);
    expect(outcome.unavailable).toEqual([]);
    expect(outcome.usage).toMatchObject({ outputTokens: 63, inputTokens: 15 });
    expect(outcome.respondingModel).toBe("Qwen/Qwen3-0.6B-GGUF:Q8_0");
    expect(sink.streamed("output")).toBe("hi");
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(JSON.parse(requests[0].body)).toMatchObject({ logprobs: true, top_logprobs: 2, max_tokens: 300, stream: true });
  });

  test("inline <think> text is split from the answer, and so are its token probabilities", async () => {
    const { outcome, sink } = await run("llamacpp", fixture("llamacpp-think-tags"));
    expect(outcome.completion.state).toBe("complete");
    const [reasoning, output] = sink.events;
    expect(reasoning).toMatchObject({ type: "reasoning", label: "stated", metadata: { via: "<think> tags" } });
    expect(reasoning.content).not.toContain("<think>");
    expect(output.content).toBe("hi");
    expect(sink.probs().find((a) => a.eventId === "output")?.data.tokens.map((t) => t.token)).toEqual(["hi"]);
    expect(sink.streamed("reasoning")).not.toContain("think>");
    expect(sink.streamed("output")).toBe("hi");
  });

  test("a reply cut off while reasoning is truncated, with no answer event", async () => {
    const { outcome, sink } = await run("llamacpp", fixture("llamacpp-truncated"));
    expect(outcome.completion).toEqual({ state: "truncated", reason: "Reached the limit of 300 output tokens." });
    expect(sink.events.map((e) => e.type)).toEqual(["reasoning"]);
  });

  test("an HTTP error is an error with the server's message and a failure event", async () => {
    const { outcome, sink } = await run("llamacpp", fixture("llamacpp-http-error"));
    expect(outcome.completion).toEqual({ state: "error", reason: "HTTP 400: Expected 'messages' to be an array" });
    expect(sink.events.map((e) => e.type)).toEqual(["failure"]);
    expect(outcome.unavailable).toEqual([]);
  });

  test("a server that ignores the probabilities request leaves that depth unavailable, with the reason", async () => {
    const { outcome, sink } = await run("llamacpp", withoutLogprobs(fixture("llamacpp-reasoning-field")));
    expect(sink.attachments).toEqual([]);
    expect(outcome.unavailable).toEqual([{ depth: "probabilities", reason: "llama.cpp server returned no log-probabilities for this model." }]);
  });

  test("a model with no reasoning text leaves the stated depth unavailable, with the reason", async () => {
    const f = fixture("llamacpp-reasoning-field");
    const answerOnly = { ...f, body: f.body.split("\n").filter((line) => !line.includes("reasoning_content")).join("\n") };
    const { outcome } = await run("llamacpp", answerOnly);
    expect(outcome.unavailable).toContainEqual({ depth: "stated", reason: "The model returned no reasoning text." });
  });
});

describe("OpenAI-compatible source, documented reply shapes", () => {
  test("a refusal is refused, with the model's words recorded", async () => {
    const { outcome, sink, requests } = await run("openai", fixture("openai-refusal"));
    expect(outcome.completion).toEqual({ state: "refused", reason: "I'm sorry, I can't help with that." });
    expect(sink.events.find((e) => e.id === "refusal")).toMatchObject({ type: "final_answer", metadata: { refusal: true } });
    expect(requests[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(requests[0].body)).toHaveProperty("max_completion_tokens", 300);
  });

  test("a refused probabilities request is retried without it and recorded as the reason", async () => {
    const { outcome, sink, requests } = await run("groq", fixture("openai-logprobs-rejected"), withoutLogprobs(fixture("llamacpp-reasoning-field")));
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1].body)).not.toHaveProperty("logprobs");
    expect(outcome.completion.state).toBe("complete");
    expect(sink.attachments).toEqual([]);
    expect(outcome.unavailable).toEqual([{ depth: "probabilities", reason: "Groq refused the request for log-probabilities: logprobs is not supported with this model" }]);
    expect(outcome.providerRequest).not.toHaveProperty("logprobs");
  });

  test("a provider message that repeats the key is recorded without it", async () => {
    const { outcome, sink } = await run("openai", fixture("openai-key-echoed"));
    expect(outcome.completion.state).toBe("error");
    expect(JSON.stringify([outcome, sink.events])).not.toContain(KEY);
    expect(outcome.completion.reason).toContain("[redacted key]");
  });

  test("an error sent mid-stream is an error, and the text before it is kept", async () => {
    const { outcome, sink } = await run("llamacpp", fixture("openai-stream-error"));
    expect(outcome.completion).toEqual({ state: "error", reason: "Upstream provider returned an error" });
    expect(sink.events.map((e) => [e.type, e.content])).toEqual([["final_answer", "Par"], ["failure", "Upstream provider returned an error"]]);
  });
});

describe("OpenAI-compatible source, runs that stop", () => {
  test("a server that stops sending is a timeout, keeping what arrived", async () => {
    const fake = replay({ fixture: fixture("llamacpp-reasoning-field"), stallAfter: 20 });
    const source = openaiCompatible(preset("llamacpp"), { keys: memoryStore(), fetch: fake.fetch });
    const sink = memorySink();
    const outcome = await source.run({ ...request, timeoutMs: 50 }, sink, AbortSignal.timeout(50));
    expect(outcome.completion).toEqual({ state: "timeout", reason: "No complete response within 0.05 s." });
    expect(sink.events.map((e) => e.type)).toEqual(["reasoning", "failure"]);
    expect(sink.events[0].content.length).toBeGreaterThan(0);
  });

  test("stopping a run is recorded as aborted, not as an error", async () => {
    const fake = replay({ fixture: fixture("llamacpp-reasoning-field"), stallAfter: 20 });
    const source = openaiCompatible(preset("llamacpp"), { keys: memoryStore(), fetch: fake.fetch });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const outcome = await source.run(request, memorySink(), controller.signal);
    expect(outcome.completion.state).toBe("aborted");
  });

  test("a server that isn't running is an error naming where it was looked for", async () => {
    const refused = new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:8080") });
    const { outcome } = await run("llamacpp", { throws: refused });
    expect(outcome.completion).toEqual({
      state: "error",
      reason: "Could not reach llama.cpp server at http://127.0.0.1:8080/v1: fetch failed: connect ECONNREFUSED 127.0.0.1:8080",
    });
  });

  test("a source that needs a key refuses to run without one, before any request", async () => {
    const fake = replay();
    const source = openaiCompatible(preset("openrouter"), { keys: memoryStore(), fetch: fake.fetch });
    const outcome = await source.run(request, memorySink(), new AbortController().signal);
    expect(outcome.completion).toEqual({ state: "error", reason: "No OpenRouter key is stored. Add one before running." });
    expect(fake.requests).toEqual([]);
  });
});

describe("OpenAI-compatible source, declarations and models", () => {
  test("every model declares internals unavailable; OpenAI reasoning models also hide their reasoning", () => {
    const source = (id: string) => openaiCompatible(preset(id), { keys: memoryStore() });
    expect(source("llamacpp").capabilities("any").unavailable.map((u) => u.depth)).toEqual(["internals"]);
    expect(source("openai").capabilities("gpt-4o").tier).toBe("open");
    const o3 = source("openai").capabilities("o3");
    expect(o3.tier).toBe("frontier");
    expect(o3.unavailable.map((u) => u.depth)).toEqual(["stated", "internals"]);
  });

  test("lists the server's models", async () => {
    const fake = replay(fixture("llamacpp-models"));
    const source = openaiCompatible(preset("llamacpp"), { keys: memoryStore(), fetch: fake.fetch });
    expect(await source.models(new AbortController().signal)).toEqual([{ id: "Qwen/Qwen3-0.6B-GGUF:Q8_0" }]);
    expect(fake.requests[0].url).toBe("http://127.0.0.1:8080/v1/models");
  });
});
