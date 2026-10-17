// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { parsed } from "../../../../test/traces";
import { useTraceStore } from "../store";
import { EvidenceLabel } from "./EvidenceLabel";
import { StepColumns } from "./StepColumns";

afterEach(cleanup);

describe("step columns", () => {
  test("a depth the trace can't show is one panel with its reason, not empty cells", () => {
    useTraceStore.getState().setTrace(parsed("Thought: a\nAction: b()\nObservation: c"));
    render(<StepColumns />);
    expect(screen.getByText(/unavailable: A trace file has no access to the model's internals/)).toBeTruthy();
    expect(screen.getByText(/unavailable: A trace file records what was emitted/)).toBeTruthy();
  });

  test("stated and observed events land in their own columns", () => {
    useTraceStore.getState().setTrace(parsed("Thought: plan\nAction: run()"));
    render(<StepColumns />);
    const [, behaviour, stated] = screen.getAllByRole("columnheader");
    expect(behaviour.textContent).toContain("· 1");
    expect(stated.textContent).toContain("· 1");
  });
});

describe("evidence labels", () => {
  test("weak labels always carry their badge", () => {
    render(<><EvidenceLabel label="inferred" /><EvidenceLabel label="decoded" /></>);
    expect(screen.getByText("analyst's guess")).toBeTruthy();
    expect(screen.getByText("unvalidated")).toBeTruthy();
  });

  test("stated text a provider summarised says so", () => {
    render(<EvidenceLabel label="stated" providerSummary />);
    expect(screen.getByText("summary by provider")).toBeTruthy();
  });
});
