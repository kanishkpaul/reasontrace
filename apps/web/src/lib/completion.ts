import type { CompletionState, Tier } from "@reasontrace/format";

/**
 * How each ending is shown: a boot-log tag and a word. A timeout, a refusal
 * and an empty answer are different things and never share a look, with or
 * without colour (docs/CHARTER.md §3, rule 5).
 */
export const COMPLETION: Record<CompletionState, { tag: string; word: string }> = {
  running: { tag: "[ .. ]", word: "running" },
  complete: { tag: "[ OK ]", word: "complete" },
  truncated: { tag: "[TRNC]", word: "truncated" },
  refused: { tag: "[DENY]", word: "refused" },
  error: { tag: "[FAIL]", word: "error" },
  timeout: { tag: "[TIME]", word: "timed out" },
  aborted: { tag: "[STOP]", word: "stopped" },
};

export const TIER: Record<Tier, string> = {
  full: "full",
  local: "local server",
  open: "open API",
  frontier: "frontier API",
  symbolic: "symbolic",
};
