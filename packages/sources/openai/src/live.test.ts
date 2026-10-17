import { keychainStore } from "@reasontrace/keys";
import { describe, expect, test } from "vitest";
import { memorySink } from "../../../../test/fixtureFetch";
import { PRESETS } from "./presets.ts";
import { openaiCompatible } from "./source.ts";

// Runs only with RT_LIVE_TESTS=1. RT_LIVE_SOURCE picks the preset (default
// llamacpp) and RT_LIVE_MODEL the model (default: the first one listed).
describe.runIf(process.env.RT_LIVE_TESTS === "1")("OpenAI-compatible source, live", () => {
  test("a short run completes and nothing it records holds the key", async (context) => {
    const preset = PRESETS.find((p) => p.id === (process.env.RT_LIVE_SOURCE ?? "llamacpp"));
    if (!preset) throw new Error(`No preset ${process.env.RT_LIVE_SOURCE}`);
    const keys = keychainStore();
    const key = await keys.get(preset.id);
    if (preset.needsKey && !key) context.skip();

    const source = openaiCompatible(preset, { keys });
    const model = process.env.RT_LIVE_MODEL ?? (await source.models(AbortSignal.timeout(10_000)))[0].id;
    const sink = memorySink();
    const outcome = await source.run({ model, prompt: "Reply with just the word: hi", maxTokens: 400, topLogprobs: 2, timeoutMs: 60_000 }, sink, AbortSignal.timeout(60_000));

    expect(["complete", "truncated"]).toContain(outcome.completion.state);
    expect(sink.events.some((e) => e.type === "final_answer")).toBe(true);
    if (key) expect(JSON.stringify([outcome, sink])).not.toContain(key.reveal());
  }, 90_000);
});
