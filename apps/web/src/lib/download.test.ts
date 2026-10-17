// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { downloadFile, fileNameFor } from "./download";

afterEach(() => vi.restoreAllMocks());

describe("downloads", () => {
  test("I8: titles become safe file names", () => {
    expect(fileNameFor("Agent: run 4/12 *final*", ".json")).toBe("Agent_run_4_12_final.json");
    expect(fileNameFor("///", ".md")).toBe("trace.md");
  });

  test("I7: the object URL is released after the download starts", () => {
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadFile("a.md", "# a", "text/markdown");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
