const OPEN = "<think>";
const CLOSE = "</think>";

/**
 * Reasoning that an open model wrote inline as `<think>…</think>` before its
 * answer, split from the answer. Some chat templates put the opening tag in
 * the prompt, so the reply has only the closing one; everything before it is
 * then reasoning. `outputStart` is where the answer begins in `raw`.
 */
export function splitThink(raw: string): { reasoning: string | null; output: string; outputStart: number } {
  const lead = raw.length - raw.trimStart().length;
  const opened = raw.startsWith(OPEN, lead);
  const close = raw.indexOf(CLOSE);
  if (close === -1) {
    // An opening tag that never closed: the model ran out of room while thinking.
    return opened ? { reasoning: raw.slice(lead + OPEN.length).trim(), output: "", outputStart: raw.length } : { reasoning: null, output: raw, outputStart: 0 };
  }
  if (!opened && raw.lastIndexOf(OPEN, close) !== -1) return { reasoning: null, output: raw, outputStart: 0 };
  const reasoning = raw.slice(opened ? lead + OPEN.length : 0, close).trim();
  const after = close + CLOSE.length;
  const outputStart = after + (raw.length - after - raw.slice(after).trimStart().length);
  return { reasoning, output: raw.slice(outputStart), outputStart };
}

/** The longest end of `text` that could be the start of `tag`. */
function partialTagAtEnd(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (tag.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

/**
 * Splits streamed content into reasoning and answer as it arrives, for the
 * live view, holding back text that might be part of a tag. What is stored
 * comes from `splitThink` over the whole reply.
 */
export class ThinkSplitter {
  private mode: "start" | "reasoning" | "output" = "start";
  private pending = "";
  /** Set after a closing tag, so the blank lines between reasoning and answer are dropped even when they arrive later. */
  private trimNext = false;

  feed(text: string): { channel: "reasoning" | "output"; text: string }[] {
    this.pending += text;
    const parts: { channel: "reasoning" | "output"; text: string }[] = [];
    for (;;) {
      if (this.mode === "start") {
        const trimmed = this.pending.trimStart();
        if (trimmed.startsWith(OPEN)) {
          this.mode = "reasoning";
          this.pending = trimmed.slice(OPEN.length);
          continue;
        }
        if (OPEN.startsWith(trimmed)) return parts;
        this.mode = "output";
      }
      if (this.mode === "reasoning") {
        const close = this.pending.indexOf(CLOSE);
        if (close !== -1) {
          if (close > 0) parts.push({ channel: "reasoning", text: this.pending.slice(0, close) });
          this.pending = this.pending.slice(close + CLOSE.length);
          this.mode = "output";
          this.trimNext = true;
          continue;
        }
        const keep = partialTagAtEnd(this.pending, CLOSE);
        const ready = this.pending.slice(0, this.pending.length - keep);
        if (ready) parts.push({ channel: "reasoning", text: ready });
        this.pending = this.pending.slice(ready.length);
        return parts;
      }
      if (this.trimNext) {
        this.pending = this.pending.trimStart();
        if (!this.pending) return parts;
        this.trimNext = false;
      }
      if (this.pending) parts.push({ channel: "output", text: this.pending });
      this.pending = "";
      return parts;
    }
  }

  /** Whatever was held back, once the stream has ended. */
  flush(): { channel: "reasoning" | "output"; text: string }[] {
    const text = this.pending;
    this.pending = "";
    return text ? [{ channel: this.mode === "reasoning" ? "reasoning" : "output", text }] : [];
  }
}
