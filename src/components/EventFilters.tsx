import React from "react";
import { useTraceStore } from "../store";
import type { EventType } from "../types";
import { typeConfigs } from "./CustomTraceNode";
import { Filter, Search, Sliders, CheckSquare, Square } from "lucide-react";

export const EventFilters: React.FC = () => {
  const { filters, settings, setEventTypeFilter, setSearchQuery, toggleSetting, resetFilters } = useTraceStore();

  const handleTypeToggle = (type: EventType) => {
    setEventTypeFilter(type, !filters.eventTypes[type]);
  };

  const handleSelectAll = () => {
    const types: EventType[] = ["hypothesis", "action", "observation", "belief_update", "failure", "decision", "final_answer"];
    types.forEach(t => setEventTypeFilter(t, true));
  };

  const handleClearAll = () => {
    const types: EventType[] = ["hypothesis", "action", "observation", "belief_update", "failure", "decision", "final_answer"];
    types.forEach(t => setEventTypeFilter(t, false));
  };

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-4 space-y-4 shadow-cyber-glow text-xs">
      {/* Title */}
      <div className="flex items-center justify-between pb-1.5 border-b border-cyber-border">
        <div className="flex items-center space-x-2 text-cyber-muted">
          <Filter className="w-4 h-4" />
          <h3 className="text-sm font-bold text-cyber-text tracking-wide uppercase">
            Filters & Settings
          </h3>
        </div>
        <button
          onClick={resetFilters}
          className="text-[10px] text-cyber-primary hover:text-blue-400 font-semibold"
        >
          Reset Filters
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-cyber-muted">
          <Search className="w-3.5 h-3.5" />
        </span>
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search node content or tools..."
          className="w-full bg-cyber-bg border border-cyber-border rounded-lg pl-8 pr-3 py-1.5 text-cyber-text placeholder-cyber-muted/50 focus:outline-none focus:border-cyber-primary transition-all text-xs"
        />
      </div>

      {/* Event Type Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted">Event Types</span>
          <div className="flex space-x-2 text-[9px] font-semibold text-cyber-muted">
            <button onClick={handleSelectAll} className="hover:text-cyber-primary">All</button>
            <span>|</span>
            <button onClick={handleClearAll} className="hover:text-cyber-primary">None</button>
          </div>
        </div>

        <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
          {Object.entries(typeConfigs).map(([typeKey, cfg]) => {
            const type = typeKey as EventType;
            const isChecked = filters.eventTypes[type];
            const TypeIcon = cfg.icon;

            return (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                className={`w-full flex items-center justify-between p-2 rounded-lg border transition-all text-left
                  ${isChecked 
                    ? `${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass}` 
                    : "bg-transparent border-cyber-border text-cyber-muted hover:border-cyber-hover hover:text-cyber-text"
                  }`}
              >
                <div className="flex items-center space-x-2 overflow-hidden">
                  <TypeIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate font-semibold">{cfg.label}</span>
                </div>
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 shrink-0 text-current" />
                ) : (
                  <Square className="w-4 h-4 shrink-0 opacity-40" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Settings */}
      <div className="space-y-2 pt-2 border-t border-cyber-border">
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-muted flex items-center">
          <Sliders className="w-3.5 h-3.5 mr-1" /> Visual Options
        </span>
        <div className="space-y-2">
          {/* Toggle Temporal Edges */}
          <label className="flex items-center justify-between p-1 cursor-pointer select-none">
            <span className="text-cyber-text">Draw Temporal Edges</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.showTemporalEdges}
                onChange={() => toggleSetting("showTemporalEdges")}
                className="sr-only"
              />
              <div className={`w-8 h-4 bg-cyber-bg rounded-full border border-cyber-border transition-colors ${settings.showTemporalEdges ? "bg-cyber-primary/30 border-cyber-primary" : ""}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-cyber-muted transition-transform transform ${settings.showTemporalEdges ? "translate-x-4 bg-cyber-primary" : "translate-x-0"}`} />
              </div>
            </div>
          </label>

          {/* Toggle Failure Highlights */}
          <label className="flex items-center justify-between p-1 cursor-pointer select-none">
            <span className="text-cyber-text">Pulsing Failure Warning</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.highlightFailures}
                onChange={() => toggleSetting("highlightFailures")}
                className="sr-only"
              />
              <div className={`w-8 h-4 bg-cyber-bg rounded-full border border-cyber-border transition-colors ${settings.highlightFailures ? "bg-rose-950 border-cyber-danger" : ""}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-cyber-muted transition-transform transform ${settings.highlightFailures ? "translate-x-4 bg-cyber-danger" : "translate-x-0"}`} />
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
