import { useTraceStore } from "../store";
import { EvidenceLabel } from "./EvidenceLabel";

/**
 * A run as it streams in. Its directory is read back once the server reports
 * the result; until then this shows the raw text on each channel.
 */
export function LiveRun() {
  const live = useTraceStore((s) => s.live);
  if (!live) return null;
  return (
    <div className="live-run" aria-live="polite">
      <p className="live-run__head"><span className="dot dot--live" /> running · {live.title}</p>
      <div className="live-run__columns">
        <section>
          <h3 className="section-heading">Behaviour</h3>
          <EvidenceLabel label="observed" />
          <p className="live-run__text evidence-text" data-label="observed">{live.output || "…"}</p>
        </section>
        <section>
          <h3 className="section-heading">Stated reasoning</h3>
          <EvidenceLabel label="stated" />
          <p className="live-run__text evidence-text" data-label="stated">{live.reasoning || "…"}</p>
        </section>
      </div>
    </div>
  );
}
