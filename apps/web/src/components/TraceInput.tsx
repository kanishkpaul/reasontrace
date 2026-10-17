import React, { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTraceStore } from "../store";

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
    <section className="trace-input">
      <div className="trace-input__head">
        <h2 className="section-heading">Open a trace</h2>
        <span className="trace-input__examples">
          <button type="button" className="btn btn--text-strong btn--xs" onClick={insertExampleJson}>Example JSON</button>
          <button type="button" className="btn btn--text-strong btn--xs" onClick={insertExampleTranscript}>Example transcript</button>
        </span>
      </div>

      <div onDrop={handleFileDrop} onDragOver={handleDragOver}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Trace input"
          className="field trace-input__text"
          placeholder={`Paste trace JSON, a chat or tool log, or a transcript:
Thought: Maybe the key is invalid
Action: check_config()
Observation: The file is empty
Or drop a .json or .txt file here.`}
        />
      </div>

      {error && <p className="hint hint--error" role="alert">{error}</p>}
      {successMsg && <p className="hint" data-warning={successMsg.warning || undefined} role="status">{successMsg.text}</p>}

      <div className="trace-input__actions">
        <button type="button" className="btn btn--sm" onClick={handleParse}>Open trace</button>
        <label className="btn btn--secondary btn--sm">
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
          type="button"
          className="btn btn--text btn--sm"
          onClick={() => {
            setText("");
            setError(null);
            setSuccessMsg(null);
          }}
        >
          Clear
        </button>
      </div>
    </section>
  );
};
