import React from "react";
import { Handle, Position } from "@xyflow/react";
import { 
  Brain, 
  Wrench, 
  Eye, 
  RefreshCw, 
  AlertTriangle, 
  GitBranch, 
  CheckCircle, 
  Terminal 
} from "lucide-react";
import type { TraceEvent, EventType } from "../types";

// Map types to icons, colors and labels
export const typeConfigs: Record<
  EventType, 
  { 
    icon: React.ComponentType<any>; 
    colorClass: string; 
    borderClass: string;
    bgClass: string;
    glowClass: string;
    textClass: string;
    label: string; 
  }
> = {
  hypothesis: {
    icon: Brain,
    colorClass: "bg-cyan-500",
    borderClass: "border-cyan-500/40",
    bgClass: "bg-cyan-950/20",
    glowClass: "glow-hypothesis",
    textClass: "text-cyan-400",
    label: "Hypothesis",
  },
  action: {
    icon: Wrench,
    colorClass: "bg-blue-500",
    borderClass: "border-blue-500/40",
    bgClass: "bg-blue-950/20",
    glowClass: "glow-action",
    textClass: "text-blue-400",
    label: "Action",
  },
  observation: {
    icon: Eye,
    colorClass: "bg-emerald-500",
    borderClass: "border-emerald-500/40",
    bgClass: "bg-emerald-950/20",
    glowClass: "glow-observation",
    textClass: "text-emerald-400",
    label: "Observation",
  },
  belief_update: {
    icon: RefreshCw,
    colorClass: "bg-purple-500",
    borderClass: "border-purple-500/40",
    bgClass: "bg-purple-950/20",
    glowClass: "glow-belief_update",
    textClass: "text-purple-400",
    label: "Belief Update",
  },
  failure: {
    icon: AlertTriangle,
    colorClass: "bg-rose-500",
    borderClass: "border-rose-500/60",
    bgClass: "bg-rose-950/30",
    glowClass: "glow-failure",
    textClass: "text-rose-400",
    label: "Failure",
  },
  decision: {
    icon: GitBranch,
    colorClass: "bg-amber-500",
    borderClass: "border-amber-500/40",
    bgClass: "bg-amber-950/20",
    glowClass: "glow-decision",
    textClass: "text-amber-400",
    label: "Decision",
  },
  final_answer: {
    icon: CheckCircle,
    colorClass: "bg-pink-500",
    borderClass: "border-pink-500/60",
    bgClass: "bg-pink-950/30",
    glowClass: "glow-final_answer",
    textClass: "text-pink-400",
    label: "Final Answer",
  },
};

export const CustomTraceNode = (props: any) => {
  const data = props.data as {
    event: TraceEvent;
    isSelected: boolean;
    isHighlightedFailure: boolean;
    isNewest: boolean;
  };
  const { event, isSelected, isHighlightedFailure, isNewest } = data;
  const config = typeConfigs[event.type as EventType] || typeConfigs.hypothesis;
  const Icon = config.icon;

  // Truncate content for a neat preview
  const maxPreviewLength = 80;
  const contentPreview = event.content.length > maxPreviewLength
    ? `${event.content.substring(0, maxPreviewLength)}...`
    : event.content;

  return (
    <div
      className={`relative w-[280px] rounded-xl border bg-cyber-card transition-all duration-300 backdrop-blur-md text-cyber-text text-sm p-4 cursor-pointer
        ${config.borderClass} ${isSelected ? "ring-2 ring-cyber-primary shadow-cyber-glow" : ""}
        ${isHighlightedFailure ? "ring-2 ring-cyber-danger shadow-rose-glow border-cyber-danger animate-pulse" : ""}
        ${isNewest ? "ring-2 ring-cyan-400 shadow-cyan-glow border-cyan-400" : ""}
        ${config.glowClass}
      `}
    >
      {/* Target handle on top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-cyber-border !border-cyber-bg w-2 h-2 rounded-full"
      />

      {/* Node Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {/* Left colored bar / icon container */}
          <div className={`p-1.5 rounded-lg ${config.bgClass} ${config.textClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className={`font-semibold tracking-wide uppercase text-[10px] ${config.textClass}`}>
            {config.label}
          </span>
        </div>

        {/* Step indicator */}
        <span className="bg-cyber-border text-cyber-muted text-[10px] px-2 py-0.5 rounded-full font-mono">
          Step {event.step}
        </span>
      </div>

      {/* Tool Name if Action */}
      {event.type === "action" && event.tool && (
        <div className="flex items-center space-x-1 mb-2 bg-blue-950/40 border border-blue-500/20 px-2 py-0.5 rounded w-max">
          <Terminal className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] text-blue-300 font-mono font-bold">
            {event.tool}
          </span>
        </div>
      )}

      {/* Main Content Preview */}
      <p className="text-xs text-cyber-text leading-relaxed font-sans line-clamp-3">
        {contentPreview}
      </p>

      {/* Node Footer: Badges */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-cyber-border">
        {/* Confidence Badge */}
        {event.confidence !== undefined ? (
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-cyber-muted">Conf:</span>
            <span className={`text-[10px] font-bold font-mono ${
              event.confidence >= 0.8 ? "text-emerald-400" : event.confidence >= 0.5 ? "text-amber-400" : "text-rose-400"
            }`}>
              {Math.round(event.confidence * 100)}%
            </span>
          </div>
        ) : (
          <div />
        )}

        {/* Newest Pulse Dot Indicator */}
        {isNewest && (
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 blink-dot" />
            <span className="text-[8px] uppercase tracking-wider text-cyan-400 font-bold">
              Active Step
            </span>
          </div>
        )}
      </div>

      {/* Source handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-cyber-border !border-cyber-bg w-2 h-2 rounded-full"
      />
    </div>
  );
};
