import { describe, expect, test } from "vitest";
import { parsed } from "../../../test/traces";
import { useTraceStore } from "./store";

describe("trace store", () => {
  test("S1: opening a trace clears the previous trace's filters", () => {
    const store = useTraceStore.getState();
    store.setSearchQuery("refund");
    store.setEventTypeFilter("action", false);
    store.setTrace(parsed("Thought: a\nAction: b()"));
    const { filters } = useTraceStore.getState();
    expect(filters.searchQuery).toBe("");
    expect(filters.eventTypes.action).toBe(true);
  });
});
