// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { parsed } from "../../../../test/traces";
import { loadSavedTrace, saveTrace } from "./savedTrace";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("saved trace", () => {
  test("a saved trace loads back equal", () => {
    const trace = parsed("Thought: a\nAction: b()");
    expect(saveTrace(trace)).toBe(true);
    expect(loadSavedTrace()).toEqual(trace);
  });

  test("I5: an unreadable save is removed instead of loaded", () => {
    localStorage.setItem("reasontrace_saved_trace", '{"events":[null]}');
    expect(loadSavedTrace()).toBeNull();
    expect(localStorage.getItem("reasontrace_saved_trace")).toBeNull();
  });

  test("I6: a save the browser refuses reports failure instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveTrace(parsed("Thought: a"))).toBe(false);
  });
});
