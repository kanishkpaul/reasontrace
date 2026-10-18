import type { DerivationAttachment, ReasonTrace, Run, TranslationAttachment } from "@reasontrace/format";
import { Fragment, useState } from "react";
import { DerivationView } from "./DerivationView";
import { EvidenceLabel, Unavailable } from "./EvidenceLabel";

type Translation = TranslationAttachment["data"];

/**
 * A pipeline's handoff: the problem in words, the formula the model wrote for
 * it, and what the engine made of the formula, side by side. Each assertion
 * points back to the words it says it encodes, and the departures show where
 * the formula leaves them.
 */
export function HandoffView({ run, trace, translation, onInspect }: { run: Omit<Run, "trace">; trace: ReasonTrace; translation: Translation; onInspect: (eventId: string) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const derivations = run.attachments.filter((a): a is DerivationAttachment => a.label === "exact");
  const core = new Set(derivations.flatMap((a) => (a.kind === "symbolic.unsat_core/1" ? a.data.core.map((c) => c.index - 1) : [])));
  const answer = trace.events.find((e) => e.type === "final_answer" && e.step > (trace.events.find((t) => t.id === "translation")?.step ?? Infinity));
  const activation = trace.events.find((e) => e.type === "activation");
  const noInternals = trace.unavailable.find((u) => u.depth === "internals");
  const departing = translation.assertions.filter((a) => a.departures.length).length;
  const engine = run.manifest.pipeline?.engine ?? "engine";

  return (
    <div className="handoff">
      <section className="handoff__column" aria-label="Problem">
        <h2 className="section-heading">Problem</h2>
        <p className="handoff__text"><MarkedText translation={translation} active={active} /></p>
        {translation.unencoded.length > 0 && (
          <>
            <EvidenceLabel label="inferred" />
            <p className="hint">Not encoded by any assertion:</p>
            <ul className="handoff__list">{translation.unencoded.map((u) => <li key={u.span[0]}>{u.text}</li>)}</ul>
          </>
        )}
      </section>

      <section className="handoff__column" aria-label="Formula">
        <h2 className="section-heading">Formula</h2>
        <EvidenceLabel label="observed" />
        {translation.assertions.length === 0 ? (
          <>
            <p className="hint">No (assert …) form in what the model wrote:</p>
            <code className="handoff__code">{translation.formula}</code>
          </>
        ) : (
          <p className="hint">
            {translation.assertions.length} assertion{translation.assertions.length === 1 ? "" : "s"}, {departing ? `${departing} departing from the words they quote` : "none departing from the words they quote"}.
          </p>
        )}
        <ol className="handoff__assertions" aria-label="Assertions">
          {translation.assertions.map((a, i) => (
            <li key={i} className="handoff__assertion" data-departs={a.departures.length > 0 || undefined} aria-current={active === i || undefined}>
              <button type="button" className="btn btn--ghost btn--xs" aria-pressed={active === i} onClick={() => setActive(active === i ? null : i)}>
                Mark in the problem
              </button>
              <span className="proof-step__index">assertion {i + 1}</span>
              {core.has(i) && <span className="badge badge--outline">in the unsat core</span>}
              <p className="handoff__quote">
                <EvidenceLabel label="stated" /> {a.quote === null ? "no words quoted" : `“${a.quote}”`}
              </p>
              <code className="handoff__code">{a.formula}</code>
              {a.departures.map((d) => (
                <p key={d.check} className="handoff__departure">
                  <EvidenceLabel label="inferred" /> {d.check}: {d.detail}
                </p>
              ))}
            </li>
          ))}
        </ol>
        <details className="handoff__rules">
          <summary className="hint">How departures are found</summary>
          <ul className="handoff__list">{translation.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="hint">{translation.limitations}</p>
        </details>
      </section>

      <section className="handoff__column" aria-label={engine}>
        <h2 className="section-heading">{engine}</h2>
        {answer ? (
          <>
            <EvidenceLabel label={answer.label} />
            <p className="handoff__answer">{answer.content}</p>
          </>
        ) : (
          <Unavailable reason={run.manifest.completion.reason ?? `${engine} gave no result.`} />
        )}
        {derivations.map((a, i) => <DerivationView key={`${a.kind}-${i}`} attachment={a} />)}
        <h3 className="section-heading">Model internals at the handoff</h3>
        {activation ? (
          <>
            <p className="hint">{activation.content} The last position kept is the model's last token, where it hands the formula over.</p>
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => onInspect(activation.id)}>Inspect</button>
          </>
        ) : (
          <Unavailable reason={noInternals?.reason ?? "This run captured none."} />
        )}
      </section>
    </div>
  );
}

/** The problem with each quoted span marked, departing ones in their own colour. */
function MarkedText({ translation, active }: { translation: Translation; active: number | null }) {
  const { text, assertions } = translation;
  const marks = assertions.flatMap((a, i) => (a.span ? [{ i, span: a.span, departs: a.departures.length > 0 }] : [])).sort((a, b) => a.span[0] - b.span[0]);
  const pieces: { text: string; mark?: (typeof marks)[number] }[] = [];
  let at = 0;
  for (const mark of marks) {
    // A span that overlaps an earlier one is left to that one.
    if (mark.span[0] < at) continue;
    pieces.push({ text: text.slice(at, mark.span[0]) }, { text: text.slice(...mark.span), mark });
    at = mark.span[1];
  }
  pieces.push({ text: text.slice(at) });
  return (
    <>
      {pieces.map((p, k) => p.mark ? (
        <mark key={k} className="handoff__span" data-departs={p.mark.departs || undefined} aria-current={active === p.mark.i || undefined}>
          {p.text}<sup>{p.mark.i + 1}</sup>
        </mark>
      ) : <Fragment key={k}>{p.text}</Fragment>)}
    </>
  );
}
