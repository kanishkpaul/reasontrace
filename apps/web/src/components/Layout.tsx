import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { diagnosticsFor } from "../lib/diagnostics";
import { downloadFile, fileNameFor } from "../lib/download";
import { DownloadIcon, ICON, RailIcon, SidebarIcon } from "../lib/icons";
import { api, hasServer } from "../lib/api";
import { COMPLETION } from "../lib/completion";
import { loadOpenRunId, loadSavedTrace } from "../lib/savedTrace";
import { useTraceStore } from "../store";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { EventFilters } from "./EventFilters";
import { LiveRun } from "./LiveRun";
import { NodeInspector } from "./NodeInspector";
import { ReasoningGraph } from "./ReasoningGraph";
import { RunList } from "./RunList";
import { RunPanel } from "./RunPanel";
import { SampleTracePicker } from "./SampleTracePicker";
import { StatusBar } from "./StatusBar";
import { StepColumns } from "./StepColumns";
import { TimelineControls } from "./TimelineControls";
import { TraceInput } from "./TraceInput";

/** Which region a narrow screen shows; wide screens show all three. */
type Region = "trace" | "open" | "detail";

/**
 * The app shell (design/README.md, Layout): traces in the sidebar, the trace
 * by step and depth in the main surface, step detail and findings in the rail,
 * and an honest status bar.
 */
export function Layout() {
  const { trace, setTrace, openRun, selectedId, saved, live, completion } = useTraceStore(useShallow((s) => ({
    trace: s.currentTrace,
    setTrace: s.setTrace,
    openRun: s.openRun,
    selectedId: s.selectedNodeId,
    saved: s.savedInBrowser,
    live: s.live !== null,
    completion: s.run?.manifest.completion,
  })));
  const [view, setView] = useState<"steps" | "graph">("steps");
  const [railTab, setRailTab] = useState<"step" | "findings">("step");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [region, setRegion] = useState<Region>("trace");

  useEffect(() => {
    const restoreTrace = () => {
      const restored = loadSavedTrace();
      if (restored) setTrace(restored);
    };
    const runId = hasServer ? loadOpenRunId() : null;
    if (runId) api.run(runId).then(openRun, restoreTrace);
    else restoreTrace();
  }, [setTrace, openRun]);

  const diagnostics = trace ? diagnosticsFor(trace) : null;
  const toCheck = diagnostics?.findings.filter((f) => f.severity !== "info").length ?? 0;
  const selected = useMemo(() => trace?.events.find((e) => e.id === selectedId), [trace, selectedId]);

  if (!trace && !live) return <EmptyHome />;
  if (!trace) return <div className="home"><LiveRun /></div>;

  const exportJson = () => downloadFile(fileNameFor(trace.title, ".json"), JSON.stringify(trace, null, 2), "application/json");

  return (
    <div className="app" data-region={region} data-sidebar={sidebarOpen || undefined} data-rail={railOpen || undefined}>
      <header className="app__bar">
        <button type="button" className="btn btn--ghost btn--icon app__wide-only" aria-label={sidebarOpen ? "Hide the sidebar" : "Show the sidebar"} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <SidebarIcon size={ICON.size} stroke={ICON.stroke} />
        </button>
        <span className="app__glyph" aria-hidden="true">∴</span>
        <h1 className="app__title">{trace.title}</h1>
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportJson}>
          <DownloadIcon size={ICON.size} stroke={ICON.stroke} />
          Export JSON
        </button>
        <button type="button" className="btn btn--ghost btn--icon app__wide-only" aria-label={railOpen ? "Hide the detail rail" : "Show the detail rail"} onClick={() => setRailOpen(!railOpen)}>
          <RailIcon size={ICON.size} stroke={ICON.stroke} />
        </button>
      </header>

      <nav className="seg app__regions" aria-label="Sections">
        <button type="button" aria-pressed={region === "open"} onClick={() => setRegion("open")}>Open</button>
        <button type="button" aria-pressed={region === "trace"} onClick={() => setRegion("trace")}>Trace</button>
        <button type="button" aria-pressed={region === "detail"} onClick={() => setRegion("detail")}>Detail{toCheck ? ` · ${toCheck}` : ""}</button>
      </nav>

      <aside className="app__sidebar" aria-label="Runs, traces and filters">
        {hasServer && <RunPanel onRun={() => setRegion("trace")} />}
        {hasServer && <RunList onOpen={() => setRegion("trace")} />}
        <TraceInput onLoaded={() => setRegion("trace")} />
        <SampleTracePicker onLoaded={() => setRegion("trace")} />
        <EventFilters />
      </aside>

      <main className="app__main">
        <div className="app__main-head">
          <div className="seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "steps"} onClick={() => setView("steps")}>Steps</button>
            <button type="button" aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button>
          </div>
          <span className="hint">{selected ? `Step ${selected.step} selected` : "Select an event to inspect it"}</span>
        </div>
        {completion && completion.state !== "complete" && !live && (
          <p className="run-ending" data-state={completion.state}>
            <span className={`dot ${COMPLETION[completion.state].dot}`} /> {COMPLETION[completion.state].word}{completion.reason ? `: ${completion.reason}` : ""}
          </p>
        )}
        <div className="app__surface">{live ? <LiveRun /> : view === "steps" ? <StepColumns /> : <ReasoningGraph />}</div>
        <TimelineControls />
      </main>

      <aside className="app__rail" aria-label="Step detail and findings">
        <div className="seg" role="group" aria-label="Detail">
          <button type="button" aria-pressed={railTab === "step"} onClick={() => setRailTab("step")}>Step</button>
          <button type="button" aria-pressed={railTab === "findings"} onClick={() => setRailTab("findings")}>
            Findings{toCheck ? ` · ${toCheck}` : ""}
          </button>
        </div>
        {railTab === "step" ? <NodeInspector /> : <DiagnosisPanel />}
      </aside>

      <StatusBar trace={trace} saved={saved} />
    </div>
  );
}

function EmptyHome() {
  return (
    <div className="home">
      <div className="home__intro">
        <p className="eyebrow">∴ interpretability</p>
        <p className="wordmark">ReasonTrace</p>
        <h1 className="display-3">See what a model did, what it said it thought, and how far each can be trusted.</h1>
        <p className="hint">
          {hasServer ? "Run a model, or open a trace file or a sample." : "Open a trace file or a sample."} Every value carries its evidence label, and what a trace can't show is marked unavailable, with the reason.
        </p>
      </div>
      <div className="home__open">
        {hasServer && <RunPanel />}
        {hasServer && <RunList />}
        <TraceInput />
        <SampleTracePicker />
      </div>
    </div>
  );
}
