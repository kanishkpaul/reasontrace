import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventSink, RunOutcome } from "@reasontrace/core";
import type { Attachment, ProofTreeAttachment, TraceEvent } from "@reasontrace/format";
import { describe, expect, test } from "vitest";
import { PROOF_LIMIT, z3Engine } from "./engine.ts";

const FIXTURES = join(import.meta.dirname, "../fixtures");

async function solve(problem: string, signal = new AbortController().signal) {
  const events: TraceEvent[] = [];
  const attachments: Attachment[] = [];
  const sink: EventSink = { delta() {}, event: (e) => events.push(e), attach: (a) => attachments.push(a) };
  const outcome: RunOutcome = await z3Engine().solve({ engine: "z3", problem, timeoutMs: 10_000 }, sink, signal);
  return { outcome, events, attachments };
}

/** n + 1 propositions where each implies the next, the first holds and the last does not. */
function chain(n: number): string {
  const lines = Array.from({ length: n + 1 }, (_, i) => `(declare-const p${i} Bool)`);
  for (let i = 0; i < n; i++) lines.push(`(assert (=> p${i} p${i + 1}))`);
  return [...lines, "(assert p0)", `(assert (not p${n}))`].join("\n");
}

/** n pigeons in n - 1 holes: unsatisfiable, and slow enough to stop partway. */
function pigeonhole(n: number): string {
  const p = (i: number, j: number) => `p${i}_${j}`;
  const lines: string[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n - 1; j++) lines.push(`(declare-const ${p(i, j)} Bool)`);
  for (let i = 0; i < n; i++) lines.push(`(assert (or ${Array.from({ length: n - 1 }, (_, j) => p(i, j)).join(" ")}))`);
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) lines.push(`(assert (not (and ${p(i, j)} ${p(k, j)})))`);
  return lines.join("\n");
}

describe("z3 derivations of small known problems", () => {
  test.each(["modus-ponens", "bounds", "sum", "lookup"])("%s matches its hand-checked fixture", async (name) => {
    const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
    const { outcome, events, attachments } = await solve(readFileSync(join(FIXTURES, `${name}.smt2`), "utf8"));
    expect({ outcome, events, attachments }).toEqual({ outcome: expected.outcome, events: expected.events, attachments: expected.attachments });
  });

  test("the answer rests on the derivations, which are exact", async () => {
    const { events } = await solve(readFileSync(join(FIXTURES, "bounds.smt2"), "utf8"));
    const answer = events.find((e) => e.type === "final_answer")!;
    expect(answer).toMatchObject({ content: "unsat", label: "observed", depth: "behaviour" });
    const derivations = events.filter((e) => e.type === "derivation");
    expect(answer.supports).toEqual(derivations.map((e) => e.id));
    expect(derivations.every((e) => e.label === "exact" && e.depth === "internals")).toBe(true);
  });
});

describe("the proof size limit", () => {
  test("a proof over the limit keeps the steps nearest the conclusion and records why", async () => {
    const { events, attachments } = await solve(chain(300));
    const proof = attachments.find((a): a is ProofTreeAttachment => a.kind === "symbolic.proof_tree/1")!.data;
    expect(proof.total).toBeGreaterThan(PROOF_LIMIT);
    expect(proof.steps).toHaveLength(PROOF_LIMIT);
    expect(proof.truncated).toBe(`The proof has ${proof.total} steps, over the limit of ${PROOF_LIMIT}; the ${PROOF_LIMIT} nearest the conclusion are kept.`);
    expect(proof.steps[0].conclusion).toBe("false");
    // Kept steps still name the premises that were cut.
    expect(proof.steps.some((s) => s.premises.some((p) => p >= PROOF_LIMIT))).toBe(true);
    expect(proof.steps.every((s) => s.premises.every((p) => p < proof.total))).toBe(true);
    expect(events.find((e) => e.type === "derivation")?.content).toBe(`Proof of unsatisfiability: ${proof.total} steps, ${PROOF_LIMIT} kept`);
    expect(events.find((e) => e.content.startsWith("Unsat core"))?.content).toBe("Unsat core: 302 assertions of 302");
  });

  test("a proof under the limit is kept whole", async () => {
    const { attachments } = await solve(chain(10));
    const proof = attachments.find((a): a is ProofTreeAttachment => a.kind === "symbolic.proof_tree/1")!.data;
    expect(proof.truncated).toBeNull();
    expect(proof.steps).toHaveLength(proof.total);
  });
});

describe("runs that end without a derivation", () => {
  test("a problem z3 cannot read is an error with z3's message", async () => {
    const { outcome, events } = await solve("(assert (> x 1))");
    expect(outcome.completion.state).toBe("error");
    expect(outcome.completion.reason).toMatch(/^Could not read the problem: .*unknown constant x"\)$/);
    expect(events).toEqual([]);
  });

  test("a solve stopped by its timeout is recorded as timed out", async () => {
    const { outcome, events } = await solve(pigeonhole(10), AbortSignal.timeout(200));
    expect(outcome.completion.state).toBe("timeout");
    expect(events).toEqual([]);
  });

  test("a solve stopped by hand is recorded as stopped", async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 200);
    const { outcome } = await solve(pigeonhole(10), stop.signal);
    expect(outcome.completion.state).toBe("aborted");
  });
});
