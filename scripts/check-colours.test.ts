import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const script = join(import.meta.dirname, "check-colours.mjs");
const roots: string[] = [];

function source(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rt-check-colours-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const check = (root: string) => spawnSync(process.execPath, [script, root], { encoding: "utf8" });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-colours", () => {
  test("passes token colours", () => {
    expect(check(source({ "a.css": ".x { color: var(--ui-text-1); }", "b.tsx": '<p className="bg-card text-ink-2" />' })).status).toBe(0);
  });

  test.each([
    ["a hex value", "a.css", ".x { color: #3b82f6; }"],
    ["an rgba literal", "a.css", ".x { background: rgba(0, 0, 0, 0.5); }"],
    ["a seed token", "a.css", ".x { color: var(--seed-ink); }"],
    ["a Tailwind palette class", "b.tsx", '<p className="text-rose-400" />'],
  ])("rejects %s", (_name, file, text) => {
    const result = check(source({ [file]: text }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${file}:1:`);
  });

  test("ignores sample data and tests", () => {
    expect(check(source({ "data/samples.ts": '"order #4812"', "x.test.tsx": '"#fff"' })).status).toBe(0);
  });

  test("the viewer itself passes", () => {
    expect(check(join(import.meta.dirname, "../apps/web/src")).status).toBe(0);
  });
});
