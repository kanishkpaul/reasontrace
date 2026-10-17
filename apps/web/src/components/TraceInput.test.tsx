// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  function choose(file: File) {
    render(<TraceInput />);
    fireEvent.change(screen.getByLabelText("Choose file"), { target: { files: [file] } });
  }

  test("I4: a chosen text file fills the input", async () => {
    choose(new File(["Thought: from a file"], "trace.txt", { type: "text/plain" }));
    await waitFor(() => expect((screen.getByLabelText("Trace input") as HTMLTextAreaElement).value).toBe("Thought: from a file"));
  });

  test("I4: a file over the size limit is refused with its size", () => {
    const file = new File(["x"], "huge.json");
    Object.defineProperty(file, "size", { value: 25e6 });
    choose(file);
    expect(screen.getByText(/huge.json is 25.0 MB/)).toBeTruthy();
  });

  test("I4: a binary file is refused", async () => {
    choose(new File([new Uint8Array([0x50, 0x4b, 0x00, 0x03])], "trace.zip"));
    await screen.findByText(/trace.zip is not a text file/);
  });
});
