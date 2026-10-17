import { describe, expect, test } from "vitest";
import { readSse } from "./sse.ts";

const streamOf = (...chunks: string[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
});

const collect = async (...chunks: string[]) => {
  const out = [];
  for await (const message of readSse(streamOf(...chunks))) out.push(message);
  return out;
};

describe("readSse", () => {
  test("reads named and unnamed events, skipping comments", async () => {
    expect(await collect(": ping\n\nevent: delta\ndata: {\"a\":1}\n\ndata: x\n\n")).toEqual([
      { event: "delta", data: "{\"a\":1}" },
      { event: "message", data: "x" },
    ]);
  });

  test("joins multi-line data and handles CRLF split across chunks", async () => {
    expect(await collect("data: one\r", "\ndata: two\r\n\r\n")).toEqual([{ event: "message", data: "one\ntwo" }]);
  });

  test("a message cut mid-UTF-8 sequence still decodes", async () => {
    const bytes = new TextEncoder().encode("data: π\n\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    const out = [];
    for await (const message of readSse(stream)) out.push(message);
    expect(out).toEqual([{ event: "message", data: "π" }]);
  });

  test("a final message without a trailing blank line is still delivered", async () => {
    expect(await collect("data: last")).toEqual([{ event: "message", data: "last" }]);
  });
});
