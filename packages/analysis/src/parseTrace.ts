import { FORMAT_VERSION } from "@reasontrace/format";
import type { Depth, EventType, EvidenceLabel, ReasonTrace, TraceEvent, UnavailableDepth } from "@reasontrace/format";

const IMPORTED_UNAVAILABLE: UnavailableDepth[] = [
  { depth: "probabilities", reason: "A trace file records what was emitted, not the token probabilities behind it." },
  { depth: "internals", reason: "A trace file has no access to the model's internals." },
];

function importedTrace(title: string, events: TraceEvent[]): ReasonTrace {
  return { formatVersion: FORMAT_VERSION, title, events, unavailable: IMPORTED_UNAVAILABLE };
}

/** Stated reasoning is its own depth; everything a trace file can otherwise show is behaviour. */
const depthOf = (label: EvidenceLabel): Depth => (label === "stated" ? "stated" : "behaviour");

/** JSON that parses but is not a trace this reader understands. */
class TraceShapeError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function records(items: unknown[], what: string): Record<string, unknown>[] {
  items.forEach((item, index) => {
    if (!isRecord(item)) throw new TraceShapeError(`${what} ${index + 1} is not an object.`);
  });
  return items as Record<string, unknown>[];
}

/**
 * Reads an already-parsed JSON value in any supported shape, including format v0.
 *
 * @throws {TraceShapeError} if the value is in no supported shape.
 */
function traceFromJson(value: unknown): ReasonTrace {
  if (!value || typeof value !== "object") throw new TraceShapeError("The JSON is not an object or an array.");
  const parsed = value as Record<string, unknown>;

  let events: unknown[];
  if (Array.isArray(parsed.events)) {
    events = parsed.events;
  } else if (Array.isArray(value)) {
    events = value;
  } else if (Array.isArray(parsed.messages)) {
    return parseChatMessages(records(parsed.messages, "Message"), String(parsed.title || parsed.model || "Imported chat and tool trace"));
  } else if (Array.isArray(parsed.output)) {
    return parseResponsesOutput(records(parsed.output, "Output item"), String(parsed.title || parsed.model || "Imported model response trace"));
  } else {
    throw new TraceShapeError("The JSON has no `events`, `messages` or `output` array.");
  }

  const title = (parsed.title || "Imported JSON Trace") as string;

  // Standardize and sanitize events
  const sanitizedEvents = records(events, "Event").map((ev, idx: number) => {
    const rawId = ev.id ?? ev.Id;
    const id = rawId === undefined || rawId === null || rawId === "" ? `e${idx + 1}` : String(rawId);
    const type = normaliseType(ev.type || ev.Type || ev.event_type || "hypothesis");
    const step = typeof ev.step === "number" ? ev.step : (typeof ev.Step === "number" ? ev.Step : idx + 1);
    const content = String(ev.content || ev.Content || ev.text || ev.Text || "");
    const confidence = typeof ev.confidence === "number" ? ev.confidence : (typeof ev.Confidence === "number" ? ev.Confidence : undefined);
    const rawTool = ev.tool || ev.Tool;
    const tool = rawTool === undefined ? undefined : String(rawTool);
    const rawSupports = ev.supports ?? ev.links ?? ev.Links;
    const supports = Array.isArray(rawSupports) ? rawSupports.map(String) : [];
    const label = normaliseLabel(ev.label || ev.evidenceMode || ev.evidence_mode || ev.provenance || ev.origin, type);

    return {
      id,
      type,
      step,
      content: content.trim(),
      confidence,
      tool,
      depth: depthOf(label),
      label,
      supports,
      source: ev.source || ev.provider ? String(ev.source || ev.provider) : undefined,
      metadata: (ev.metadata || ev.Metadata) as Record<string, unknown> | undefined
    };
  });

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of sanitizedEvents) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size) throw new TraceShapeError(`Duplicate event IDs: ${[...duplicates].join(", ")}.`);

  // Sort by step
  sanitizedEvents.sort((a, b) => a.step - b.step);

  return importedTrace(title, sanitizedEvents);
}

function normaliseType(value: unknown): EventType {
  const raw = String(value || "").toLowerCase().replace(/[\s-]/g, "_");
  if (["tool_call", "function_call", "command", "run", "execute"].includes(raw)) return "action";
  if (["tool_result", "function_result", "function_call_output", "output", "result", "message", "user"].includes(raw)) return "observation";
  if (["thought", "reasoning", "analysis", "claim", "assistant"].includes(raw)) return "hypothesis";
  if (["answer", "final", "assistant_final"].includes(raw)) return "final_answer";
  if (["update", "belief", "conclusion"].includes(raw)) return "belief_update";
  if (["error", "exception", "hallucination"].includes(raw)) return "failure";
  return ["hypothesis", "action", "observation", "belief_update", "failure", "decision", "final_answer"].includes(raw)
    ? raw as EventType
    : "hypothesis";
}

/** Accepts format v1 labels and the prototype's v0 evidence modes (`explicit` is v0 for `stated`). */
function normaliseLabel(value: unknown, type?: EventType): EvidenceLabel {
  const raw = String(value || "").toLowerCase();
  if (["stated", "explicit", "reasoning", "thought"].includes(raw)) return "stated";
  if (["inferred", "derived", "reconstructed"].includes(raw)) return "inferred";
  if (["observed", "exact", "measured", "decoded"].includes(raw)) return raw as EvidenceLabel;
  return type === "hypothesis" || type === "belief_update" || type === "decision" ? "stated" : "observed";
}

function contentOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : item?.text || item?.content || "").filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return contentOf(record.text) || contentOf(record.content) || JSON.stringify(value);
  }
  return "";
}

/** Imports common chat-completion style logs without claiming assistant text is private reasoning. */
function parseChatMessages(messages: Record<string, unknown>[], title: string): ReasonTrace {
  const events: TraceEvent[] = [];
  let step = 1;
  let previousId: string | undefined;
  const add = (event: Omit<TraceEvent, "id" | "step" | "supports" | "depth">) => {
    const id = `m${step}`;
    events.push({ ...event, id, step, depth: depthOf(event.label), supports: previousId ? [previousId] : [] });
    previousId = id;
    step++;
  };
  messages.forEach((message) => {
    const role = String(message.role || "").toLowerCase();
    const text = contentOf(message.content);
    if (role === "tool" || role === "function") {
      add({ type: "observation", content: text || "Tool returned no text output.", tool: message.name || message.tool_call_id ? String(message.name || message.tool_call_id) : undefined, label: "observed", source: "tool result", metadata: { role } });
      return;
    }
    if (role === "assistant") {
      const rawCalls = message.tool_calls || (message.function_call ? [message.function_call] : []);
      const calls = Array.isArray(rawCalls) ? rawCalls.filter((call): call is Record<string, unknown> => Boolean(call && typeof call === "object")) : [];
      if (text) add({ type: calls.length ? "belief_update" : "final_answer", content: text, label: "observed", source: "assistant message", metadata: { role, note: "Observable output, not hidden reasoning." } });
      calls.forEach((call: Record<string, unknown>) => {
        const fn = call.function as Record<string, unknown> | undefined;
        const tool = String(fn?.name || call.name || "tool");
        add({ type: "action", content: contentOf(fn?.arguments || call.arguments) || `Called ${tool}`, tool, label: "observed", source: "tool call", metadata: { callId: call.id } });
      });
      return;
    }
    if (text) add({ type: "observation", content: text, label: "observed", source: role || "input", metadata: { role } });
  });
  return importedTrace(title, events);
}

/** Imports OpenAI Responses-style output records and preserves tool-call chronology. */
function parseResponsesOutput(output: Record<string, unknown>[], title: string): ReasonTrace {
  const events: TraceEvent[] = [];
  let previousId: string | undefined;
  const add = (event: Omit<TraceEvent, "id" | "step" | "supports" | "depth">) => {
    const id = `r${events.length + 1}`;
    events.push({ ...event, id, step: events.length + 1, depth: depthOf(event.label), supports: previousId ? [previousId] : [] });
    previousId = id;
  };
  output.forEach((item) => {
    if (item.type === "function_call") {
      add({ type: "action", content: contentOf(item.arguments) || `Called ${item.name || "tool"}`, tool: item.name ? String(item.name) : undefined, label: "observed", source: "tool call", metadata: { callId: item.call_id } });
    } else if (item.type === "function_call_output") {
      add({ type: "observation", content: contentOf(item.output) || "Tool returned no text output.", tool: item.call_id ? String(item.call_id) : undefined, label: "observed", source: "tool result" });
    } else if (item.type === "message") {
      add({ type: "final_answer", content: contentOf(item.content), label: "observed", source: "assistant message", metadata: { note: "Observable output, not hidden reasoning." } });
    } else if (item.type === "reasoning" && contentOf(item.summary)) {
      add({ type: "belief_update", content: contentOf(item.summary), label: "stated", source: "reasoning summary" });
    }
  });
  return importedTrace(title, events);
}

/**
 * Parses a simple text transcript.
 * Matches lines starting with known keywords like "Thought:", "Action:", etc.
 */
export function parseTranscriptTrace(input: string): ReasonTrace {
  const lines = input.split(/\r?\n/);
  const events: TraceEvent[] = [];
  let currentEvent: Partial<TraceEvent> | null = null;
  let currentStep = 1;

  // Prefix mapping
  const prefixMap: { regex: RegExp; type: EventType }[] = [
    { regex: /^(thought|hypothesis|hypotheses|idea):\s*/i, type: "hypothesis" },
    { regex: /^(action|tool|run|command|execute):\s*/i, type: "action" },
    { regex: /^(observation|response|output|result|evidence):\s*/i, type: "observation" },
    { regex: /^(update|belief_update|belief|confidence|conclusion):\s*/i, type: "belief_update" },
    { regex: /^(failure|error|loop|mistake|hallucination):\s*/i, type: "failure" },
    { regex: /^(decision|choose|choice|branch):\s*/i, type: "decision" },
    { regex: /^(final|final_answer|answer|summary|output_final):\s*/i, type: "final_answer" }
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matchedType: EventType | null = null;
    let matchedPrefixLength = 0;

    // Check if the line starts with any prefix
    for (const prefix of prefixMap) {
      const match = trimmed.match(prefix.regex);
      if (match) {
        matchedType = prefix.type;
        matchedPrefixLength = match[0].length;
        break;
      }
    }

    if (matchedType) {
      // If there is an ongoing event, save it
      if (currentEvent) {
        events.push(finalizeEvent(currentEvent, currentStep++));
      }

      const remainder = trimmed.substring(matchedPrefixLength);
      currentEvent = {
        id: `e${currentStep}`,
        type: matchedType,
        content: remainder,
        label: matchedType === "hypothesis" || matchedType === "belief_update" ? "stated" : "observed"
      };
    } else {
      // If no prefix matches, this line either belongs to the current event or starts a default 'hypothesis'
      if (currentEvent) {
        currentEvent.content = (currentEvent.content || "") + "\n" + trimmed;
      } else {
        // Start a default hypothesis event
        currentEvent = {
          id: `e${currentStep}`,
          type: "hypothesis",
          content: trimmed,
          label: "stated"
        };
      }
    }
  }

  // Push the final event
  if (currentEvent) {
    events.push(finalizeEvent(currentEvent, currentStep));
  }

  // Auto-link sequential events temporally if no links exist
  for (let i = 0; i < events.length; i++) {
    if (i > 0 && events[i].supports.length === 0) {
      events[i].supports = [events[i - 1].id];
    }
  }

  return importedTrace("Parsed Transcript Trace", events);
}

/**
 * Finalizes an event, extracting confidence, tools, and formatting content.
 */
function finalizeEvent(event: Partial<TraceEvent>, step: number): TraceEvent {
  const content = event.content || "";
  let confidence: number | undefined = undefined;
  let tool: string | undefined = undefined;

  // Extract confidence (e.g. "[confidence: 0.85]" or "(90%)" or "confidence: 0.9")
  const confidenceRegexes = [
    /(?:confidence|conf):\s*(0\.\d+|1\.0|\b\d{1,2}\b%?)/i,
    /\[(?:confidence|conf):\s*(0\.\d+|1\.0|\d{1,2}%)\]/i,
    /\((0\.\d+|1\.0|\d{1,2}%)\)/
  ];

  for (const rx of confidenceRegexes) {
    const match = content.match(rx);
    if (match) {
      const valStr = match[1];
      if (valStr.endsWith("%")) {
        const val = parseFloat(valStr) / 100;
        if (!isNaN(val)) confidence = val;
      } else {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
          // If it is an integer > 1, assume percentage (e.g. 85 -> 0.85)
          confidence = val > 1 ? val / 100 : val;
        }
      }
      break;
    }
  }

  // Extract tool name if event is an action (e.g. "tool: file_read" or "[tool: file_read]" or "Action: file_read()")
  if (event.type === "action") {
    const toolRegexes = [
      /(?:tool|command|cmd):\s*([a-zA-Z0-9_-]+)/i,
      /\[(?:tool|command|cmd):\s*([a-zA-Z0-9_-]+)\]/i,
      /^([a-zA-Z0-9_-]+)\s*\(/ // Matches function-call style: file_read(params)
    ];

    for (const rx of toolRegexes) {
      const match = content.match(rx);
      if (match) {
        tool = match[1];
        break;
      }
    }
  }

  const label = event.label ?? "stated";
  return {
    id: event.id || `e${step}`,
    type: event.type || "hypothesis",
    step: event.step || step,
    content: content.trim(),
    confidence,
    tool,
    depth: depthOf(label),
    label,
    supports: event.supports || []
  };
}

/**
 * The outcome of reading a trace. `trace` is null exactly when `errors` is
 * non-empty; `warnings` describe what was dropped or assumed while reading.
 */
export interface ParseResult {
  trace: ReasonTrace | null;
  errors: string[];
  warnings: string[];
}

/**
 * Reads a parsed JSON value as a trace and drops `supports` entries that name
 * no event.
 */
export function readTrace(value: unknown): ParseResult {
  let trace: ReasonTrace;
  try {
    trace = traceFromJson(value);
  } catch (error) {
    if (error instanceof TraceShapeError) return { trace: null, errors: [error.message], warnings: [] };
    throw error;
  }
  const allIds = new Set(trace.events.map(e => e.id));
  let danglingSupport = false;
  trace.events.forEach(e => {
    e.supports = e.supports.filter(id => {
      const exists = allIds.has(id);
      if (!exists) danglingSupport = true;
      return exists;
    });
  });
  return {
    trace,
    errors: [],
    warnings: danglingSupport ? ["Some events linked to event IDs that don't exist. Those links were dropped."] : []
  };
}

/** Reads trace text: JSON in any supported shape, or a plain transcript. */
export function parseTrace(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { trace: null, errors: ["The input is empty."], warnings: [] };

  // Text that starts like JSON is read only as JSON. Falling back to the
  // transcript reader would turn a typo into one "stated" hypothesis.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      return { trace: null, errors: [`The input is not valid JSON: ${(error as SyntaxError).message}`], warnings: [] };
    }
    return readTrace(value);
  }

  const transcriptTrace = parseTranscriptTrace(trimmed);
  if (transcriptTrace.events.length > 0) return { trace: transcriptTrace, errors: [], warnings: [] };
  return { trace: null, errors: ["The input is neither trace JSON nor a transcript."], warnings: [] };
}
