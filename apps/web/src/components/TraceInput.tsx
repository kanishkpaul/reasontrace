import React, { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTraceStore } from "../store";
import { Terminal, Upload, AlertCircle, FileText } from "lucide-react";

// Four times the 50,000-event trace the diagnostics are tested on (4.7 MB of
// JSON with short contents), leaving room for long tool outputs while
// refusing a file that is clearly not a trace.
const MAX_FILE_BYTES = 20e6;

export const TraceInput: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
  const { parseAndSetTrace } = useTraceStore(useShallow((s) => ({ parseAndSetTrace: s.parseAndSetTrace })));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<{ text: string; warning: boolean } | null>(null);

  // One timer for the success message. Separate timers let an older one hide
  // a newer message early (I3).
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSuccess = (message: { text: string; warning: boolean }, ms: number) => {
    clearTimeout(messageTimer.current);
    setSuccessMsg(message);
    messageTimer.current = setTimeout(() => setSuccessMsg(null), ms);
  };
  useEffect(() => () => clearTimeout(messageTimer.current), []);

  const handleParse = () => {
    setError(null);
    setSuccessMsg(null);
    if (!text.trim()) {
      setError("Please paste some content first.");
      return;
    }

    const { trace, errors, warnings } = parseAndSetTrace(text);
    if (!trace) {
      setError(errors.join(" "));
      return;
    }
    if (warnings.length) {
      showSuccess({ text: `Trace loaded with warnings: ${warnings.join(" ")}`, warning: true }, 6000);
    } else {
      showSuccess({ text: "Trace loaded.", warning: false }, 3000);
    }
    onLoaded?.();
  };

  const loadFile = (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1e6} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      // A NUL byte never appears in a text trace; it means a binary file.
      if (content.includes("\u0000")) setError(`${file.name} is not a text file.`);
      else setText(content);
    };
    reader.onerror = () => setError(`Could not read ${file.name}.`);
    reader.readAsText(file);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const insertExampleJson = () => {
    const example = {
      formatVersion: 1,
      title: "Custom Local Trace",
      events: [
        { id: "1", type: "hypothesis", step: 1, label: "stated", content: "Looking for an API auth failure.", confidence: 0.9, supports: [] },
        { id: "2", type: "action", step: 2, label: "observed", content: "Check API keys config.", tool: "env_check", supports: ["1"] },
        { id: "3", type: "observation", step: 3, label: "observed", content: "API key starts with 'sk-proj-...'", supports: ["2"] },
        { id: "4", type: "belief_update", step: 4, label: "stated", confidence: 0.95, content: "API key is correct. Check headers.", supports: ["3"] },
        { id: "5", type: "final_answer", step: 5, label: "observed", content: "The key is valid. The issue was network connectivity.", supports: ["4"] }
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
          <h3 className="text-sm font-semibold text-cyber-text tracking-wide">
            Import a trace
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
          aria-label="Trace input"
          placeholder={`Paste a reasoning trace, chat/tool log JSON, or lines like:
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
            <span className="text-[10px] text-center">Drop a .json or .txt trace, chat log, or tool-call record</span>
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
          successMsg.warning 
            ? "bg-amber-950/20 border-amber-500/30 text-amber-400" 
            : "bg-emerald-950/20 border-emerald-500/30 text-emerald-400"
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{successMsg.text}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleParse}
          className="flex-1 bg-cyber-primary hover:bg-blue-600 text-white text-xs font-bold py-2 rounded-lg transition-all shadow-cyber-glow flex items-center justify-center space-x-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Open trace</span>
        </button>
        <label className="px-3 flex items-center bg-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text text-xs rounded-lg transition-all border border-cyber-border cursor-pointer focus-within:outline focus-within:outline-cyber-primary">
          Choose file
          <input
            type="file"
            accept=".json,.jsonl,.txt,.log,application/json,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
              e.target.value = "";
            }}
          />
        </label>
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
