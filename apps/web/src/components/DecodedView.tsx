import type { DecodedAttachment, LogitLensAttachment, SaeFeaturesAttachment, Validation } from "@reasontrace/format";
import { Fragment, useState } from "react";
import { shown } from "../lib/tokens";
import { validationOf } from "../lib/validation";
import { AsciiBar } from "./AsciiBar";
import { EvidenceLabel } from "./EvidenceLabel";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** How long a field's value may run before it is cut, in characters. */
const FIELD_LIMIT = 160;

/**
 * A decoder's attachment: its method, its validation and its reading. A kind
 * with no view of its own shows its fields as they are stored
 * (docs/ARCHITECTURE.md §4).
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
      <Reading attachment={attachment} />
    </section>
  );
}

function Reading({ attachment }: { attachment: DecodedAttachment }) {
  switch (attachment.kind) {
    case "lens.logit/1":
      return <LensView data={attachment.data} />;
    case "sae.features/1":
      return <SaeView data={attachment.data} />;
    default:
      return <StoredFields data={(attachment as { data: Record<string, unknown> }).data} />;
  }
}

function StoredFields({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <h3 className="section-heading">Stored fields</h3>
      <dl className="step-detail__facts">
        {Object.entries(data).map(([key, value]) => {
          const text = JSON.stringify(value);
          return (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{text.length > FIELD_LIMIT ? `${text.slice(0, FIELD_LIMIT)}…` : text}</dd>
            </Fragment>
          );
        })}
      </dl>
    </>
  );
}

/** Picks one of the captured positions; the last is shown first. */
function usePosition(tokens: string[]) {
  const [index, setIndex] = useState(tokens.length - 1);
  return [Math.min(index, tokens.length - 1), setIndex] as const;
}

function PositionPicker({ positions, tokens, index, onChange }: { positions: number[]; tokens: string[]; index: number; onChange: (i: number) => void }) {
  if (positions.length === 1) {
    return <p className="hint">At position {positions[0]}, token {JSON.stringify(tokens[0])}.</p>;
  }
  return (
    <select className="field" aria-label="Position" value={index} onChange={(e) => onChange(Number(e.target.value))}>
      {positions.map((p, i) => <option key={p} value={i}>position {p}: {shown(tokens[i])}</option>)}
    </select>
  );
}

/** The likeliest token at each layer, read as if that layer were the last. */
function LensView({ data }: { data: LogitLensAttachment["data"] }) {
  const [index, setIndex] = usePosition(data.tokens);
  return (
    <>
      <h3 className="section-heading">Likeliest next token, by layer</h3>
      <PositionPicker positions={data.positions} tokens={data.tokens} index={index} onChange={setIndex} />
      <dl className="token-view__alternatives">
        {data.layers.map((layer, l) => {
          const [first, ...rest] = data.top[l][index];
          const p = Math.exp(first.logprob);
          return (
            <div key={layer} className="prob-bar" title={rest.map((t) => `${shown(t.token)} ${percent(Math.exp(t.logprob))}`).join(", ")}>
              <dt>layer {layer}</dt>
              <dd>
                <span className="lens-token">{shown(first.token)}</span>
                <AsciiBar fraction={p} />
                {percent(p)}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}

/** The SAE's strongest features at a position, and how well it reconstructs the run's activations. */
function SaeView({ data }: { data: SaeFeaturesAttachment["data"] }) {
  const [index, setIndex] = usePosition(data.tokens);
  return (
    <>
      <dl className="step-detail__facts">
        <dt>SAE</dt><dd>{data.release} / {data.saeId}</dd>
        <dt>Reads</dt><dd>layer {data.layer}, {data.width.toLocaleString("en")} features</dd>
        <dt>FVU</dt>
        <dd>
          {data.fvu === null
            ? `not estimated: ${data.fvuPositions} position${data.fvuPositions === 1 ? "" : "s"}, too few to estimate the variance`
            : `${data.fvu.toFixed(3)} over ${data.fvuPositions} positions`}
        </dd>
      </dl>
      <h3 className="section-heading">Strongest features</h3>
      <PositionPicker positions={data.positions} tokens={data.tokens} index={index} onChange={setIndex} />
      <p className="hint">
        {data.l0[index]} features active{data.special[index] ? "; a special token, left out of FVU" : ""}. A feature is a number in the SAE's dictionary; what it stands for is not recorded here.
      </p>
      <dl className="step-detail__facts">
        {data.top[index].map((f) => (
          <Fragment key={f.feature}>
            <dt>feature {f.feature}</dt><dd>{f.activation.toFixed(1)}</dd>
          </Fragment>
        ))}
      </dl>
    </>
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
              <AsciiBar fraction={score} />
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
