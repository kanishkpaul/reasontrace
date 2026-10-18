// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, test } from "vitest";
import type { CompletionState, EvidenceLabel as Label } from "@reasontrace/format";
import { Ending, EvidenceLabel, Unavailable } from "./EvidenceLabel";

afterEach(cleanup);

const LABELS: Label[] = ["observed", "stated", "exact", "measured", "decoded", "inferred"];
const ENDINGS: CompletionState[] = ["running", "complete", "truncated", "refused", "error", "timeout", "aborted"];

/** What a reader without colour gets: the mark, then the words, from the rendered page. */
function read(element: ReactElement): { mark: string; words: string } {
  const { container } = render(element);
  const root = container.firstElementChild!;
  const mark = root.querySelector("[aria-hidden]")!.textContent!;
  const words = root.textContent!.replace(mark, "").trim();
  cleanup();
  return { mark, words };
}

describe("evidence labels, run endings and unavailable, without colour", () => {
  const shown = [
    ...LABELS.map((label) => ({ name: label, ...read(<EvidenceLabel label={label} />) })),
    { name: "decoded, validated", ...read(<EvidenceLabel label="decoded" validated />) },
    { name: "unavailable", ...read(<Unavailable reason="the reason" />) },
    ...ENDINGS.map((state) => ({ name: `ended ${state}`, ...read(<Ending state={state} />) })),
  ];

  test("each has a mark of its own", () => {
    for (const { name, mark } of shown) expect(mark.trim(), name).not.toBe("");
    expect(new Set(shown.map((s) => s.mark)).size).toBe(shown.length);
  });

  test("each has words of its own", () => {
    for (const { name, words } of shown) expect(words, name).not.toBe("");
    expect(new Set(shown.map((s) => s.words)).size).toBe(shown.length);
  });

  test("the words name what each is", () => {
    expect(Object.fromEntries(shown.map((s) => [s.name, s.words]))).toEqual({
      observed: "observed",
      stated: "stated",
      exact: "exact",
      measured: "measured",
      decoded: "decodedunvalidated",
      inferred: "inferredanalyst's guess",
      "decoded, validated": "decodedvalidated",
      unavailable: "unavailable: the reason",
      "ended running": "running",
      "ended complete": "complete",
      "ended truncated": "truncated",
      "ended refused": "refused",
      "ended error": "error",
      "ended timeout": "timed out",
      "ended aborted": "stopped",
    });
  });
});
