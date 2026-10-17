import { useShallow } from "zustand/react/shallow";
import { sampleTraces } from "../data/sampleTraces";
import { useTraceStore } from "../store";

const DESCRIPTIONS: Record<string, string> = {
  "opaque-tool-agent": "A tool-calling agent that never says what supports what.",
  "arc-agi-solver": "A symmetry hypothesis that fails, and the recovery.",
  "code-debugger": "Finding an off-by-one in a parser loop.",
  "rope-scaling": "Extending a context window with RoPE scaling.",
  "flight-booker": "A web agent clicking a button a modal blocks.",
  "database-migration": "A migration script that loops, then recovers.",
};

/** The bundled sample traces, as the sidebar's list of things to open. */
export function SampleTracePicker({ onLoaded }: { onLoaded?: () => void }) {
  const { current, loadSampleTrace } = useTraceStore(useShallow((s) => ({ current: s.currentTrace, loadSampleTrace: s.loadSampleTrace })));
  return (
    <section>
      <h2 className="section-heading">Samples</h2>
      {Object.entries(sampleTraces).map(([key, trace]) => (
        <button
          key={key}
          type="button"
          className="row sample-row"
          aria-current={current === trace}
          onClick={() => { loadSampleTrace(key); onLoaded?.(); }}
        >
          <span className="row__title">{trace.title}</span>
          <span className="row__meta">{trace.events.length} events</span>
          <span className="row__desc">{DESCRIPTIONS[key]}</span>
        </button>
      ))}
    </section>
  );
}
