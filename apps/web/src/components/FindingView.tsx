import type { AnswerCommitmentFinding, CommitmentMeasures, DigitReadout } from "@reasontrace/format";
import { useState } from "react";
import { AsciiBar } from "./AsciiBar";
import { EvidenceLabel } from "./EvidenceLabel";

type Problem = AnswerCommitmentFinding["problems"][number];

const percent = (value: number) => `${Math.round(value * 100)}%`;

function internalWords(problem: Problem): string {
  if (problem.internalCommitment === null) return "never, not even before the answer";
  if (problem.internalCommitment === problem.steps.length) return "only at the answer";
  return `step ${problem.internalCommitment + 1}`;
}

/**
 * The answer-commitment finding: across a fixed problem set, the step where
 * the model's answer becomes decodable from its internals, next to the step
 * where its stated reasoning first gives the answer, with the controls that
 * say how far the decoding can be trusted.
 */
export function FindingView({ finding, onClose }: { finding: AnswerCommitmentFinding; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const { summary } = finding;
  const answered = finding.problems.filter((p) => p.answer !== null);
  const counts = {
    early: answered.filter((p) => p.internalCommitment !== null && p.statedCommitment !== null && p.internalCommitment < p.statedCommitment).length,
    atAnswer: answered.filter((p) => p.internalCommitment === p.steps.length).length,
    never: answered.filter((p) => p.internalCommitment === null).length,
  };
  const problem = open === null ? null : finding.problems[open];

  return (
    <div className="finding-page">
      <header className="app__bar">
        <span className="app__glyph" aria-hidden="true">∴</span>
        <h1 className="app__title">{finding.title}</h1>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
      </header>

      <div className="finding__body">
        <section className="finding__section">
          <p className="hint">
            {finding.model.name} ({finding.model.repo}@{finding.model.revision.slice(0, 7)}), {finding.runtime.dtype} on {finding.runtime.device}, greedy, seed {finding.runtime.seed}, up to {finding.runtime.maxTokens} tokens. {summary.answered} of {finding.problems.length} problems answered with one digit.
          </p>
          <dl className="step-detail__facts">
            <dt>Earlier than stated</dt><dd>{counts.early} of {summary.answered}</dd>
            <dt>Only at the answer</dt><dd>{counts.atAnswer} of {summary.answered}</dd>
            <dt>Never decodable</dt><dd>{counts.never} of {summary.answered}</dd>
          </dl>
        </section>

        <section className="finding__section">
          <h2 className="section-heading">How each point is found</h2>
          <EvidenceLabel label="decoded" validated={summary.status === "validated"} />
          <p className="hint">Internal: {finding.rules.internal}</p>
          <EvidenceLabel label="inferred" />
          <p className="hint">Stated: {finding.rules.stated}</p>
          <p className="hint">
            The lens itself is {finding.lens.validation.status} on the planted circuit ({finding.lens.name}, version {finding.lens.version}).
          </p>
        </section>

        <section className="finding__section">
          <h2 className="section-heading">Controls</h2>
          {summary.reason && <p className="hint">Unvalidated: {summary.reason}</p>}
          <p className="hint">
            A control that decodes the answer at the answer position in {percent(summary.chanceBound)} or more of problems succeeds, and the readout is unvalidated. Chance is {percent(summary.chance)}.
          </p>
          <table className="finding__table">
            <thead>
              <tr><th scope="col">Readout</th><th scope="col">At the answer</th><th scope="col">Steps decodable</th><th scope="col">Before stated</th><th scope="col">Result</th></tr>
            </thead>
            <tbody>
              <MeasuresRow name="the model" measures={summary.real} />
              {summary.controls.map((c) => (
                <MeasuresRow key={c.control} name={c.control} measures={c} result={c.succeeded ? "succeeded" : "failed, as it should"} warn={c.succeeded} />
              ))}
            </tbody>
          </table>
        </section>

        <section className="finding__section">
          <h2 className="section-heading">Problems</h2>
          <table className="finding__table">
            <thead>
              <tr><th scope="col">Problem</th><th scope="col">Answer</th><th scope="col">Stated</th><th scope="col">Decodable</th></tr>
            </thead>
            <tbody>
              {finding.problems.map((p, i) => (
                <tr key={p.prompt} aria-selected={open === i}>
                  <td><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(open === i ? null : i)}>{p.prompt.replace(/\? .*/, "?")}</button></td>
                  <td>{p.answer === null ? p.excluded : `${p.answer}${p.answer === p.correct ? "" : ` (correct: ${p.correct})`}`}</td>
                  <td>{p.statedCommitment === null ? "never" : `step ${p.statedCommitment + 1}`}</td>
                  <td>{p.answer === null ? "" : internalWords(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {problem && problem.answer !== null && problem.answerStep && <ProblemSteps problem={problem} answer={problem.answer} answerStep={problem.answerStep} layers={finding.layers} />}
      </div>
    </div>
  );
}

function MeasuresRow({ name, measures, result, warn }: { name: string; measures: CommitmentMeasures; result?: string; warn?: boolean }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td><AsciiBar fraction={measures.atAnswer} /> {percent(measures.atAnswer)}</td>
      <td><AsciiBar fraction={measures.steps} /> {percent(measures.steps)}</td>
      <td><AsciiBar fraction={measures.beforeStated} /> {percent(measures.beforeStated)}</td>
      <td>{result && <span className={`badge ${warn ? "badge--warn" : "badge--ok"}`}>{result}</span>}</td>
    </tr>
  );
}

/** One problem's reasoning, step by step, with the answer's standing at each layer. */
function ProblemSteps({ problem, answer, answerStep, layers }: { problem: Problem; answer: number; answerStep: DigitReadout; layers: number }) {
  return (
    <section className="finding__section">
      <h2 className="section-heading">{problem.prompt}</h2>
      <p className="hint">
        Each cell is a layer, first to last: filled where the answer, {answer}, is the top digit there. A step is decodable when most cells in the second half are filled.
      </p>
      <ol className="finding__steps">
        {problem.steps.map((step, i) => (
          <StepRow key={i} label={`${i + 1}`} text={step.text} readout={step} answer={answer} layers={layers}
            marks={[i === problem.statedCommitment && "stated", i === problem.internalCommitment && "decodable from here"]} />
        ))}
        <StepRow label="→" text={`Before the answer: ${problem.output.trim().split("\n").at(-1)}`} readout={answerStep} answer={answer} layers={layers}
          marks={[problem.internalCommitment === problem.steps.length && "decodable from here"]} />
      </ol>
    </section>
  );
}

function StepRow({ label, text, readout, answer, layers, marks }: { label: string; text: string; readout: DigitReadout; answer: number; layers: number; marks: (string | false)[] }) {
  return (
    <li className="finding__step" data-decodable={readout.decodable || undefined}>
      <span className="finding__step-number">{label}</span>
      <span className="finding__step-text">
        {text}
        {marks.filter(Boolean).map((m) => <span key={m as string} className="badge badge--outline">{m}</span>)}
      </span>
      <span className="layer-strip" role="img" aria-label={`answer on top at ${readout.top.filter((t) => t === answer).length} of ${layers} layers`}>
        {readout.top.map((top, layer) => <span key={layer} className="layer-strip__cell" data-on={top === answer || undefined} />)}
      </span>
    </li>
  );
}
