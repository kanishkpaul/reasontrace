import { inspect } from "node:util";
import { describe, expect, test } from "vitest";
import { memoryStore, redact, Secret } from "./index.ts";

const KEY = "sk-test-0123456789abcdef";

describe("Secret", () => {
  test("never serialises or prints its value", () => {
    const secret = new Secret(KEY);
    const outputs = [
      JSON.stringify({ secret }),
      String(secret),
      `${secret}`,
      inspect(secret),
      inspect({ nested: { secret } }, { depth: 5, showHidden: true }),
    ];
    for (const output of outputs) expect(output).not.toContain(KEY);
    expect(secret.reveal()).toBe(KEY);
  });
});

describe("redact", () => {
  test("removes every copy of the key from a provider message", () => {
    expect(redact(`Incorrect API key provided: ${KEY}. Check ${KEY}.`, new Secret(KEY))).toBe(
      "Incorrect API key provided: [redacted key]. Check [redacted key].",
    );
    expect(redact("no key here", null)).toBe("no key here");
  });
});

describe("memoryStore", () => {
  test("stores, reports and deletes keys by name", async () => {
    const store = memoryStore();
    expect(await store.get("openai")).toBeNull();
    await store.set("openai", KEY);
    expect(await store.has("openai")).toBe(true);
    expect((await store.get("openai"))?.reveal()).toBe(KEY);
    await store.delete("openai");
    expect(await store.has("openai")).toBe(false);
  });
});
