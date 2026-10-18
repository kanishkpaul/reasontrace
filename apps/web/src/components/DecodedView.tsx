import type { DecodedAttachment, Validation } from "@reasontrace/format";
import { Fragment } from "react";
import { validationOf } from "../lib/validation";
import { EvidenceLabel } from "./EvidenceLabel";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** How long a field's value may run before it is cut, in characters. */
const FIELD_LIMIT = 160;

/**
 * A decoder's attachment: its method, its validation and, until its kind has
 * a view of its own, its fields as they are stored (docs/ARCHITECTURE.md §4).
 */
export function DecodedView({ attachment }: { attachment: DecodedAttachment }) {
  const { validated, reason } = validationOf(attachment);
  return (
    <section className="token-view">
      <h3 className="section-heading">{attachment.method.name}</h3>
      <EvidenceLabel label="decoded" validated={validated} />
      <dl className="step-detail__facts">
        <dt>Method</dt><dd>{attachment.method.name}, version {attachment.method.version}</dd>
        <dt>Kind</dt><dd>{attachment.kind}</dd>
      </dl>
      {reason && <p className="hint">Unvalidated: {reason}</p>}
      {attachment.validation && <ValidationView validation={attachment.validation} />}
      <h3 className="section-heading">Stored fields</h3>
      <dl className="step-detail__facts">
        {Object.entries(attachment.data).map(([key, value]) => {
          const text = JSON.stringify(value);
          return (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{text.length > FIELD_LIMIT ? `${text.slice(0, FIELD_LIMIT)}…` : text}</dd>
            </Fragment>
          );
        })}
      </dl>
    </section>
  );
}

/** What the decoder did on the planted circuit, by layer, and what each control did. */
export function ValidationView({ validation }: { validation: Validation }) {
  return (
    <>
      <h3 className="section-heading">Ground truth</h3>
      <p className="hint">{validation.groundTruth}</p>
      <dl className="step-detail__facts">
        <dt>Metric</dt><dd>{validation.metric}, over {validation.items} items</dd>
        <dt>Recovered</dt>
        <dd>
          {percent(validation.score)}, needs {percent(validation.required)}
          {validation.recoveredFrom === null ? "; at no layer" : `; from layer ${validation.recoveredFrom}`}
        </dd>
      </dl>
      <dl className="token-view__alternatives">
        {validation.byLayer.map((score, layer) => (
          <div key={layer} className="prob-bar" data-chosen={score >= validation.required || undefined}>
            <dt>layer {layer}</dt>
            <dd>
              <span className="prob-bar__track"><span className="prob-bar__fill" style={{ width: `${score * 100}%` }} /></span>
              {percent(score)}
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="section-heading">Controls</h3>
      <p className="hint">Each should fail. A control at or over {percent(validation.chanceBound)} succeeds; guessing reaches that with probability under 1%. Chance is {percent(validation.chance)}.</p>
      <dl className="step-detail__facts">
        {validation.controls.map((c) => (
          <Fragment key={c.control}>
            <dt>{c.control}</dt>
            <dd>
              {percent(c.score)}{" "}
              <span className={`badge ${c.succeeded ? "badge--warn" : "badge--ok"}`}>{c.succeeded ? "succeeded" : "failed, as it should"}</span>
            </dd>
          </Fragment>
        ))}
      </dl>
    </>
  );
}
