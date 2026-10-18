// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Attachment, ProofStep, ProofTreeAttachment } from "@reasontrace/format";
import { DerivationView, ProofTree } from "./DerivationView";

afterEach(cleanup);

/** What the z3 engine recorded for a problem, hand-checked (packages/engines/z3/fixtures). */
const recorded = (name: string): Attachment[] =>
  JSON.parse(readFileSync(join(import.meta.dirname, "../../../../packages/engines/z3/fixtures", `${name}.json`), "utf8")).attachments;

const step = (premises: number[], conclusion = `c${premises.join("")}`): ProofStep => ({ rule: "mp", params: [], premises, conclusion });
const proof = (steps: ProofStep[], total = steps.length, truncated: string | null = null): ProofTreeAttachment["data"] => ({ steps, total, limit: 1000, truncated });

describe("a proof", () => {
  test("a small one opens whole, every step with its rule and conclusion", () => {
    const [tree] = recorded("modus-ponens");
    render(<DerivationView attachment={tree as ProofTreeAttachment} />);
    expect(screen.getByText("exact")).toBeTruthy();
    expect(screen.getByText("z3 5.1.0")).toBeTruthy();
    for (const conclusion of ["false", "q", "(not q)", "(or q (not p))", "p", "(=> p q)", "(= (=> p q) (or q (not p)))"]) {
      expect(screen.getByText(conclusion)).toBeTruthy();
    }
    expect(screen.getAllByText("asserted")).toHaveLength(3);
  });

  test("a large one opens two levels deep and expands on demand", () => {
    // A chain of 40 steps, each resting on the next.
    render(<ProofTree proof={proof(Array.from({ length: 40 }, (_, i) => step(i < 39 ? [i + 1] : [], `c${i}`)))} />);
    expect(screen.getByText("c2")).toBeTruthy();
    expect(screen.queryByText("c3")).toBeNull();
    expect(screen.getByText("1 premise")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Step 2" }));
    expect(screen.getByText("c3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step 2" }).getAttribute("aria-expanded")).toBe("true");
  });

  test("a step two others use opens under the first and is named under the second", () => {
    render(<ProofTree proof={proof([step([1, 2], "false"), step([3], "a"), step([3], "b"), step([], "shared")])} />);
    expect(screen.getAllByText("shared")).toHaveLength(2);
    expect(screen.getByText("· shown under step 1")).toBeTruthy();
  });

  test("one cut by the size limit says so, with the reason", () => {
    const reason = "The proof has 1203 steps, over the limit of 2; the 2 nearest the conclusion are kept.";
    render(<ProofTree proof={proof([step([1], "false"), step([2, 3], "q")], 1203, reason)} />);
    expect(screen.getByText(`unavailable: ${reason}`)).toBeTruthy();
    expect(screen.getAllByText("cut by the size limit")).toHaveLength(2);
  });
});

describe("a model and an unsat core", () => {
  test("a model lists each symbol's value", () => {
    const [model] = recorded("sum");
    render(<DerivationView attachment={model as Extract<Attachment, { kind: "symbolic.model/1" }>} />);
    expect(screen.getByRole("rowheader", { name: "x" }).nextElementSibling?.nextElementSibling?.textContent).toBe("6");
    expect(screen.getByRole("rowheader", { name: "y" }).nextElementSibling?.nextElementSibling?.textContent).toBe("4");
  });

  test("a core lists its assertions by number and says it came from a second check", () => {
    const [, core] = recorded("bounds");
    render(<DerivationView attachment={core as Extract<Attachment, { kind: "symbolic.unsat_core/1" }>} />);
    expect(screen.getByText("(> x 2)")).toBeTruthy();
    expect(screen.getByText("(< x 1)")).toBeTruthy();
    expect(screen.queryByText("(< x 5)")).toBeNull();
    expect(screen.getByText(/These 2 of the problem's 3 assertions cannot all hold. .*second check/)).toBeTruthy();
  });
});
