/** A safetensors file holding float32 tensors, written the way the format specifies. */
export function safetensorsBytes(tensors: Record<string, { shape: number[]; values: number[]; dtype?: string }>): Buffer {
  let offset = 0;
  const header: Record<string, unknown> = {};
  const parts: Buffer[] = [];
  for (const [name, { shape, values, dtype = "F32" }] of Object.entries(tensors)) {
    const data = Buffer.from(new Float32Array(values).buffer);
    header[name] = { dtype, shape, data_offsets: [offset, offset + data.length] };
    offset += data.length;
    parts.push(data);
  }
  const json = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(json.length));
  return Buffer.concat([length, json, ...parts]);
}
