// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { parsed, traceFixture } from "../../../../test/traces";
import { useTraceStore } from "../store";
import { TimelineControls } from "./TimelineControls";

const open = (fixture: string) => useTraceStore.getState().setTrace(parsed(traceFixture(fixture)));

afterEach(cleanup);

describe("timeline", () => {
  test("T3: stepping forward moves to the next step that exists", () => {
    useTraceStore.getState().setTrace(parsed('{"events":[{"id":"a","step":10},{"id":"b","step":20},{"id":"c","step":30}]}'));
    const store = useTraceStore.getState();
    store.resetReplay();
    store.stepForward();
    expect(useTraceStore.getState().currentStep).toBe(20);
  });

  test("T1: a single-step trace draws a finite slider fill", () => {
    open("single-step.json");
    const { container } = render(<TimelineControls />);
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider?.style.getPropertyValue("--fill")).toBe("100%");
  });

  test("T2: timestamp steps render without throwing", () => {
    open("timestamp-steps.json");
    expect(() => render(<TimelineControls />)).not.toThrow();
  });
});
