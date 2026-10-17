export interface SseMessage {
  /** The `event:` field, or "message" when the server sent none. */
  event: string;
  data: string;
}

/**
 * Reads a server-sent-events body (the WHATWG event-stream format) message by
 * message. Comment lines, which some servers send as keep-alives, are skipped.
 * Lines end in LF or CRLF; a lone CR, which no provider sends, is not a line end,
 * so a CRLF split across two chunks can't read as an empty line.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let data: string[] = [];

  const lineMessage = (line: string): SseMessage | null => {
    line = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (line === "") {
      const message = data.length ? { event: event || "message", data: data.join("\n") } : null;
      event = "";
      data = [];
      return message;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    return null;
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const message = lineMessage(line);
      if (message) yield message;
    }
  }
  buffer += decoder.decode();
  for (const line of [...buffer.split("\n"), ""]) {
    const message = lineMessage(line);
    if (message) yield message;
  }
}
