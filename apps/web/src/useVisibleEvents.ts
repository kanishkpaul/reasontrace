import type { TraceEvent } from "@reasontrace/format";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTraceStore } from "./store";

/** The open trace's events up to the replay step that pass the type and search filters. */
export function useVisibleEvents(): TraceEvent[] {
  const { trace, currentStep, filters } = useTraceStore(useShallow((s) => ({
    trace: s.currentTrace,
    currentStep: s.currentStep,
    filters: s.filters,
  })));
  return useMemo(() => {
    if (!trace) return [];
    const query = filters.searchQuery.toLowerCase();
    return trace.events.filter((event) => {
      if (event.step > currentStep || !filters.eventTypes[event.type]) return false;
      if (!query) return true;
      return [event.content, event.tool ?? "", event.type].some((text) => text.toLowerCase().includes(query));
    });
  }, [trace, currentStep, filters]);
}
