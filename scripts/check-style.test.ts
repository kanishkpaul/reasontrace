import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const dirs: string[] = [];

function dir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rt-check-style-"));
  dirs.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

const run = (script: string, arg: string) => spawnSync(process.execPath, [join(import.meta.dirname, script), arg], { encoding: "utf8" });

afterEach(() => {
  for (const root of dirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-contrast", () => {
  test("passes when every text colour reaches AA on every ground", () => {
    const root = dir({ "tokens.css": ":root { --ink-1: #e4e8e1; --ink-2: #a3ada4; --bg-0: #050607; --bg-1: #182024; }" });
    expect(run("check-contrast.mjs", join(root, "tokens.css")).status).toBe(0);
  });

  test("names the pair that falls short", () => {
    const root = dir({ "tokens.css": ":root { --ink-1: #e4e8e1; --ink-dim: #444444; --bg-0: #050607; }" });
    const result = run("check-contrast.mjs", join(root, "tokens.css"));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^--ink-dim on --bg-0: \d\.\d\d:1, under 4\.5:1/);
  });

  test("the viewer's tokens pass", () => {
    expect(run("check-contrast.mjs", join(import.meta.dirname, "../apps/web/src/styles/tokens.css")).status).toBe(0);
  });
});

describe("check-motion", () => {
  test("allows motion inside a no-preference block, and turning it off anywhere", () => {
    const css = [
      "@media (prefers-reduced-motion: no-preference) {",
      "  .a { animation: blink 1s infinite; transition: color 0.2s; }",
      "  @keyframes blink { 50% { opacity: 0; } }",
      "}",
      ".b { animation: none; }",
    ].join("\n");
    expect(run("check-motion.mjs", dir({ "a.css": css })).status).toBe(0);
  });

  test.each([
    ["an animation", ".a { color: red;\n  animation: blink 1s infinite; }"],
    ["a transition", ".a {\n  transition: opacity 0.2s; }"],
    ["motion under the reduce query", "@media (prefers-reduced-motion: reduce) {\n  .a { animation-name: blink; } }"],
  ])("rejects %s outside a no-preference block, with its line", (_name, css) => {
    const result = run("check-motion.mjs", dir({ "a.css": css }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("a.css:2:");
  });

  test("the viewer passes", () => {
    expect(run("check-motion.mjs", join(import.meta.dirname, "../apps/web/src")).status).toBe(0);
  });
});
