import { readFileSync } from "node:fs";

export interface Tensor {
  shape: number[];
  values: Float32Array;
}

/** Integer tensors, such as token ids, aren't activations and are skipped. */
const INTEGER = new Set(["I64", "I32", "I16", "I8", "U8", "BOOL"]);

export class SafetensorsError extends Error {}

/**
 * The float32 tensors in a safetensors file, which is what captures write.
 * The format is an 8-byte little-endian header length, a JSON header, then
 * raw data. Integer tensors are skipped; other float types are an error.
 */
export function readSafetensors(path: string): Map<string, Tensor> {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8) throw new SafetensorsError(`${path}: too short for a safetensors file.`);
  const headerLength = Number(view.getBigUint64(0, true));
  if (8 + headerLength > bytes.byteLength) throw new SafetensorsError(`${path}: the header runs past the end of the file.`);
  const header = JSON.parse(bytes.subarray(8, 8 + headerLength).toString("utf8")) as Record<string, { dtype: string; shape: number[]; data_offsets: [number, number] }>;
  const tensors = new Map<string, Tensor>();
  for (const [name, entry] of Object.entries(header)) {
    if (name === "__metadata__") continue;
    if (INTEGER.has(entry.dtype)) continue;
    if (entry.dtype !== "F32") throw new SafetensorsError(`${path}: ${name} is ${entry.dtype}; only F32 is read.`);
    const [start, end] = entry.data_offsets;
    const values = new Float32Array((end - start) / 4);
    const base = 8 + headerLength + start;
    for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(base + i * 4, true);
    tensors.set(name, { shape: entry.shape, values });
  }
  return tensors;
}
