#!/usr/bin/env node
// With prefers-reduced-motion set, nothing in the viewer may blink or move.
// Every animation and transition must sit inside a
// `@media (prefers-reduced-motion: no-preference)` block; outside one, only
// `animation: none` and `transition: none` are allowed.
//
// Usage: node scripts/check-motion.mjs [directory]   (default: apps/web/src)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return extname(name) === ".css" ? [path] : [];
  });
}

/** Line numbers of motion declarations outside a no-preference block. */
function moving(css) {
  const found = [];
  // Each open brace pushes whether its block allows motion.
  const allowed = [false];
  let line = 1;
  let statement = "";
  for (const char of css) {
    if (char === "\n") line++;
    if (char === "{") {
      allowed.push(allowed.at(-1) || /@media[^{]*prefers-reduced-motion:\s*no-preference/.test(statement));
      statement = "";
    } else if (char === "}" || char === ";") {
      if (!allowed.at(-1) && /^\s*(animation|transition)(-[\w-]+)?\s*:(?!\s*none\s*$)/.test(statement)) found.push(line);
      if (char === "}") allowed.pop();
      statement = "";
    } else {
      statement += char;
    }
  }
  return found;
}

const root = process.argv[2] ?? "apps/web/src";
const problems = files(root).flatMap((path) => moving(readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))).map((line) => `${relative(process.cwd(), path)}:${line}: motion outside @media (prefers-reduced-motion: no-preference)`));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`nothing moves under prefers-reduced-motion in ${root}`);
