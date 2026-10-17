// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { parsed } from "../../../../test/traces";
import { useTraceStore } from "../store";
import type { Run } from "@reasontrace/format";
import { EvidenceLabel } from "./EvidenceLabel";
import { StatusBar } from "./StatusBar";
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

/** A run as an Anthropic model returns it: a thinking summary and an answer, no probabilities, no internals. */
const anthropicRun: Run = {
  manifest: {
    formatVersion: 1,
    id: "20261018-000000-abcdef",
    title: "claude-opus-5-5 · hi",
    createdAt: "2026-10-18T00:00:00.000Z",
    source: { id: "anthropic", name: "Anthropic", tier: "frontier", baseUrl: "https://api.anthropic.com/v1" },
    request: { model: "claude-opus-5-5", prompt: "hi", maxTokens: 100, topLogprobs: 5, timeoutMs: 1000 },
    unavailable: [
      { depth: "probabilities", reason: "Anthropic's API does not return token probabilities." },
      { depth: "internals", reason: "Anthropic is reached over HTTP, which exposes no activations, and its weights are closed." },
    ],
    completion: { state: "timeout", reason: "No complete response within 1 s." },
    versions: {},
  },
  trace: {
    formatVersion: 1,
    title: "claude-opus-5-5 · hi",
    unavailable: [
      { depth: "probabilities", reason: "Anthropic's API does not return token probabilities." },
      { depth: "internals", reason: "Anthropic is reached over HTTP, which exposes no activations, and its weights are closed." },
    ],
    events: [
      { id: "reasoning", type: "reasoning", step: 1, depth: "stated", label: "stated", providerSummary: true, content: "Greet back.", supports: [] },
      { id: "failure", type: "failure", step: 2, depth: "behaviour", label: "observed", content: "No complete response within 1 s.", supports: [] },
    ],
  },
  attachments: [],
};

describe("a run's missing depths and ending", () => {
  test("each depth the model lacks renders as unavailable with the source's reason", () => {
    useTraceStore.getState().openRun(anthropicRun);
    render(<StepColumns />);
    expect(screen.getByText(/unavailable: Anthropic's API does not return token probabilities\./)).toBeTruthy();
    expect(screen.getByText(/unavailable: Anthropic is reached over HTTP/)).toBeTruthy();
    expect(screen.getByText("summary by provider")).toBeTruthy();
  });

  test("the status bar reports the run's tier and how it ended, not an imported file", () => {
    useTraceStore.getState().openRun(anthropicRun);
    render(<StatusBar trace={anthropicRun.trace} saved />);
    expect(screen.getByText(/tier frontier API · Anthropic/)).toBeTruthy();
    expect(screen.getByText(/timed out/)).toBeTruthy();
    expect(screen.queryByText(/imported trace file/)).toBeNull();
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
