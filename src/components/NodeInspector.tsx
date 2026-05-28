import React, { useMemo, useState } from "react";
import { useTraceStore } from "../store";
import { typeConfigs } from "./CustomTraceNode";
import { Copy, Check, ArrowLeft, ArrowRight, Info } from "lucide-react";

export const NodeInspector: React.FC = () => {
  const { currentTrace, selectedNodeId, setSelectedNodeId } = useTraceStore();
  const [copied, setCopied] = useState(false);

  // 1. Find the selected event
  const selectedEvent = useMemo(() => {
    if (!currentTrace || !selectedNodeId) return null;
    return currentTrace.events.find(e => e.id === selectedNodeId) || null;
  }, [currentTrace, selectedNodeId]);

  // 2. Find parent events (predecessors)
  const parents = useMemo(() => {
    if (!currentTrace || !selectedEvent) return [];
    const parentIds = selectedEvent.links || [];
    return currentTrace.events.filter(e => parentIds.includes(e.id));
  }, [currentTrace, selectedEvent]);

  // 3. Find child events (successors)
  const children = useMemo(() => {
    if (!currentTrace || !selectedEvent) return [];
    return currentTrace.events.filter(e => e.links?.includes(selectedEvent.id));
  }, [currentTrace, selectedEvent]);

  // 4. Generate heuristic debug interpretation
  const debugInterpretation = useMemo(() => {
    if (!selectedEvent) return "";
    switch (selectedEvent.type) {
      case "hypothesis":
        return "This is an explanatory commitment or plan. Check whether subsequent actions and observations actually support or validate it, and look for where it gets updated.";
      case "action":
        return "This is an active intervention in the environment or a tool execution. Verify whether it was justified by preceding beliefs, or if the model executed it blindly without planning.";
      case "observation":
        return "This represents external evidence or tool output returned from the environment. Inspect whether the model correctly processed this information in its next belief update.";
      case "belief_update":
        return "This marks a shift in the model's internal confidence or belief state. Check if the update is proportional to the evidence gathered, or if it overreacted/underreacted.";
      case "failure":
        return "This represents a critical reasoning breakdown, loop, or error. Inspect neighboring hypothesis, action, and observation nodes to isolate where the logic derailed.";
      case "decision":
        return "This is a branching decision point where the model weighs alternatives. Compare the chosen path with other candidates to verify selection criteria.";
      case "final_answer":
        return "This is the final terminal output of the trace. Trace backwards along its parent links to confirm if it has a sound causal justification rooted in evidence.";
      default:
        return "Trace event metadata. Review content details for reasoning context.";
    }
  }, [selectedEvent]);

  // 5. Copy node as Markdown
  const copyNodeAsMarkdown = () => {
    if (!selectedEvent) return;
    const config = typeConfigs[selectedEvent.type];
    const typeLabel = config?.label || selectedEvent.type;

    let md = `### [Step ${selectedEvent.step}] ${typeLabel}\n\n`;
    if (selectedEvent.confidence !== undefined) {
      md += `**Confidence:** ${Math.round(selectedEvent.confidence * 100)}%\n`;
    }
    if (selectedEvent.tool) {
      md += `**Tool Executed:** \`${selectedEvent.tool}\`\n`;
    }
    md += `\n**Content:**\n${selectedEvent.content}\n`;

    if (parents.length > 0) {
      md += `\n**Depends On:**\n`;
      parents.forEach(p => {
        const pConfig = typeConfigs[p.type];
        md += `- Step ${p.step} (${pConfig.label}): ${p.content.substring(0, 50)}...\n`;
      });
    }

    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!selectedEvent) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-cyber-card border border-cyber-border rounded-xl text-cyber-muted">
        <Info className="w-8 h-8 text-cyber-border mb-3" />
        <span className="text-sm font-semibold">No Event Selected</span>
        <span className="text-xs text-cyber-muted mt-1 max-w-[200px]">
          Click any node in the reasoning graph to inspect its details and trace links.
        </span>
      </div>
    );
  }

  const config = typeConfigs[selectedEvent.type] || typeConfigs.hypothesis;
  const Icon = config.icon;

  return (
    <div className="h-full flex flex-col bg-cyber-card border border-cyber-border rounded-xl overflow-hidden shadow-cyber-glow">
      {/* Header */}
      <div className="p-4 border-b border-cyber-border bg-cyber-bg/50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-1.5 rounded-lg ${config.bgClass} ${config.textClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-cyber-text tracking-wide uppercase">
              {config.label}
            </h3>
            <span className="text-[10px] text-cyber-muted font-mono">
              Event ID: {selectedEvent.id}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="bg-cyber-border text-cyber-text text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold">
            Step {selectedEvent.step}
          </span>
          <button
            onClick={copyNodeAsMarkdown}
            className="p-1.5 rounded bg-cyber-bg border border-cyber-border hover:bg-cyber-hover hover:text-cyber-primary text-cyber-muted transition-all"
            title="Copy as Markdown"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Content Card */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted">Content</span>
          <div className="p-3.5 bg-cyber-bg border border-cyber-border rounded-lg text-xs leading-relaxed text-cyber-text font-sans whitespace-pre-wrap selection:bg-blue-500/30">
            {selectedEvent.content}
          </div>
        </div>

        {/* Action Tool & Confidence Details */}
        {(selectedEvent.tool || selectedEvent.confidence !== undefined) && (
          <div className="grid grid-cols-2 gap-3">
            {selectedEvent.tool && (
              <div className="bg-blue-950/20 border border-blue-500/20 p-2.5 rounded-lg">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider block mb-1">
                  Tool Invoked
                </span>
                <span className="text-xs text-blue-200 font-mono font-semibold">
                  {selectedEvent.tool}
                </span>
              </div>
            )}
            {selectedEvent.confidence !== undefined && (
              <div className={`${
                selectedEvent.confidence >= 0.8 
                  ? "bg-emerald-950/20 border-emerald-500/20" 
                  : selectedEvent.confidence >= 0.5 
                    ? "bg-amber-950/20 border-amber-500/20" 
                    : "bg-rose-950/20 border-rose-500/20"
              } border p-2.5 rounded-lg`}>
                <span className="text-[9px] font-bold text-cyber-muted uppercase tracking-wider block mb-1">
                  Confidence
                </span>
                <div className="flex items-center space-x-1.5">
                  <span className={`text-base font-bold font-mono ${
                    selectedEvent.confidence >= 0.8 
                      ? "text-emerald-400" 
                      : selectedEvent.confidence >= 0.5 
                        ? "text-amber-400" 
                        : "text-rose-400"
                  }`}>
                    {Math.round(selectedEvent.confidence * 100)}%
                  </span>
                  <div className="w-12 h-1.5 bg-cyber-border rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        selectedEvent.confidence >= 0.8 
                          ? "bg-emerald-400" 
                          : selectedEvent.confidence >= 0.5 
                            ? "bg-amber-400" 
                            : "bg-rose-400"
                      }`}
                      style={{ width: `${selectedEvent.confidence * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Debug Interpretation */}
        <div className="p-3.5 bg-cyber-bg border border-cyber-border rounded-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyber-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-primary flex items-center mb-1">
            <Info className="w-3 h-3 mr-1" /> Debug Interpretation
          </span>
          <p className="text-xs text-cyber-muted leading-relaxed">
            {debugInterpretation}
          </p>
        </div>

        {/* Parent / Dependency Events (Links) */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted block">
            Depends On (Parents)
          </span>
          {parents.length > 0 ? (
            <div className="space-y-1.5">
              {parents.map(p => {
                const pConfig = typeConfigs[p.type] || typeConfigs.hypothesis;
                const PIcon = pConfig.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedNodeId(p.id)}
                    className="w-full p-2 text-left bg-cyber-bg border border-cyber-border rounded-lg flex items-center justify-between hover:bg-cyber-hover hover:border-cyber-primary group transition-all"
                  >
                    <div className="flex items-center space-x-2 overflow-hidden mr-2">
                      <div className={`p-1 rounded ${pConfig.bgClass} ${pConfig.textClass}`}>
                        <PIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-cyber-text truncate font-sans">
                        {p.content}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0 text-[10px] font-mono text-cyber-muted">
                      <span>Step {p.step}</span>
                      <ArrowLeft className="w-3 h-3 group-hover:text-cyber-primary transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-cyber-muted font-mono block pl-1">
              None (Root Event)
            </span>
          )}
        </div>

        {/* Child / Successor Events */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted block">
            Leads To (Children)
          </span>
          {children.length > 0 ? (
            <div className="space-y-1.5">
              {children.map(c => {
                const cConfig = typeConfigs[c.type] || typeConfigs.hypothesis;
                const CIcon = cConfig.icon;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedNodeId(c.id)}
                    className="w-full p-2 text-left bg-cyber-bg border border-cyber-border rounded-lg flex items-center justify-between hover:bg-cyber-hover hover:border-cyber-primary group transition-all"
                  >
                    <div className="flex items-center space-x-2 overflow-hidden mr-2">
                      <div className={`p-1 rounded ${cConfig.bgClass} ${cConfig.textClass}`}>
                        <CIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-cyber-text truncate font-sans">
                        {c.content}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0 text-[10px] font-mono text-cyber-muted">
                      <span>Step {c.step}</span>
                      <ArrowRight className="w-3 h-3 group-hover:text-cyber-primary transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-cyber-muted font-mono block pl-1">
              None (Terminal Leaf Event)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
