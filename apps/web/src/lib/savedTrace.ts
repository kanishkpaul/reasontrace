import { readTrace } from "@reasontrace/analysis";
import type { ReasonTrace } from "@reasontrace/format";

const KEY = "reasontrace_saved_trace";

/**
 * The trace saved in this browser, read through the same reader as an
 * imported file. An unreadable save is removed so it can't fail every load.
 * Storage itself can be unavailable (private windows, blocked site data), in
 * which case there is no saved trace.
 */
export function loadSavedTrace(): ReasonTrace | null {
  let saved: string | null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!saved) return null;
  let value: unknown;
  try {
    value = JSON.parse(saved);
  } catch {
    value = undefined;
  }
  const { trace } = readTrace(value);
  if (!trace) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Storage became unavailable between the read and the removal; the
      // unreadable save stays and is skipped again next time.
    }
  }
  return trace;
}

/**
 * Saves the trace in this browser.
 *
 * @returns false when the browser refused, for example because the trace is
 * over the storage quota.
 */
export function saveTrace(trace: ReasonTrace): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(trace));
    return true;
  } catch {
    return false;
  }
}
