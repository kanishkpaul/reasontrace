#!/usr/bin/env node
// Holds the viewer to its own tokens (apps/web/STYLE.md): colours are written
// only in styles/tokens.css, every custom property used is one the viewer
// defines, and nothing comes from the old design kit in design/.
//
// Usage: node scripts/check-colours.mjs [directory]   (default: apps/web/src)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const TOKENS = join("styles", "tokens.css");
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, "hex colour"],
  [/\b(?:rgba?|hsla?|oklch|lab|lch)\(/, "colour function"],
  [/["'][^"']*\bdesign\//, "import from design/"],
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
const sources = files(root).map((path) => ({ path, name: relative(root, path), text: readFileSync(path, "utf8") }));
// A property is defined by a CSS declaration, or by a style object in a component ("--fill": …).
const defined = new Set(sources.flatMap(({ text }) => [...text.matchAll(/(?:^|[\s{;"'])(--[\w-]+)["']?\s*:/g)].map((m) => m[1])));

const problems = [];
for (const { path, name, text } of sources) {
  text.split("\n").forEach((line, i) => {
    const at = `${relative(process.cwd(), path)}:${i + 1}`;
    if (name !== TOKENS) {
      for (const [pattern, what] of RULES) {
        const match = line.match(pattern);
        if (match) problems.push(`${at}: ${what} "${match[0]}"`);
      }
    } else if (/design\//.test(line)) {
      problems.push(`${at}: import from design/`);
    }
    for (const [, property] of line.matchAll(/var\((--[\w-]+)/g)) {
      if (!defined.has(property)) problems.push(`${at}: ${property} is not one of the viewer's tokens`);
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("error: colours come from apps/web/src/styles/tokens.css (apps/web/STYLE.md)");
  process.exit(1);
}
console.log(`no ad-hoc colours or unknown tokens in ${root}`);
