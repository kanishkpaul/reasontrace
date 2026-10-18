import { create } from "zustand";
import type { Attachment, ReasonTrace, EventType, Run, RunManifest } from "@reasontrace/format";
import { sampleTraces } from "./data/sampleTraces";
import { parseTrace } from "@reasontrace/analysis";
import { saveOpenRunId, saveTrace } from "./lib/savedTrace";
import type { ParseResult } from "@reasontrace/analysis";

interface StoreFilters {
  eventTypes: Record<EventType, boolean>;
  searchQuery: string;
}

interface StoreSettings {
  showTemporalEdges: boolean;
  highlightFailures: boolean;
}

/** A run as it streams in, before its directory is read back. */
export interface LiveRun {
  title: string;
  reasoning: string;
  output: string;
}

interface TraceState {
  // Data
  currentTrace: ReasonTrace | null;
  /** The open trace's run, when it came from the server rather than a file. */
  run: { manifest: RunManifest; attachments: Attachment[] } | null;
  live: LiveRun | null;
  /** False when the browser refused to keep the open trace (quota, blocked storage). */
  savedInBrowser: boolean;
  selectedNodeId: string | null;
  newestNodeId: string | null;
  
  // Playback / Timeline Replay. Replay moves through the trace's own step
  // values, which can be sparse or timestamps, never by adding 1 (T3).
  steps: number[];
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number; // in ms
  playbackIntervalId: ReturnType<typeof setInterval> | null;

  // Filters & Settings
  filters: StoreFilters;
  settings: StoreSettings;
  
  // Actions
  setTrace: (trace: ReasonTrace) => void;
  openRun: (run: Run) => void;
  setLive: (live: LiveRun | null) => void;
  loadSampleTrace: (key: string) => void;
  parseAndSetTrace: (text: string) => ParseResult;
  setSelectedNodeId: (id: string | null) => void;
  
  // Playback Actions
  setCurrentStep: (step: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  startPlayback: () => void;
  stopPlayback: () => void;
  togglePlay: () => void;
  setPlaybackSpeed: (speed: number) => void;
  resetReplay: () => void;
  revealAll: () => void;

  // Filters & Settings Actions
  setEventTypeFilter: (type: EventType, visible: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSetting: (key: keyof StoreSettings) => void;
  resetFilters: () => void;
}

const defaultFilters: StoreFilters = {
  eventTypes: {
    hypothesis: true,
    action: true,
    observation: true,
    belief_update: true,
    failure: true,
    decision: true,
    final_answer: true,
    reasoning: true,
    activation: true,
  },
  searchQuery: "",
};

const defaultSettings: StoreSettings = {
  showTemporalEdges: true,
  highlightFailures: true,
};

export const useTraceStore = create<TraceState>((set, get) => ({
  currentTrace: null,
  run: null,
  live: null,
  savedInBrowser: true,
  selectedNodeId: null,
  newestNodeId: null,
  
  steps: [],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 1500,
  playbackIntervalId: null,

  filters: { ...defaultFilters },
  settings: { ...defaultSettings },

  setTrace: (trace) => {
    get().stopPlayback();
    saveOpenRunId(null);
    
    const sorted = [...trace.events].sort((a, b) => a.step - b.step);
    const steps = [...new Set(sorted.map(e => e.step))];

    // Find final answer step or just the last step to default select
    const finalEvent = sorted.find(e => e.type === "final_answer") || sorted[sorted.length - 1];

    // Filters belong to the trace they were set on; a stale search could
    // hide every event of the next one (S1).
    set({
      filters: { ...defaultFilters },
      currentTrace: trace,
      run: null,
      savedInBrowser: trace.events.length === 0 || saveTrace(trace),
      steps,
      currentStep: steps.at(-1) ?? 0,
      newestNodeId: sorted.length > 0 ? sorted[sorted.length - 1].id : null,
      selectedNodeId: finalEvent ? finalEvent.id : null,
    });
  },

  openRun: ({ manifest, trace, attachments }) => {
    get().setTrace(trace);
    set({ run: { manifest, attachments } });
    saveOpenRunId(manifest.id);
  },

  setLive: (live) => set({ live }),

  loadSampleTrace: (key) => {
    const trace = sampleTraces[key];
    if (trace) {
      get().setTrace(trace);
    }
  },

  parseAndSetTrace: (text) => {
    const result = parseTrace(text);
    if (result.trace) get().setTrace(result.trace);
    return result;
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id });
  },

  setCurrentStep: (step) => {
    const { currentTrace, steps } = get();
    if (!currentTrace || steps.length === 0) return;

    const validatedStep = steps.findLast(s => s <= step) ?? steps[0];

    // Find the latest node revealed up to this step
    const stepEvents = currentTrace.events.filter(e => e.step <= validatedStep);
    const newest = stepEvents.length > 0 ? stepEvents[stepEvents.length - 1] : null;

    set({
      currentStep: validatedStep,
      newestNodeId: newest ? newest.id : null,
      // Auto select the newest node on step change
      selectedNodeId: newest ? newest.id : null,
    });

    // If we hit the end, stop playing
    if (validatedStep === steps.at(-1)) {
      get().stopPlayback();
    }
  },

  stepForward: () => {
    const { currentStep, steps } = get();
    const next = steps.find(s => s > currentStep);
    if (next !== undefined) get().setCurrentStep(next);
  },

  stepBackward: () => {
    const { currentStep, steps } = get();
    const previous = steps.findLast(s => s < currentStep);
    if (previous !== undefined) get().setCurrentStep(previous);
  },

  startPlayback: () => {
    const { isPlaying, currentStep, steps, playbackSpeed } = get();
    if (isPlaying) return;

    if (currentStep === steps.at(-1)) {
      get().setCurrentStep(steps[0]);
    }

    const intervalId = setInterval(() => {
      const state = get();
      if (state.currentStep !== state.steps.at(-1)) {
        state.stepForward();
      } else {
        state.stopPlayback();
      }
    }, playbackSpeed);

    set({
      isPlaying: true,
      playbackIntervalId: intervalId,
    });
  },

  stopPlayback: () => {
    const { playbackIntervalId } = get();
    if (playbackIntervalId) {
      clearInterval(playbackIntervalId);
    }
    set({
      isPlaying: false,
      playbackIntervalId: null,
    });
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().stopPlayback();
    } else {
      get().startPlayback();
    }
  },

  setPlaybackSpeed: (speed) => {
    const { isPlaying } = get();
    set({ playbackSpeed: speed });
    if (isPlaying) {
      get().stopPlayback();
      get().startPlayback();
    }
  },

  resetReplay: () => {
    const { steps } = get();
    if (steps.length) get().setCurrentStep(steps[0]);
  },

  revealAll: () => {
    const { steps } = get();
    if (steps.length) get().setCurrentStep(steps[steps.length - 1]);
  },

  setEventTypeFilter: (type, visible) => {
    set((state) => ({
      filters: {
        ...state.filters,
        eventTypes: {
          ...state.filters.eventTypes,
          [type]: visible,
        },
      },
    }));
  },

  setSearchQuery: (query) => {
    set((state) => ({
      filters: {
        ...state.filters,
        searchQuery: query,
      },
    }));
  },

  toggleSetting: (key) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: !state.settings[key],
      },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },
}));
