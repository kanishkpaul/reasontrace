// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TraceInput } from "./TraceInput";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function submit(text: string) {
  const onLoaded = vi.fn();
  render(<TraceInput onLoaded={onLoaded} />);
  fireEvent.change(screen.getByLabelText("Trace input"), { target: { value: text } });
  fireEvent.click(screen.getByText("Open trace"));
  return onLoaded;
}

describe("trace input", () => {
  test("I2: a trace that loads with warnings still closes the import panel", () => {
    const onLoaded = submit('{"events":[{"id":"a","type":"observation","step":1,"links":["missing"]}]}');
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(screen.getByText(/loaded with warnings/)).toBeTruthy();
  });

  test("I3: an earlier message's timer does not hide a newer message", () => {
    vi.useFakeTimers();
    submit("Thought: a");
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.change(screen.getByLabelText("Trace input"), { target: { value: '{"events":[{"id":"a","step":1,"links":["gone"]}]}' } });
    fireEvent.click(screen.getByText("Open trace"));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText(/loaded with warnings/)).not.toBeNull();
  });
});
