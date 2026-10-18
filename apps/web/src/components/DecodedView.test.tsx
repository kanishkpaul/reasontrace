// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { DecodedAttachment, Run, Validation } from "@reasontrace/format";
import { useTraceStore } from "../store";
import { DecodedView } from "./DecodedView";
import { NodeInspector } from "./NodeInspector";

afterEach(cleanup);

/** The logit lens's validation as the sidecar's harness wrote it. */
const stored: Validation = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../fixtures/validation/lens.logit-1.json"), "utf8"));

const lens = (validation: Validation | null, version = "1"): DecodedAttachment => ({
  kind: "lens.logit/1",
  eventId: "activations",
  label: "decoded",
  method: { name: "logit lens", version },
  validation,
  data: { layers: [0, 1], top: [["Paris"], ["Paris"]] },
});

describe("a decoded attachment", () => {
  test("validated by the harness, it shows the ground truth and each control failing", () => {
    render(<DecodedView attachment={lens(stored)} />);
    expect(screen.getByText("validated")).toBeTruthy();
    expect(screen.queryByText("unvalidated")).toBeNull();
    expect(screen.getByText(/hand-written weights/)).toBeTruthy();
    expect(screen.getByText(/from layer 2/)).toBeTruthy();
    expect(screen.getAllByText("failed, as it should")).toHaveLength(3);
  });

  test("with no control run, it is unvalidated and says so", () => {
    render(<DecodedView attachment={lens(null)} />);
    expect(screen.getByText("unvalidated")).toBeTruthy();
    expect(screen.getByText(/No control was run/)).toBeTruthy();
  });

  test("a control that also succeeds leaves it unvalidated, with the control named", () => {
    const reason = "A control decoded the variable too: untrained weights (100%), against a chance bound of 9%.";
    const failed: Validation = {
      ...stored,
      status: "unvalidated",
      reason,
      controls: stored.controls.map((c) => (c.control === "untrained weights" ? { ...c, score: 1, succeeded: true } : c)),
    };
    render(<DecodedView attachment={lens(failed)} />);
    expect(screen.getByText("unvalidated")).toBeTruthy();
    expect(screen.getByText(`Unvalidated: ${reason}`)).toBeTruthy();
    expect(screen.getByText("succeeded")).toBeTruthy();
  });

  test("a validation of another version of the decoder does not count", () => {
    render(<DecodedView attachment={lens(stored, "2")} />);
    expect(screen.getByText("unvalidated")).toBeTruthy();
    expect(screen.getByText(/validation is for logit lens version 1/)).toBeTruthy();
  });

  test("the step detail shows it under the event it decodes", () => {
    const run: Run = {
      manifest: {
        formatVersion: 1,
        id: "20261018-000000-abcdef",
        title: "qwen3-0.6b · hi",
        createdAt: "2026-10-18T00:00:00.000Z",
        source: { id: "weights", name: "Local weights", tier: "full", baseUrl: "stdio" },
        request: { model: "qwen3-0.6b", prompt: "hi", maxTokens: 10, topLogprobs: 0, timeoutMs: 1000 },
        unavailable: [],
        completion: { state: "complete" },
        versions: {},
      },
      trace: {
        formatVersion: 1,
        title: "qwen3-0.6b · hi",
        unavailable: [],
        events: [{ id: "activations", type: "activation", step: 1, depth: "internals", label: "measured", content: "Residual stream", supports: [] }],
      },
      attachments: [lens(stored)],
    };
    useTraceStore.getState().openRun(run);
    useTraceStore.getState().setSelectedNodeId("activations");
    render(<NodeInspector />);
    const section = screen.getByRole("heading", { name: "logit lens" }).closest("section")!;
    expect(within(section).getByText("validated")).toBeTruthy();
    expect(within(section).getByText("lens.logit/1")).toBeTruthy();
  });
});
