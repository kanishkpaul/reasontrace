// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TraceInput } from "./TraceInput";

afterEach(cleanup);

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
});
