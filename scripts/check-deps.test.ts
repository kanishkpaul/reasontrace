import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const script = join(import.meta.dirname, "check-deps.mjs");
const roots: string[] = [];

/** Builds a throwaway workspace from `{ "path/to/pkg": { name, dependencies } }`. */
function workspace(packages: Record<string, { name: string; dependencies?: Record<string, string> }>): string {
  const root = mkdtempSync(join(tmpdir(), "rt-check-deps-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({
    workspaces: ["packages/*", "packages/sources/*", "apps/*"],
  }));
  for (const [path, manifest] of Object.entries(packages)) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "package.json"), JSON.stringify(manifest));
  }
  return root;
}

const check = (root: string) => spawnSync(process.execPath, [script, root], { encoding: "utf8" });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-deps", () => {
  test("passes when every edge follows the rules", () => {
    const result = check(workspace({
      "packages/format": { name: "@rt/format" },
      "packages/core": { name: "@rt/core", dependencies: { "@rt/format": "*" } },
      "packages/sources/openai": { name: "@rt/source-openai", dependencies: { "@rt/core": "*" } },
      "apps/server": { name: "@rt/server", dependencies: { "@rt/source-openai": "*" } },
    }));
    expect(result.status).toBe(0);
  });

  test("fails when one capability package depends on another", () => {
    const result = check(workspace({
      "packages/core": { name: "@rt/core" },
      "packages/sources/openai": { name: "@rt/source-openai" },
      "packages/sources/anthropic": { name: "@rt/source-anthropic", dependencies: { "@rt/source-openai": "*" } },
    }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/sources/anthropic (source) depends on packages/sources/openai (source)");
  });

  test("fails when the viewer imports a capability package", () => {
    const result = check(workspace({
      "packages/keys": { name: "@rt/keys" },
      "apps/web": { name: "@rt/web", dependencies: { "@rt/keys": "*" } },
    }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("apps/web (web) depends on packages/keys (keys)");
  });

  test("fails on a workspace the rules do not cover", () => {
    const result = check(workspace({ "packages/utils": { name: "@rt/utils" } }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/utils: not covered by the dependency rules");
  });

  test("the repository itself follows the rules", () => {
    expect(check(join(import.meta.dirname, "..")).status).toBe(0);
  });
});
