import { keychainStore } from "@reasontrace/keys";
import { describe, expect, test } from "vitest";
import { memorySink } from "../../../../test/fixtureFetch";
import { anthropicSource } from "./index.ts";

// Runs only with RT_LIVE_TESTS=1 and an Anthropic key in the keychain.
// RT_LIVE_MODEL picks the model (default claude-haiku-5-5).
describe.runIf(process.env.RT_LIVE_TESTS === "1")("Anthropic source, live", () => {
  test("a short run completes and nothing it records holds the key", async (context) => {
    const keys = keychainStore();
    const key = await keys.get("anthropic");
    if (!key) context.skip();

    const sink = memorySink();
    const outcome = await anthropicSource({ keys }).run(
      { model: process.env.RT_LIVE_MODEL ?? "claude-haiku-5-5", prompt: "What is 17 × 23? Think it through.", maxTokens: 2000, topLogprobs: 0, timeoutMs: 60_000 },
      sink,
      AbortSignal.timeout(60_000),
    );

    expect(outcome.completion.state).toBe("complete");
    expect(sink.events.some((e) => e.type === "final_answer")).toBe(true);
    expect(JSON.stringify([outcome, sink])).not.toContain(key!.reveal());
  }, 90_000);
});
