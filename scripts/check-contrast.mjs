#!/usr/bin/env node
// Checks every text colour against every ground in the viewer's tokens for
// WCAG AA contrast (4.5:1, the bar for normal-size text). Text colours are
// the `--ink-*` tokens and grounds the `--bg-*` tokens, all written as hex.
//
// Usage: node scripts/check-contrast.mjs [tokens.css]   (default: apps/web/src/styles/tokens.css)
import { readFileSync } from "node:fs";

const AA = 4.5;

/** Relative luminance of a #rrggbb colour (WCAG 2.2). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const file = process.argv[2] ?? "apps/web/src/styles/tokens.css";
const tokens = [...readFileSync(file, "utf8").matchAll(/(--(?:ink|bg)-[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, name, hex]) => ({ name, hex }));
const inks = tokens.filter((t) => t.name.startsWith("--ink-"));
const grounds = tokens.filter((t) => t.name.startsWith("--bg-"));
if (!inks.length || !grounds.length) {
  console.error(`error: no --ink-* or --bg-* hex tokens in ${file}`);
  process.exit(1);
}

const failing = inks.flatMap((ink) => grounds.map((bg) => ({ ink, bg, ratio: contrast(ink.hex, bg.hex) }))).filter((p) => p.ratio < AA);
if (failing.length) {
  for (const { ink, bg, ratio } of failing) console.error(`${ink.name} on ${bg.name}: ${ratio.toFixed(2)}:1, under ${AA}:1`);
  process.exit(1);
}
console.log(`${inks.length} text colours × ${grounds.length} grounds all reach ${AA}:1`);
