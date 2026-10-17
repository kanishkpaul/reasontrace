import { describe, expect, test } from "vitest";
import { parsed } from "../../../../test/traces";
import { diagnosticsFor } from "./diagnostics";

describe("diagnosticsFor", () => {
  test("D2: computes a trace's diagnostics once, however many components ask", () => {
    const trace = parsed("Thought: a\nAction: b()");
    expect(diagnosticsFor(trace)).toBe(diagnosticsFor(trace));
  });
});
