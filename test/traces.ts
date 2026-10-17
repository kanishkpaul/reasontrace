import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTrace } from "@reasontrace/analysis";
import type { ReasonTrace } from "@reasontrace/format";

/** Reads a file from fixtures/traces as text. */
export function traceFixture(name: string): string {
  // Not `new URL(…, import.meta.url)`: under jsdom, Vite serves this file from
  // outside the web app's root as a `/@fs/` URL, which is not a file URL.
  return readFileSync(join(import.meta.dirname, "../fixtures/traces", name), "utf8");
}

/**
 * Parses trace text that a test expects to be readable.
 *
 * @throws {Error} with the parser's errors if the text does not parse.
 */
export function parsed(text: string): ReasonTrace {
  const { trace, errors } = parseTrace(text);
  if (!trace) throw new Error(`expected a trace, got errors: ${errors.join(" ")}`);
  return trace;
}
