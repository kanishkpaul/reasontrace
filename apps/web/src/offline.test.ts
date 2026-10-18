import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("offline", () => {
  test("I9: the page loads nothing from another host", () => {
    const html = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");
    expect(html.match(/\b(?:href|src)="(?:https?:)?\/\/[^"]*"/g) ?? []).toEqual([]);
  });

  test("no stylesheet loads a font or anything else from another host", () => {
    const sheets = readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      expect(readFileSync(join(import.meta.dirname, sheet), "utf8").match(/(?:url\(|@import)\s*["']?(?:https?:)?\/\/[^"')\s]*/g) ?? [], sheet).toEqual([]);
    }
  });

  test("the one face is bundled, not fetched", () => {
    const main = readFileSync(join(import.meta.dirname, "main.tsx"), "utf8");
    expect(main).toContain("@fontsource/jetbrains-mono/400.css");
  });
});
