import { readFileSync } from "node:fs";
import type { Attachment, TraceEvent } from "@reasontrace/format";

/** A provider response as stored under a source's `fixtures/` folder. */
export interface HttpFixture {
  /** Where the response came from: a server and model, or the documentation it was written from. */
  recorded: string;
  status: number;
  contentType: string;
  body: string;
}

export const readFixture = (dir: string, name: string): HttpFixture =>
  JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8")) as HttpFixture;

export interface Replay {
  /** Stands in for `fetch`, answering each call with the next response. */
  fetch: typeof fetch;
  /** The requests made, with their headers flattened to a plain object. */
  requests: { url: string; headers: Record<string, string>; body: string }[];
}

/**
 * How to answer a call: a fixture as recorded, or with `stallAfter`, the
 * fixture's first lines and then nothing until the request is aborted, the
 * way a server that stops sending looks.
 */
export type ReplayStep = HttpFixture | { fixture: HttpFixture; stallAfter: number } | { throws: Error };

/** A `fetch` that replays fixtures in order and never touches the network. */
export function replay(...steps: ReplayStep[]): Replay {
  const requests: Replay["requests"] = [];
  const queue = [...steps];
  const fake = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    requests.push({ url: String(input), headers: Object.fromEntries(new Headers(init.headers).entries()), body: String(init.body ?? "") });
    const step = queue.shift();
    if (!step) throw new Error(`No fixture left for ${String(input)}`);
    if ("throws" in step) throw step.throws;
    const { fixture, stallAfter } = "stallAfter" in step ? step : { fixture: step, stallAfter: Infinity };
    const lines = fixture.body.split("\n");
    const signal = init.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const head = lines.slice(0, Math.min(stallAfter, lines.length)).join("\n");
        controller.enqueue(new TextEncoder().encode(stallAfter < lines.length ? `${head}\n` : head));
        if (stallAfter >= lines.length) {
          controller.close();
          return;
        }
        const abort = () => controller.error(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      },
    });
    return new Response(body, { status: fixture.status, headers: { "content-type": fixture.contentType } });
  };
  return { fetch: fake as typeof fetch, requests };
}

/** An event sink that keeps everything in memory, for assertions. */
export function memorySink() {
  const sink = {
    deltas: [] as { channel: "reasoning" | "output"; text: string }[],
    events: [] as TraceEvent[],
    attachments: [] as Attachment[],
    delta(channel: "reasoning" | "output", text: string) {
      sink.deltas.push({ channel, text });
    },
    event(event: TraceEvent) {
      sink.events.push(event);
    },
    attach(attachment: Attachment) {
      sink.attachments.push(attachment);
    },
    /** Streamed text on one channel, joined. */
    streamed(channel: "reasoning" | "output") {
      return sink.deltas.filter((d) => d.channel === channel).map((d) => d.text).join("");
    },
  };
  return sink;
}
