// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Run } from "@reasontrace/format";
import { translationOf } from "../lib/pipeline";
import { HandoffView } from "./HandoffView";

afterEach(cleanup);

/** A pipeline run whose model changed one number, 34 to 43, as the server stores it (fixtures/pipelines). */
const run: Run = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../fixtures/pipelines/ages-deliberate-error.run.json"), "utf8"));
const translation = translationOf(run)!;

const show = () => render(<HandoffView run={run} trace={run.trace} translation={translation} onInspect={() => {}} />);

describe("the handoff view of a translation with a deliberate error", () => {
  test("the departing assertion says how it departs, and only it", () => {
    show();
    const formula = within(screen.getByRole("region", { name: "Formula" }));
    expect(formula.getByText("1 departing from the words they quote", { exact: false })).toBeTruthy();
    const items = within(formula.getByRole("list", { name: "Assertions" })).getAllByRole("listitem");
    expect(items.map((li) => li.hasAttribute("data-departs"))).toEqual([false, false, true]);
    expect(within(items[2]).getByText("numbers: The words give 34; the assertion has 43.")).toBeTruthy();
    expect(within(items[2]).getByText("“Ben is younger than 34”")).toBeTruthy();
    expect(within(items[2]).getByText("(assert (< ben 43))")).toBeTruthy();
  });

  test("the problem marks the words each assertion quotes, the departing ones apart", () => {
    show();
    const marks = [...screen.getByRole("region", { name: "Problem" }).querySelectorAll("mark")];
    expect(marks.map((m) => [m.textContent, m.hasAttribute("data-departs")])).toEqual([
      ["Ann is 301", false],
      ["Ben is more than 5 years older than Ann2", false],
      ["Ben is younger than 343", true],
    ]);
  });

  test("marking an assertion picks out its words in the problem", () => {
    show();
    fireEvent.click(within(screen.getByRole("region", { name: "Formula" })).getAllByRole("button", { name: "Mark in the problem" })[2]);
    const current = screen.getByRole("region", { name: "Problem" }).querySelector("mark[aria-current]");
    expect(current?.textContent).toBe("Ben is younger than 343");
  });

  test("the engine's answer and model sit beside it, and the model's internals say why they are missing", () => {
    show();
    const solver = within(screen.getByRole("region", { name: "z3" }));
    expect(solver.getByText("sat")).toBeTruthy();
    expect(solver.getByRole("rowheader", { name: "ben" }).nextElementSibling?.nextElementSibling?.textContent).toBe("36");
    expect(solver.getByText(/unavailable: llama\.cpp server is reached over HTTP/)).toBeTruthy();
  });
});
