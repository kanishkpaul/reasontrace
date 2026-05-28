import { create } from "zustand";
import type { ReasonTrace, EventType } from "./types";
import { sampleTraces } from "./data/sampleTraces";
import { parseTrace } from "./lib/parseTrace";

interface StoreFilters {
  eventTypes: Record<EventType, boolean>;
  searchQuery: string;
}

interface StoreSettings {
  showTemporalEdges: boolean;
  highlightFailures: boolean;
}

interface TraceState {
  // Data
  currentTrace: ReasonTrace | null;
  selectedNodeId: string | null;
  newestNodeId: string | null;
  
  // Playback / Timeline Replay
  currentStep: number;
  maxStep: number;
  isPlaying: boolean;
  playbackSpeed: number; // in ms
  playbackIntervalId: any | null;

  // Filters & Settings
  filters: StoreFilters;
  settings: StoreSettings;
  
  // Actions
  setTrace: (trace: ReasonTrace) => void;
  loadSampleTrace: (key: string) => void;
  parseAndSetTrace: (text: string) => string | undefined; // returns error message if any
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
  },
  searchQuery: "",
};

const defaultSettings: StoreSettings = {
  showTemporalEdges: true,
  highlightFailures: true,
};

export const useTraceStore = create<TraceState>((set, get) => ({
  currentTrace: null,
  selectedNodeId: null,
  newestNodeId: null,
  
  currentStep: 0,
  maxStep: 0,
  isPlaying: false,
  playbackSpeed: 1500,
  playbackIntervalId: null,

  filters: { ...defaultFilters },
  settings: { ...defaultSettings },

  setTrace: (trace) => {
    get().stopPlayback();
    
    // Sort events to find the max step
    const sorted = [...trace.events].sort((a, b) => a.step - b.step);
    const maxStep = sorted.length > 0 ? sorted[sorted.length - 1].step : 0;
    
    // Find final answer step or just the last step to default select
    const finalEvent = sorted.find(e => e.type === "final_answer") || sorted[sorted.length - 1];

    set({
      currentTrace: trace,
      currentStep: maxStep,
      maxStep,
      newestNodeId: sorted.length > 0 ? sorted[sorted.length - 1].id : null,
      selectedNodeId: finalEvent ? finalEvent.id : null,
    });
  },

  loadSampleTrace: (key) => {
    const trace = sampleTraces[key];
    if (trace) {
      get().setTrace(trace);
    }
  },

  parseAndSetTrace: (text) => {
    const { trace, error } = parseTrace(text);
    if (trace.events.length > 0) {
      get().setTrace(trace);
      return error; // Return parsing warning if any
    }
    return error || "Could not parse any reasoning events.";
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id });
  },

  setCurrentStep: (step) => {
    const { currentTrace, maxStep } = get();
    if (!currentTrace) return;
    
    const validatedStep = Math.max(1, Math.min(step, maxStep));
    
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
    if (validatedStep === maxStep) {
      get().stopPlayback();
    }
  },

  stepForward: () => {
    const { currentStep, maxStep } = get();
    if (currentStep < maxStep) {
      get().setCurrentStep(currentStep + 1);
    }
  },

  stepBackward: () => {
    const { currentStep } = get();
    if (currentStep > 1) {
      get().setCurrentStep(currentStep - 1);
    }
  },

  startPlayback: () => {
    const { isPlaying, currentStep, maxStep, playbackSpeed } = get();
    if (isPlaying) return;

    // If we are at the end, start over from 1
    if (currentStep === maxStep) {
      get().setCurrentStep(1);
    }

    const intervalId = setInterval(() => {
      const state = get();
      if (state.currentStep < state.maxStep) {
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
    get().setCurrentStep(1);
  },

  revealAll: () => {
    const { maxStep } = get();
    get().setCurrentStep(maxStep);
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
