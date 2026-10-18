import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { safetensorsBytes } from "../../../test/safetensors";
import { readSafetensors, SafetensorsError } from "./safetensors.ts";

const REFERENCE = join(import.meta.dirname, "../../../fixtures/tensors/qwen3-0.6b-residual-reference.safetensors");

describe("readSafetensors", () => {
  test("reads the float tensors of a file written by Python's safetensors, skipping token ids", () => {
    const tensors = readSafetensors(REFERENCE);
    expect([...tensors.keys()].sort()).toEqual(["layer.0", "layer.13", "layer.27"]);
    const layer = tensors.get("layer.0")!;
    expect(layer.shape).toEqual([15, 1024]);
    expect(layer.values).toHaveLength(15 * 1024);
    expect(Number.isFinite(layer.values[0])).toBe(true);
  });

  test("round-trips values and refuses dtypes it doesn't read", () => {
    const dir = mkdtempSync(join(tmpdir(), "rt-st-"));
    writeFileSync(join(dir, "a.safetensors"), safetensorsBytes({ x: { shape: [2], values: [1.5, -2] } }));
    expect([...readSafetensors(join(dir, "a.safetensors")).get("x")!.values]).toEqual([1.5, -2]);
    writeFileSync(join(dir, "b.safetensors"), safetensorsBytes({ x: { shape: [2], values: [1, 2], dtype: "F16" } }));
    expect(() => readSafetensors(join(dir, "b.safetensors"))).toThrow(SafetensorsError);
  });
});
