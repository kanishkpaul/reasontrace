// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { AnswerCommitmentFinding } from "@reasontrace/format";
import { FindingView } from "./FindingView";

afterEach(cleanup);

/** The stored run of the answer-commitment finding over its fixed problem set. */
const finding: AnswerCommitmentFinding = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../fixtures/findings/answer-commitment-qwen3-0.6b.json"), "utf8"));
const never = finding.problems.findIndex((p) => p.answer !== null && p.internalCommitment === null);

describe("the answer-commitment finding", () => {
  test("the stored run has a problem whose answer is never decodable, and renders it", () => {
    expect(never).toBeGreaterThanOrEqual(0);
    render(<FindingView finding={finding} onClose={() => {}} />);
    const neverCount = finding.problems.filter((p) => p.answer !== null && p.internalCommitment === null).length;
    expect(screen.getByText("Never decodable").nextElementSibling?.textContent).toBe(`${neverCount} of ${finding.summary.answered}`);
    expect(screen.getAllByText("never, not even before the answer")).toHaveLength(neverCount);
  });

  test("every control is listed with its result, beside the model's own readout", () => {
    render(<FindingView finding={finding} onClose={() => {}} />);
    const table = screen.getByRole("columnheader", { name: "Readout" }).closest("table")!;
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.querySelector("th")?.textContent);
    expect(rows).toEqual(["the model", "shuffled inputs", "random direction", "untrained weights"]);
    expect(within(table).getAllByText(/failed, as it should|succeeded/)).toHaveLength(3);
  });

  test("an unvalidated readout says so, with the reason", () => {
    render(<FindingView finding={finding} onClose={() => {}} />);
    if (finding.summary.status === "unvalidated") {
      expect(screen.getByText(`Unvalidated: ${finding.summary.reason}`)).toBeTruthy();
      expect(screen.getAllByText("unvalidated").length).toBeGreaterThan(0);
    } else {
      expect(screen.getByText("validated")).toBeTruthy();
    }
  });

  test("opening a problem shows each step with the stated and decodable points marked", () => {
    render(<FindingView finding={finding} onClose={() => {}} />);
    const problem = finding.problems[never];
    fireEvent.click(screen.getByRole("button", { name: problem.prompt.replace(/\? .*/, "?") }));
    const steps = screen.getByRole("heading", { name: problem.prompt }).closest("section")!;
    // Every reasoning step, then the position before the answer.
    expect(within(steps).getAllByRole("listitem")).toHaveLength(problem.steps.length + 1);
    expect(within(steps).getByText("stated")).toBeTruthy();
    expect(within(steps).queryByText("decodable from here")).toBeNull();
    expect(within(steps).getAllByRole("img")[0].getAttribute("aria-label")).toMatch(new RegExp(`of ${finding.layers} layers$`));
  });
});
