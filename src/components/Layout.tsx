import React, { useState, useEffect } from "react";
import { useTraceStore } from "../store";
import { TraceInput } from "./TraceInput";
import { SampleTracePicker } from "./SampleTracePicker";
import { EventFilters } from "./EventFilters";
import { ReasoningGraph } from "./ReasoningGraph";
import { NodeInspector } from "./NodeInspector";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { TimelineControls } from "./TimelineControls";
import { computeDiagnostics } from "../lib/diagnostics";
import { 
  BrainCircuit, 
  Download, 
  Save, 
  Info,
  Sparkles
} from "lucide-react";

export const Layout: React.FC = () => {
  const { currentTrace, setTrace } = useTraceStore();
  const [activeRightTab, setActiveRightTab] = useState<"inspector" | "diagnosis">("inspector");

  // Local storage persistence
  useEffect(() => {
    // Attempt to load trace from localStorage on mount
    const saved = localStorage.getItem("reasontrace_saved_trace");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.events)) {
          setTrace(parsed);
        }
      } catch (e) {
        // Silently ignore
      }
    } else {
      // Default load ARC-AGI solver sample on first visit
      useTraceStore.getState().loadSampleTrace("arc-agi-solver");
    }
  }, [setTrace]);

  // Auto-save trace to localStorage whenever it changes
  useEffect(() => {
    if (currentTrace && currentTrace.events.length > 0) {
      localStorage.setItem("reasontrace_saved_trace", JSON.stringify(currentTrace));
    }
  }, [currentTrace]);

  // Compute diagnostics to show warnings count in tab badge
  const warningCount = React.useMemo(() => {
    if (!currentTrace) return 0;
    const diag = computeDiagnostics(currentTrace);
    return diag.warnings.length;
  }, [currentTrace]);

  // Export current trace as JSON
  const exportTraceAsJson = () => {
    if (!currentTrace) return;
    const dataStr = JSON.stringify(currentTrace, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${currentTrace.title.replace(/\s+/g, "_")}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick save to localStorage
  const handleQuickSave = () => {
    if (!currentTrace) return;
    localStorage.setItem("reasontrace_saved_trace", JSON.stringify(currentTrace));
    alert("Trace saved to browser cache.");
  };

  return (
    <div className="flex flex-col h-screen bg-cyber-bg text-cyber-text font-sans select-none overflow-hidden">
      {/* 1. Header Bar */}
      <header className="h-14 border-b border-cyber-border bg-cyber-card flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-lg text-white shadow-cyan-glow">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent tracking-wide">
                ReasonTrace
              </h1>
              <span className="bg-blue-950 border border-blue-500/30 text-blue-400 text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-bold tracking-wider">
                MVP
              </span>
            </div>
            <p className="text-[10px] text-cyber-muted font-sans leading-tight">
              Cognitive Trajectory Debugger & Visualizer
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center space-x-2">
          {currentTrace && (
            <>
              <button
                onClick={handleQuickSave}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs text-cyber-muted hover:text-cyber-text bg-cyber-bg hover:bg-cyber-hover border border-cyber-border rounded-lg transition-all"
                title="Save current trace to browser cache"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save Cache</span>
              </button>
              <button
                onClick={exportTraceAsJson}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs text-cyber-muted hover:text-cyber-text bg-cyber-bg hover:bg-cyber-hover border border-cyber-border rounded-lg transition-all"
                title="Download trace as JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export JSON</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* 2. Main Layout Container */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4 bg-cyber-bg relative z-10">
        
        {/* LEFT PANEL: Inputs, Samples, Toggles */}
        <section className="w-[320px] shrink-0 flex flex-col space-y-4 overflow-y-auto pr-1">
          <TraceInput />
          <SampleTracePicker />
          <EventFilters />
        </section>

        {/* CENTER PANEL: Flow Graph Canvas & Controls */}
        <section className="flex-1 flex flex-col space-y-4 overflow-hidden">
          <div className="flex-1 min-h-0 relative">
            <ReasoningGraph />
          </div>
          
          {/* Timeline playback controls overlay at the bottom of center */}
          <div className="shrink-0">
            <TimelineControls />
          </div>
        </section>

        {/* RIGHT PANEL: Inspector & Diagnosis */}
        <section className="w-[360px] shrink-0 flex flex-col overflow-hidden">
          {/* Sidebar Tab Selectors */}
          <div className="flex border border-cyber-border bg-cyber-card rounded-t-xl overflow-hidden shrink-0 border-b-0">
            <button
              onClick={() => setActiveRightTab("inspector")}
              className={`flex-1 py-2.5 text-xs font-bold tracking-wider uppercase border-b-2 flex items-center justify-center space-x-1.5 transition-all
                ${activeRightTab === "inspector"
                  ? "bg-transparent border-cyber-primary text-cyber-primary"
                  : "bg-cyber-bg/30 border-transparent text-cyber-muted hover:text-cyber-text"
                }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Inspector</span>
            </button>
            
            <button
              onClick={() => setActiveRightTab("diagnosis")}
              className={`flex-1 py-2.5 text-xs font-bold tracking-wider uppercase border-b-2 flex items-center justify-center space-x-1.5 transition-all relative
                ${activeRightTab === "diagnosis"
                  ? "bg-transparent border-cyber-primary text-cyber-primary"
                  : "bg-cyber-bg/30 border-transparent text-cyber-muted hover:text-cyber-text"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Diagnosis</span>
              {warningCount > 0 && (
                <span className="absolute right-3 top-2 bg-rose-500 border border-cyber-card text-[9px] font-bold text-white w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {warningCount}
                </span>
              )}
            </button>
          </div>

          {/* Sidebar Tab Content panels */}
          <div className="flex-1 min-h-0">
            {activeRightTab === "inspector" ? (
              <NodeInspector />
            ) : (
              <DiagnosisPanel />
            )}
          </div>
        </section>

      </main>
    </div>
  );
};
