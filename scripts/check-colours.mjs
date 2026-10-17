#!/usr/bin/env node
// Rejects colours that bypass the design tokens in the viewer's source
// (AGENTS.md, Design): hex values, rgb()/hsl() literals, --seed-* tokens and
// Tailwind's built-in palette classes. Colours come from --ui-* tokens or the
// kit's Tailwind bridge (bg-card, text-ink-2, …).
//
// Usage: node scripts/check-colours.mjs [directory]   (default: apps/web/src)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, "hex colour"],
  [/\b(?:rgba?|hsla?)\(/, "colour function"],
  [/--seed-/, "seed token"],
  [new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|decoration|divide|placeholder|accent|caret|shadow)-(?:${PALETTE})(?:-\\d{2,3})?\\b`), "Tailwind palette class"],
];
// Sample traces are data; "order #4812" in their text is not a colour.
const SKIP = new Set(["data"]);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : files(path);
    return [".ts", ".tsx", ".css"].includes(extname(name)) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = process.argv[2] ?? "apps/web/src";
const problems = [];
for (const file of files(root)) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const [pattern, what] of RULES) {
      const match = line.match(pattern);
      if (match) problems.push(`${relative(process.cwd(), file)}:${i + 1}: ${what} "${match[0]}"`);
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("error: use the design tokens for colour (design/system/COLOR.md)");
  process.exit(1);
}
console.log(`no ad-hoc colours in ${root}`);
