import { describe, expect, test } from "vitest";
import { asciiBar } from "./ascii";

describe("an ASCII probability bar", () => {
  test("fills whole cells, then eighths, and pads to its width", () => {
    expect(asciiBar(0, 4)).toBe("····");
    expect(asciiBar(1, 4)).toBe("████");
    expect(asciiBar(0.5, 4)).toBe("██··");
    expect(asciiBar(0.3, 4)).toBe("█▎··");
  });

  test("is always its width, even out of range", () => {
    for (const p of [-1, 0.01, 0.333, 0.999, 2]) expect([...asciiBar(p)]).toHaveLength(12);
  });
});
