import type { DerivationAttachment, ProofStep, ProofTreeAttachment } from "@reasontrace/format";
import { useMemo, useState } from "react";
import { EvidenceLabel, Unavailable } from "./EvidenceLabel";

/** A proof with at most this many steps opens whole; a larger one opens two levels deep. */
const OPEN_WHOLE = 30;
const OPEN_DEPTH = 2;

/** A symbolic engine's derivation, read from the engine (docs/CHARTER.md §2, `exact`). */
export function DerivationView({ attachment }: { attachment: DerivationAttachment }) {
  return (
    <section className="token-view">
      <h3 className="section-heading">{TITLE[attachment.kind]}</h3>
      <EvidenceLabel label="exact" />
      <dl className="step-detail__facts">
        <dt>Engine</dt><dd>{attachment.engine.name} {attachment.engine.version}</dd>
        <dt>Kind</dt><dd>{attachment.kind}</dd>
      </dl>
      <Derivation attachment={attachment} />
    </section>
  );
}

const TITLE: Record<DerivationAttachment["kind"], string> = {
  "symbolic.model/1": "Model",
  "symbolic.unsat_core/1": "Unsat core",
  "symbolic.proof_tree/1": "Proof",
};

function Derivation({ attachment }: { attachment: DerivationAttachment }) {
  switch (attachment.kind) {
    case "symbolic.model/1":
      return (
        <>
          <table className="finding__table">
            <thead><tr><th scope="col">Symbol</th><th scope="col">Sort</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {attachment.data.values.map((v) => <tr key={v.name}><th scope="row">{v.name}</th><td>{v.sort}</td><td>{v.value}</td></tr>)}
            </tbody>
          </table>
          <p className="hint">Symbols the engine left out can take any value.</p>
        </>
      );
    case "symbolic.unsat_core/1":
      return (
        <>
          <p className="hint">
            These {attachment.data.core.length} of the problem's {attachment.data.assertions} assertions cannot all hold. They come from a second check with each assertion tracked, so the proof can rest on a different set.
          </p>
          <ol className="proof-core">
            {attachment.data.core.map((c) => <li key={c.index}><span className="proof-step__index">{c.index}</span> <code>{c.formula}</code></li>)}
          </ol>
        </>
      );
    case "symbolic.proof_tree/1":
      return <ProofTree proof={attachment.data} />;
  }
}

/**
 * The proof from its conclusion down to the assertions it rests on. A step
 * used by several others opens under the first one that uses it; elsewhere it
 * is named, not repeated.
 */
export function ProofTree({ proof }: { proof: ProofTreeAttachment["data"] }) {
  const home = useMemo(() => {
    const first = new Map<number, number>();
    proof.steps.forEach((step, i) => step.premises.forEach((p) => {
      if (!first.has(p)) first.set(p, i);
    }));
    return first;
  }, [proof]);
  const openDepth = proof.steps.length <= OPEN_WHOLE ? Infinity : OPEN_DEPTH;

  return (
    <>
      <p className="hint">
        {proof.total} step{proof.total === 1 ? "" : "s"}. Each step follows from the steps under it by the rule it names.
      </p>
      {proof.truncated && <Unavailable reason={proof.truncated} />}
      <ul className="proof-tree" aria-label="Proof">
        <ProofNode index={0} proof={proof} home={home} parent={null} depth={0} openDepth={openDepth} />
      </ul>
    </>
  );
}

function ProofNode({ index, proof, home, parent, depth, openDepth }: {
  index: number;
  proof: ProofTreeAttachment["data"];
  home: Map<number, number>;
  parent: number | null;
  depth: number;
  openDepth: number;
}) {
  const [open, setOpen] = useState(depth < openDepth);
  const step: ProofStep | undefined = proof.steps[index];

  if (!step) {
    return <li className="proof-step proof-step--cut"><span className="proof-step__index">{index}</span> cut by the size limit</li>;
  }
  if (parent !== null && home.get(index) !== parent) {
    return (
      <li className="proof-step">
        <span className="proof-step__index">{index}</span> <code className="proof-step__conclusion">{step.conclusion}</code>
        <span className="hint"> · shown under step {home.get(index)}</span>
      </li>
    );
  }

  const premises = step.premises.length;
  return (
    <li className="proof-step">
      <div className="proof-step__line">
        {premises > 0 ? (
          <button type="button" className="btn btn--ghost btn--xs proof-step__toggle" aria-expanded={open} aria-label={`Step ${index}`} onClick={() => setOpen(!open)}>
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="proof-step__toggle" aria-hidden="true" />
        )}
        <span className="proof-step__index">{index}</span>
        <span className="badge badge--mono badge--muted">{step.rule}{step.params.length ? ` ${step.params.join(" ")}` : ""}</span>
        <code className="proof-step__conclusion">{step.conclusion}</code>
        {premises > 0 && !open && <span className="hint">{premises} premise{premises === 1 ? "" : "s"}</span>}
      </div>
      {open && premises > 0 && (
        <ul className="proof-tree">
          {step.premises.map((p, i) => <ProofNode key={`${i}-${p}`} index={p} proof={proof} home={home} parent={index} depth={depth + 1} openDepth={openDepth} />)}
        </ul>
      )}
    </li>
  );
}
