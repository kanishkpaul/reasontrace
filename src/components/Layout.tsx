import React, { useEffect, useMemo, useState } from "react";
import { useTraceStore } from "../store";
import { TraceInput } from "./TraceInput";
import { SampleTracePicker } from "./SampleTracePicker";
import { EventFilters } from "./EventFilters";
import { ReasoningGraph } from "./ReasoningGraph";
import { NodeInspector } from "./NodeInspector";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { TimelineControls } from "./TimelineControls";
import { TraceAnalysisSummary } from "./TraceAnalysisSummary";
import { computeDiagnostics } from "../lib/diagnostics";
import { BrainCircuit, Download, Save, Info, Sparkles, PanelLeft, PanelRight, Upload, X } from "lucide-react";

type MobileTab = "review" | "import" | "details";

const utilityButton = "inline-flex items-center gap-1.5 rounded-md border border-cyber-border bg-cyber-card px-2.5 py-1.5 text-xs font-medium text-cyber-muted transition-colors hover:bg-cyber-hover hover:text-cyber-text";

export const Layout: React.FC = () => {
  const { currentTrace, setTrace, selectedNodeId } = useTraceStore();
  const [activeRightTab, setActiveRightTab] = useState<"inspector" | "diagnosis">("inspector");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>("review");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    const saved = localStorage.getItem("reasontrace_saved_trace");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.events)) setTrace(parsed);
    } catch {
      localStorage.removeItem("reasontrace_saved_trace");
    }
  }, [setTrace]);

  useEffect(() => {
    if (currentTrace?.events.length) localStorage.setItem("reasontrace_saved_trace", JSON.stringify(currentTrace));
  }, [currentTrace]);

  const diagnostics = useMemo(() => currentTrace ? computeDiagnostics(currentTrace) : null, [currentTrace]);
  const selectedEvent = useMemo(() => currentTrace?.events.find((event) => event.id === selectedNodeId), [currentTrace, selectedNodeId]);
  const warningCount = diagnostics?.findings.filter((finding) => finding.severity !== "info").length ?? 0;

  const exportTraceAsJson = () => {
    if (!currentTrace) return;
    const blob = new Blob([JSON.stringify(currentTrace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentTrace.title.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleQuickSave = () => {
    if (!currentTrace) return;
    localStorage.setItem("reasontrace_saved_trace", JSON.stringify(currentTrace));
    setSaveStatus("saved");
    window.setTimeout(() => setSaveStatus("idle"), 1800);
  };

  if (!currentTrace) {
    return <GuidedEmptyWorkspace onTraceLoaded={() => setMobileTab("review")} />;
  }

  return (
    <div className="agent-shell flex h-screen flex-col overflow-hidden bg-cyber-bg text-cyber-text">
      <header className="z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-cyber-border bg-cyber-bg px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-7 shrink-0 place-items-center rounded-md border border-cyber-border bg-cyber-card text-cyber-text"><BrainCircuit className="size-4" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="text-sm font-medium tracking-tight">ReasonTrace</h1><span className="hidden text-[10px] text-cyber-muted sm:inline">/ trace review</span></div>
            <p className="truncate text-xs text-cyber-muted">{currentTrace.title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => { setLeftOpen(true); setMobileTab("import"); }} className={`${utilityButton} hidden sm:inline-flex`} title="Import another trace"><Upload className="size-3.5" /><span>Import</span></button>
          <button onClick={handleQuickSave} className={`${utilityButton} hidden sm:inline-flex`} title="Save trace in this browser"><Save className="size-3.5" /><span>{saveStatus === "saved" ? "Saved" : "Save"}</span></button>
          <button onClick={exportTraceAsJson} className={utilityButton} title="Download trace as JSON"><Download className="size-3.5" /><span className="hidden sm:inline">Export</span></button>
        </div>
      </header>

      <nav className="grid shrink-0 grid-cols-3 border-b border-cyber-border bg-cyber-card p-1 lg:hidden" aria-label="Mobile workspace sections">
        {([ ["review", "Review"], ["import", "Import"], ["details", "Details"] ] as const).map(([tab, label]) => <button key={tab} onClick={() => setMobileTab(tab)} className={`rounded-md px-3 py-2 text-xs font-medium ${mobileTab === tab ? "bg-cyber-hover text-cyber-text" : "text-cyber-muted"}`}>{label}{tab === "details" && warningCount > 0 ? ` · ${warningCount}` : ""}</button>)}
      </nav>

      <main className="flex min-h-0 flex-1 gap-0">
        <aside className={`${leftOpen ? "lg:flex" : "lg:hidden"} ${mobileTab === "import" ? "flex" : "hidden"} w-full shrink-0 flex-col gap-3 overflow-y-auto border-r border-cyber-border bg-cyber-card p-3 lg:w-[290px]`} aria-label="Trace import and filters">
          <div className="flex items-center justify-between lg:hidden"><span className="text-xs font-medium text-cyber-muted">Workspace setup</span><button onClick={() => setMobileTab("review")} className="rounded-md p-1 text-cyber-muted hover:bg-cyber-hover hover:text-cyber-text" aria-label="Close import panel"><X className="size-4" /></button></div>
          <TraceInput onLoaded={() => setMobileTab("review")} />
          <SampleTracePicker onLoaded={() => setMobileTab("review")} />
          <EventFilters />
        </aside>

        <section className={`${mobileTab === "review" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex lg:p-4`} aria-label="Trace review">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-medium text-cyber-text">Trace</p><p className="truncate text-xs text-cyber-muted">{selectedEvent ? `Viewing step ${selectedEvent.step} · ${selectedEvent.type.replace("_", " ")}` : "Select an event to inspect its trail"}</p></div>
            <div className="hidden items-center gap-1 lg:flex"><button onClick={() => setLeftOpen(!leftOpen)} className="rounded-md p-2 text-cyber-muted hover:bg-cyber-hover hover:text-cyber-text" aria-label={leftOpen ? "Collapse left panel" : "Expand left panel"}><PanelLeft className="size-4" /></button><button onClick={() => setRightOpen(!rightOpen)} className="rounded-md p-2 text-cyber-muted hover:bg-cyber-hover hover:text-cyber-text" aria-label={rightOpen ? "Collapse details panel" : "Expand details panel"}><PanelRight className="size-4" /></button></div>
          </div>
          <TraceAnalysisSummary />
          <div className="min-h-[420px] flex-1"><ReasoningGraph /></div>
          <TimelineControls />
        </section>

        <aside className={`${rightOpen ? "lg:flex" : "lg:hidden"} ${mobileTab === "details" ? "flex" : "hidden"} min-h-0 w-full shrink-0 flex-col overflow-hidden border-l border-cyber-border bg-cyber-card p-3 lg:w-[360px]`} aria-label="Trace details">
          <div className="flex rounded-lg border border-cyber-border bg-cyber-bg p-1">
            <button onClick={() => setActiveRightTab("inspector")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${activeRightTab === "inspector" ? "bg-cyber-hover text-cyber-text" : "text-cyber-muted"}`}><Info className="size-3.5" />Inspector</button>
            <button onClick={() => setActiveRightTab("diagnosis")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${activeRightTab === "diagnosis" ? "bg-cyber-hover text-cyber-text" : "text-cyber-muted"}`}><Sparkles className="size-3.5" />Findings{warningCount > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] text-white">{warningCount}</span>}</button>
          </div>
          <div className="mt-3 min-h-0 flex-1">{activeRightTab === "inspector" ? <NodeInspector /> : <DiagnosisPanel />}</div>
        </aside>
      </main>
    </div>
  );
};

const GuidedEmptyWorkspace: React.FC<{ onTraceLoaded: () => void }> = ({ onTraceLoaded }) => (
  <div className="agent-shell min-h-screen bg-cyber-bg text-cyber-text">
    <header className="flex h-12 items-center border-b border-cyber-border px-4"><div className="flex items-center gap-2"><div className="grid size-7 place-items-center rounded-md border border-cyber-border bg-cyber-card"><BrainCircuit className="size-4" /></div><h1 className="text-sm font-medium">ReasonTrace</h1></div></header>
    <main className="mx-auto grid min-h-[calc(100vh-48px)] max-w-7xl gap-0 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="order-2 border-t border-cyber-border bg-cyber-card p-4 lg:order-1 lg:border-r lg:border-t-0"><p className="mb-3 text-xs font-medium text-cyber-muted">Open a trace</p><TraceInput onLoaded={onTraceLoaded} /><div className="my-4 border-t border-cyber-border" /><SampleTracePicker onLoaded={onTraceLoaded} compact /></aside>
      <section className="order-1 flex min-h-[360px] flex-col justify-center border-b border-cyber-border p-6 lg:order-2 lg:border-b-0 lg:p-12"><p className="text-xs text-cyber-muted">No trace open</p><h2 className="mt-3 max-w-xl text-2xl font-medium tracking-tight md:text-3xl">Open a trace to review its evidence trail.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-cyber-muted">Use a local event log, paste a transcript, or begin with a sample. The workspace will keep the graph, findings, and event detail in one place.</p><div className="mt-8 flex gap-6 text-xs text-cyber-muted"><span>Local only</span><span>•</span><span>Structured review</span><span>•</span><span>Exportable</span></div></section>
    </main>
  </div>
);
