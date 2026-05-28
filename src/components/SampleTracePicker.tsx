import React from "react";
import { useTraceStore } from "../store";
import { sampleTraces } from "../data/sampleTraces";
import { Library, HelpCircle } from "lucide-react";

export const SampleTracePicker: React.FC = () => {
  const { currentTrace, loadSampleTrace } = useTraceStore();

  const sampleDescriptions: Record<string, string> = {
    "arc-agi-solver": "ARC-AGI symmetry hypothesis failure and object count recovery.",
    "code-debugger": "Standard software parser debugging. Explains loop index bounds errors.",
    "rope-scaling": "AI Model position embeddings. Scaling context limits through YaRN.",
    "flight-booker": "Browser execution modal popup overlay blocker trap loops.",
    "database-migration": "DB schema creation shell loop and migration drops script."
  };

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-4 space-y-3 shadow-cyber-glow">
      <div className="flex items-center space-x-2 text-cyber-muted pb-1.5 border-b border-cyber-border">
        <Library className="w-4 h-4" />
        <h3 className="text-sm font-bold text-cyber-text tracking-wide uppercase">
          Sample Trajectories
        </h3>
      </div>

      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {Object.entries(sampleTraces).map(([key, trace]) => {
          const isActive = currentTrace?.title === trace.title;
          const desc = sampleDescriptions[key] || "Machine reasoning evaluation trace logs.";

          return (
            <button
              key={key}
              onClick={() => loadSampleTrace(key)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all flex flex-col space-y-1 group
                ${isActive 
                  ? "bg-blue-950/20 border-cyber-primary text-cyber-text shadow-cyan-glow" 
                  : "bg-transparent border-cyber-border text-cyber-muted hover:border-cyber-hover hover:text-cyber-text"
                }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-xs font-bold truncate group-hover:text-cyber-primary transition-colors ${isActive ? "text-cyber-primary" : "text-cyber-text"}`}>
                  {trace.title}
                </span>
                <span className="text-[9px] font-mono bg-cyber-bg border border-cyber-border px-1.5 py-0.2 rounded-full scale-90 text-cyber-muted font-semibold">
                  {trace.events.length} steps
                </span>
              </div>
              <span className="text-[10px] text-cyber-muted leading-relaxed font-sans line-clamp-2">
                {desc}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* Help tooltip */}
      <div className="bg-cyber-bg/40 border border-cyber-border p-2 rounded-lg flex items-start space-x-1.5">
        <HelpCircle className="w-3.5 h-3.5 text-cyber-muted shrink-0 mt-0.5" />
        <p className="text-[9px] text-cyber-muted leading-normal">
          Select an example to populate the workspace. Toggle playback scrubbing at the bottom to inspect trace execution timing.
        </p>
      </div>
    </div>
  );
};
