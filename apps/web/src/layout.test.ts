import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/** Each rule in a stylesheet as its selectors and its declarations, nested at-rules flattened. */
function rules(css: string): { selectors: string[]; body: string }[] {
  const found: { selectors: string[]; body: string }[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    found.push({ selectors: match[1].split(",").map((s) => s.trim()), body: match[2] });
  }
  return found;
}

describe("layout", () => {
  test("every scrolling region is a containing block, so a visually hidden input in it cannot stretch the page", () => {
    const sheet = rules(readFileSync(join(import.meta.dirname, "index.css"), "utf8"));
    const positioned = new Set(sheet.filter((r) => /position:\s*(relative|absolute|fixed|sticky)/.test(r.body)).flatMap((r) => r.selectors));
    const scrolling = sheet.filter((r) => /overflow(-[xy])?:\s*(auto|scroll)/.test(r.body)).flatMap((r) => r.selectors);
    expect(scrolling.length).toBeGreaterThan(0);
    expect(scrolling.filter((s) => !positioned.has(s))).toEqual([]);
  });
});
