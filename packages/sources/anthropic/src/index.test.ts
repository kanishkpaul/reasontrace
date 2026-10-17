import type { RunRequest } from "@reasontrace/format";
import { memoryStore } from "@reasontrace/keys";
import { describe, expect, test } from "vitest";
import { memorySink, readFixture, replay } from "../../../../test/fixtureFetch";
import { anthropicSource } from "./index.ts";

const FIXTURES = `${import.meta.dirname}/../fixtures`;
const fixture = (name: string) => readFixture(FIXTURES, name);
const KEY = "sk-ant-fixture-0123456789";
const request: RunRequest = { model: "claude-opus-5-5", prompt: "GCD of 1071 and 462?", maxTokens: 2000, temperature: 0.5, topLogprobs: 5, timeoutMs: 1000 };

async function run(...steps: Parameters<typeof replay>) {
  const fake = replay(...steps);
  const source = anthropicSource({ keys: memoryStore({ anthropic: KEY }), fetch: fake.fetch });
  const sink = memorySink();
  const outcome = await source.run(request, sink, new AbortController().signal);
  return { outcome, sink, requests: fake.requests };
}

describe("Anthropic source", () => {
  test("thinking is stated reasoning marked as a provider summary; the answer is observed", async () => {
    const { outcome, sink, requests } = await run(fixture("anthropic-thinking"));
    expect(outcome.completion).toEqual({ state: "complete" });
    expect(sink.events.map((e) => [e.id, e.type, e.depth, e.label, e.providerSummary])).toEqual([
      ["reasoning", "reasoning", "stated", "stated", true],
      ["output", "final_answer", "behaviour", "observed", undefined],
    ]);
    expect(sink.events[0].content).toContain("147 = 7 × 21 + 0");
    expect(sink.events[1].content).toBe("The greatest common divisor is **21**.");
    expect(sink.streamed("reasoning")).toBe(sink.events[0].content);
    expect(outcome.usage).toEqual({ inputTokens: 18, outputTokens: 40 });
    expect(outcome.respondingModel).toBe("claude-opus-5-5");

    const sent = JSON.parse(requests[0].body);
    expect(sent.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(sent).not.toHaveProperty("temperature");
    expect(requests[0].headers["x-api-key"]).toBe(KEY);
    expect(requests[0].headers["anthropic-version"]).toBe("2023-06-01");
  });

  test("declares token probabilities and internals unavailable, with reasons", () => {
    const capabilities = anthropicSource({ keys: memoryStore() }).capabilities("claude-opus-5-5");
    expect(capabilities.tier).toBe("frontier");
    expect(capabilities.unavailable.map((u) => u.depth)).toEqual(["probabilities", "internals"]);
    for (const u of capabilities.unavailable) expect(u.reason.length).toBeGreaterThan(20);
  });

  test("no thinking text leaves the stated depth unavailable, with the reason", async () => {
    const { outcome } = await run(fixture("anthropic-no-thinking"));
    expect(outcome.unavailable).toEqual([{ depth: "stated", reason: "The model returned no thinking text. Adaptive thinking can skip thinking on simple prompts." }]);
  });

  test("redacted thinking says it was redacted, not that there was none", async () => {
    const { outcome } = await run(fixture("anthropic-redacted"));
    expect(outcome.unavailable[0].reason).toMatch(/redacted/);
  });

  test("hitting max_tokens is truncated", async () => {
    const { outcome, sink } = await run(fixture("anthropic-max-tokens"));
    expect(outcome.completion).toEqual({ state: "truncated", reason: "Reached the limit of 2000 output tokens." });
    expect(sink.events.at(-1)?.content).toBe("The greatest");
  });

  test("a refusal is refused with the provider's explanation, keeping the partial text", async () => {
    const { outcome, sink } = await run(fixture("anthropic-refusal"));
    expect(outcome.completion).toEqual({ state: "refused", reason: "This request was declined because it could enable cyber harm." });
    expect(sink.events.map((e) => e.content)).toEqual(["Here is"]);
  });

  test("an error event mid-stream is an error, keeping the text before it", async () => {
    const { outcome, sink } = await run(fixture("anthropic-overloaded"));
    expect(outcome.completion).toEqual({ state: "error", reason: "overloaded_error: Overloaded" });
    expect(sink.events.map((e) => e.type)).toEqual(["final_answer", "failure"]);
  });

  test("an HTTP error is an error with the provider's message", async () => {
    const { outcome } = await run(fixture("anthropic-401"));
    expect(outcome.completion).toEqual({ state: "error", reason: "HTTP 401: invalid x-api-key" });
  });

  test("a model that rejects adaptive thinking runs again without it, and says why stated is missing", async () => {
    const { outcome, requests } = await run(fixture("anthropic-adaptive-rejected"), fixture("anthropic-no-thinking"));
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1].body)).not.toHaveProperty("thinking");
    expect(outcome.completion.state).toBe("complete");
    expect(outcome.unavailable).toHaveLength(1);
    expect(outcome.unavailable[0]).toMatchObject({ depth: "stated" });
    expect(outcome.unavailable[0].reason).toMatch(/does not take adaptive thinking/);
  });

  test("a stream that stops sending is a timeout", async () => {
    const fake = replay({ fixture: fixture("anthropic-thinking"), stallAfter: 12 });
    const source = anthropicSource({ keys: memoryStore({ anthropic: KEY }), fetch: fake.fetch });
    const sink = memorySink();
    const outcome = await source.run({ ...request, timeoutMs: 50 }, sink, AbortSignal.timeout(50));
    expect(outcome.completion.state).toBe("timeout");
    expect(sink.events.map((e) => e.type)).toEqual(["reasoning", "failure"]);
  });

  test("refuses to run without a key, before any request", async () => {
    const fake = replay();
    const outcome = await anthropicSource({ keys: memoryStore(), fetch: fake.fetch }).run(request, memorySink(), new AbortController().signal);
    expect(outcome.completion.state).toBe("error");
    expect(fake.requests).toEqual([]);
  });

  test("lists models with their display names", async () => {
    const fake = replay(fixture("anthropic-models"));
    const models = await anthropicSource({ keys: memoryStore({ anthropic: KEY }), fetch: fake.fetch }).models(new AbortController().signal);
    expect(models).toEqual([{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }, { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" }]);
  });
});
