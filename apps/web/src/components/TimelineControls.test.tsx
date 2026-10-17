// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect } from "vitest";
import { knownBug } from "../../../../test/knownBug";
import { parsed, traceFixture } from "../../../../test/traces";
import { useTraceStore } from "../store";
import { TimelineControls } from "./TimelineControls";

const open = (fixture: string) => useTraceStore.getState().setTrace(parsed(traceFixture(fixture)));

afterEach(cleanup);

describe("timeline", () => {
  knownBug("T1: a single-step trace draws a finite slider fill", () => {
    open("single-step.json");
    const { container } = render(<TimelineControls />);
    const fill = container.querySelector('input[type="range"]')?.getAttribute("style") ?? "";
    expect(fill).toContain("linear-gradient");
    expect(fill).not.toContain("NaN");
  });

  knownBug("T2: timestamp steps render without throwing", () => {
    open("timestamp-steps.json");
    expect(() => render(<TimelineControls />)).not.toThrow();
  });
});
