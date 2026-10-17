import type { CompletionState, Tier } from "@reasontrace/format";

/**
 * How each ending is shown. A timeout, a refusal and an empty answer are
 * different things and never share a look (docs/CHARTER.md §3, rule 5).
 */
export const COMPLETION: Record<CompletionState, { word: string; dot: string }> = {
  running: { word: "running", dot: "dot--live" },
  complete: { word: "complete", dot: "dot--ok" },
  truncated: { word: "truncated", dot: "dot--warn" },
  refused: { word: "refused", dot: "dot--warn" },
  error: { word: "error", dot: "dot--error" },
  timeout: { word: "timed out", dot: "dot--error" },
  aborted: { word: "stopped", dot: "" },
};

export const TIER: Record<Tier, string> = {
  full: "full",
  local: "local server",
  open: "open API",
  frontier: "frontier API",
  symbolic: "symbolic",
};
