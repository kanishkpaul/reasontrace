import React, { useState } from "react";
import { useTraceStore } from "../store";
import { Terminal, Upload, AlertCircle, FileText } from "lucide-react";

export const TraceInput: React.FC = () => {
  const { parseAndSetTrace } = useTraceStore();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleParse = () => {
    setError(null);
    setSuccessMsg(null);
    if (!text.trim()) {
      setError("Please paste some content first.");
      return;
    }

    const warning = parseAndSetTrace(text);
    if (warning && (warning.includes("Failed") || warning.includes("Could not"))) {
      setError(warning);
    } else if (warning) {
      // It parsed successfully but has a warning (e.g. missing links)
      setSuccessMsg(`Trace loaded with warning: ${warning}`);
      setTimeout(() => setSuccessMsg(null), 6000);
    } else {
      setSuccessMsg("Trace loaded successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const insertExampleJson = () => {
    const example = {
      title: "Custom Local Trace",
      events: [
        { id: "1", type: "hypothesis", step: 1, content: "Looking for an API auth failure.", confidence: 0.9, links: [] },
        { id: "2", type: "action", step: 2, content: "Check API keys config.", tool: "env_check", links: ["1"] },
        { id: "3", type: "observation", step: 3, content: "API key starts with 'sk-proj-...'", links: ["2"] },
        { id: "4", type: "belief_update", step: 4, confidence: 0.95, content: "API key is correct. Check headers.", links: ["3"] },
        { id: "5", type: "final_answer", step: 5, content: "The key is valid. The issue was network connectivity.", links: ["4"] }
      ]
    };
    setText(JSON.stringify(example, null, 2));
  };

  const insertExampleTranscript = () => {
    const example = `Thought: Maybe the database host is misconfigured.
Action: Run ping db.local [tool: network_check]
Observation: Ping fails with unknown host db.local.
Update: Database host address is wrong or container is down. (confidence: 0.85)
Failure: Repeated attempts to connect to the offline database host.
Decision: Select IP address direct access instead of hostname dns.
Action: Run ping 10.0.0.5 [tool: network_check]
Observation: Connection established in 4ms.
Final: Replace db.local host with 10.0.0.5 inside connection string.`;
    setText(example);
  };

  return (
    <div className="flex flex-col bg-cyber-card border border-cyber-border rounded-xl p-4 space-y-4 shadow-cyber-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-blue-500">
          <Terminal className="w-5 h-5" />
          <h3 className="text-sm font-bold text-cyber-text tracking-wide uppercase">
            Trace Input
          </h3>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={insertExampleJson}
            className="text-[9px] font-semibold text-cyber-muted hover:text-cyan-400 bg-cyber-bg px-2 py-0.5 rounded border border-cyber-border transition-all"
          >
            + JSON
          </button>
          <button
            onClick={insertExampleTranscript}
            className="text-[9px] font-semibold text-cyber-muted hover:text-cyan-400 bg-cyber-bg px-2 py-0.5 rounded border border-cyber-border transition-all"
          >
            + Transcript
          </button>
        </div>
      </div>

      {/* Drop Area & Text Area */}
      <div 
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        className="relative group border border-dashed border-cyber-border hover:border-cyber-primary rounded-lg overflow-hidden transition-all bg-cyber-bg/50"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Paste JSON trace or paste lines like:
Thought: Maybe the key is invalid...
Action: Check config...
Observation: File is empty...
Update: Confirmed empty file (confidence: 0.90)`}
          className="w-full h-[180px] bg-transparent text-xs p-3 text-cyber-text placeholder-cyber-muted/60 focus:outline-none font-mono resize-none"
        />

        {/* Floating Upload Hint when textarea is empty */}
        {!text && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-cyber-muted/50 p-4">
            <Upload className="w-6 h-6 mb-1 text-cyber-border group-hover:text-cyber-primary transition-all" />
            <span className="text-[10px]">Drag & drop .json / .txt trace files here</span>
          </div>
        )}
      </div>

      {/* Feedback alerts */}
      {error && (
        <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/30 text-rose-400 text-[11px] flex items-start space-x-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className={`p-2.5 rounded text-[11px] flex items-start space-x-2 border ${
          successMsg.includes("warning") 
            ? "bg-amber-950/20 border-amber-500/30 text-amber-400" 
            : "bg-emerald-950/20 border-emerald-500/30 text-emerald-400"
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleParse}
          className="flex-1 bg-cyber-primary hover:bg-blue-600 text-white text-xs font-bold py-2 rounded-lg transition-all shadow-cyber-glow flex items-center justify-center space-x-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Parse & Visualize</span>
        </button>
        <button
          onClick={() => {
            setText("");
            setError(null);
            setSuccessMsg(null);
          }}
          className="px-3 bg-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text text-xs rounded-lg transition-all border border-cyber-border"
        >
          Clear
        </button>
      </div>
    </div>
  );
};
