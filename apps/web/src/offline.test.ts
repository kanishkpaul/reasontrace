import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("offline", () => {
  test("I9: the page loads nothing from another host", () => {
    const html = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");
    expect(html.match(/\b(?:href|src)="(?:https?:)?\/\/[^"]*"/g) ?? []).toEqual([]);
  });
});
