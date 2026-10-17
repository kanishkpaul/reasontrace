#!/usr/bin/env node
// Enforces the dependency rules in docs/ARCHITECTURE.md §2 over every npm
// workspace. Rule 3 (capability packages never depend on each other) is what
// makes a capability removable, so an edge outside these rules fails the build.
//
// Usage: node scripts/check-deps.mjs [workspace root]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const KINDS = [
  ["packages/format", "format"],
  ["packages/analysis", "analysis"],
  ["packages/core", "core"],
  ["packages/keys", "keys"],
  ["packages/sources/", "source"],
  ["packages/engines/", "engine"],
  ["packages/sidecar", "sidecar"],
  ["apps/server", "server"],
  ["apps/web", "web"],
];

const ALLOWED = {
  format: [],
  analysis: ["format"],
  core: ["format"],
  keys: ["format", "core"],
  source: ["format", "core", "keys"],
  engine: ["format", "core"],
  sidecar: ["format", "core"],
  server: ["format", "analysis", "core", "keys", "source", "engine", "sidecar"],
  web: ["format", "analysis"],
};

function kindOf(path) {
  const match = KINDS.find(([prefix]) => (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix));
  return match?.[1];
}

function workspaceDirs(root, patterns) {
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith("/*")) return [join(root, pattern)];
    const parent = join(root, pattern.slice(0, -2));
    if (!existsSync(parent)) return [];
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  }).filter((dir) => existsSync(join(dir, "package.json")));
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const root = process.argv[2] ?? process.cwd();
const workspaces = workspaceDirs(root, readJson(join(root, "package.json")).workspaces ?? []).map((dir) => {
  const manifest = readJson(join(dir, "package.json"));
  const path = relative(root, dir).split("\\").join("/");
  return { path, name: manifest.name, kind: kindOf(path), manifest };
});
const byName = new Map(workspaces.map((ws) => [ws.name, ws]));

const problems = [];
for (const ws of workspaces) {
  if (!ws.kind) {
    problems.push(`${ws.path}: not covered by the dependency rules; add it to scripts/check-deps.mjs and docs/ARCHITECTURE.md §2`);
    continue;
  }
  const { dependencies = {}, devDependencies = {}, peerDependencies = {} } = ws.manifest;
  for (const dep of Object.keys({ ...dependencies, ...devDependencies, ...peerDependencies })) {
    const target = byName.get(dep);
    if (target && !ALLOWED[ws.kind].includes(target.kind)) {
      problems.push(`${ws.path} (${ws.kind}) depends on ${target.path} (${target.kind})`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("error: dependency rules broken (docs/ARCHITECTURE.md §2)");
  process.exit(1);
}
console.log(`dependency rules hold across ${workspaces.length} workspaces`);
