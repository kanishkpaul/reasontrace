import type { ResidualAttachment } from "@reasontrace/format";
import { EvidenceLabel } from "./EvidenceLabel";

/**
 * A captured residual stream: where it is stored, its shape, and the L2 norm
 * of its last kept position at each layer. Norms are raw measurements; they
 * say how large the state is, not what it means.
 */
export function ResidualView({ capture }: { capture: ResidualAttachment["data"] }) {
  const largest = Math.max(...capture.norms);
  const last = capture.positions.length - 1;
  return (
    <section className="token-view">
      <h3 className="section-heading">Residual stream</h3>
      <EvidenceLabel label="measured" />
      <dl className="step-detail__facts">
        <dt>File</dt><dd>{capture.file}</dd>
        <dt>Shape</dt><dd>{capture.layers.length} layers × {capture.pooling === "mean" ? `mean of ${capture.positions.length} positions` : `${capture.positions.length} position${capture.positions.length === 1 ? "" : "s"}`} × {capture.dModel}</dd>
        <dt>Positions</dt><dd>{capture.positions.length > 6 ? `${capture.positions[0]}–${capture.positions[last]}` : capture.positions.join(", ")}</dd>
        <dt>Last token</dt><dd>{JSON.stringify(capture.tokens[last] ?? "")}</dd>
        <dt>Values</dt><dd>{capture.dtype}</dd>
      </dl>
      <p className="hint">L2 norm at the last kept position, by layer.</p>
      <dl className="token-view__alternatives">
        {capture.layers.map((layer, i) => (
          <div key={layer} className="prob-bar">
            <dt>layer {layer}</dt>
            <dd>
              <span className="prob-bar__track"><span className="prob-bar__fill" style={{ width: `${(capture.norms[i] / largest) * 100}%` }} /></span>
              {capture.norms[i].toFixed(1)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
