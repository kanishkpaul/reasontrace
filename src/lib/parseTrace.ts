import type { ReasonTrace, TraceEvent, EventType, EvidenceMode } from "../types";

// Helper to generate a simple unique ID
const generateId = () => `ev-${Math.random().toString(36).substring(2, 9)}`;

/**
 * Attempts to parse a JSON string into a ReasonTrace object.
 * Returns null if parsing fails.
 */
export function parseJsonTrace(input: string): ReasonTrace | null {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return null;

    let events: unknown[] = [];
    if (Array.isArray(parsed.events)) {
      events = parsed.events;
    } else if (Array.isArray(parsed)) {
      events = parsed;
    } else if (Array.isArray(parsed.messages)) {
      return parseChatMessages(parsed.messages, parsed.title || parsed.model || "Imported chat and tool trace");
    } else if (Array.isArray(parsed.output)) {
      return parseResponsesOutput(parsed.output, parsed.title || parsed.model || "Imported model response trace");
    } else {
      return null;
    }

    const title = parsed.title || "Imported JSON Trace";

    // Standardize and sanitize events
    const sanitizedEvents = events.map((rawEvent, idx: number) => {
      const ev = rawEvent as Record<string, unknown>;
      const id = String(ev.id || ev.Id || generateId());
      const type = normaliseType(ev.type || ev.Type || ev.event_type || "hypothesis");
      const step = typeof ev.step === "number" ? ev.step : (typeof ev.Step === "number" ? ev.Step : idx + 1);
      const content = String(ev.content || ev.Content || ev.text || ev.Text || "");
      const confidence = typeof ev.confidence === "number" ? ev.confidence : (typeof ev.Confidence === "number" ? ev.Confidence : undefined);
      const rawTool = ev.tool || ev.Tool;
      const tool = rawTool === undefined ? undefined : String(rawTool);
      const links = Array.isArray(ev.links) ? ev.links.map(String) : (Array.isArray(ev.Links) ? ev.Links.map(String) : []);
      const evidenceMode = normaliseEvidenceMode(ev.evidenceMode || ev.evidence_mode || ev.provenance || ev.origin, type);

      return {
        id,
        type,
        step,
        content: content.trim(),
        confidence,
        tool,
        links,
        evidenceMode,
        source: ev.source || ev.provider ? String(ev.source || ev.provider) : undefined,
        metadata: (ev.metadata || ev.Metadata) as Record<string, unknown> | undefined
      };
    });

    // Sort by step
    sanitizedEvents.sort((a, b) => a.step - b.step);

    return {
      title,
      events: sanitizedEvents
    };
  } catch {
    return null;
  }
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

function normaliseEvidenceMode(value: unknown, type?: EventType): EvidenceMode {
  const raw = String(value || "").toLowerCase();
  if (["explicit", "reasoning", "thought"].includes(raw)) return "explicit";
  if (["inferred", "derived", "reconstructed"].includes(raw)) return "inferred";
  return type === "hypothesis" || type === "belief_update" || type === "decision" ? "explicit" : "observed";
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
  const add = (event: Omit<TraceEvent, "id" | "step" | "links">) => {
    const id = `m${step}`;
    events.push({ ...event, id, step, links: previousId ? [previousId] : [] });
    previousId = id;
    step++;
  };
  messages.forEach((message) => {
    const role = String(message.role || "").toLowerCase();
    const text = contentOf(message.content);
    if (role === "tool" || role === "function") {
      add({ type: "observation", content: text || "Tool returned no text output.", tool: message.name || message.tool_call_id ? String(message.name || message.tool_call_id) : undefined, evidenceMode: "observed", source: "tool result", metadata: { role } });
      return;
    }
    if (role === "assistant") {
      const rawCalls = message.tool_calls || (message.function_call ? [message.function_call] : []);
      const calls = Array.isArray(rawCalls) ? rawCalls.filter((call): call is Record<string, unknown> => Boolean(call && typeof call === "object")) : [];
      if (text) add({ type: calls.length ? "belief_update" : "final_answer", content: text, evidenceMode: "observed", source: "assistant message", metadata: { role, note: "Observable output, not hidden reasoning." } });
      calls.forEach((call: Record<string, unknown>) => {
        const fn = call.function as Record<string, unknown> | undefined;
        const tool = String(fn?.name || call.name || "tool");
        add({ type: "action", content: contentOf(fn?.arguments || call.arguments) || `Called ${tool}`, tool, evidenceMode: "observed", source: "tool call", metadata: { callId: call.id } });
      });
      return;
    }
    if (text) add({ type: "observation", content: text, evidenceMode: "observed", source: role || "input", metadata: { role } });
  });
  return { title, events };
}

/** Imports OpenAI Responses-style output records and preserves tool-call chronology. */
function parseResponsesOutput(output: Record<string, unknown>[], title: string): ReasonTrace {
  const events: TraceEvent[] = [];
  let previousId: string | undefined;
  const add = (event: Omit<TraceEvent, "id" | "step" | "links">) => {
    const id = `r${events.length + 1}`;
    events.push({ ...event, id, step: events.length + 1, links: previousId ? [previousId] : [] });
    previousId = id;
  };
  output.forEach((item) => {
    if (item.type === "function_call") {
      add({ type: "action", content: contentOf(item.arguments) || `Called ${item.name || "tool"}`, tool: item.name ? String(item.name) : undefined, evidenceMode: "observed", source: "tool call", metadata: { callId: item.call_id } });
    } else if (item.type === "function_call_output") {
      add({ type: "observation", content: contentOf(item.output) || "Tool returned no text output.", tool: item.call_id ? String(item.call_id) : undefined, evidenceMode: "observed", source: "tool result" });
    } else if (item.type === "message") {
      add({ type: "final_answer", content: contentOf(item.content), evidenceMode: "observed", source: "assistant message", metadata: { note: "Observable output, not hidden reasoning." } });
    } else if (item.type === "reasoning" && contentOf(item.summary)) {
      add({ type: "belief_update", content: contentOf(item.summary), evidenceMode: "explicit", source: "reasoning summary" });
    }
  });
  return { title, events };
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
        evidenceMode: matchedType === "hypothesis" || matchedType === "belief_update" ? "explicit" : "observed"
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
          evidenceMode: "explicit"
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
    if (i > 0 && (!events[i].links || events[i].links!.length === 0)) {
      events[i].links = [events[i - 1].id];
    }
  }

  return {
    title: "Parsed Transcript Trace",
    events
  };
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

  // Clean up content by stripping out the metadata tags if they clutter the main text
  const cleanedContent = content.trim();

  return {
    id: event.id || `e${step}`,
    type: event.type || "hypothesis",
    step: event.step || step,
    content: cleanedContent,
    confidence,
    tool,
    links: event.links || []
  };
}

/**
 * Universal parse entry point. Resolves either JSON or simple transcript text.
 * Never throws an error; returns a fallback trace if both fail.
 */
export function parseTrace(input: string): { trace: ReasonTrace; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      trace: { title: "Empty Trace", events: [] },
      error: "Empty input provided."
    };
  }

  // 1. Try JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const jsonTrace = parseJsonTrace(trimmed);
    if (jsonTrace) {
      // Validate that links reference valid nodes
      const allIds = new Set(jsonTrace.events.map(e => e.id));
      let linksWarning = false;
      jsonTrace.events.forEach(e => {
        if (e.links) {
          e.links = e.links.filter(linkId => {
            const exists = allIds.has(linkId);
            if (!exists) linksWarning = true;
            return exists;
          });
        }
      });

      return {
        trace: jsonTrace,
        error: linksWarning ? "Warning: Some events contained links to missing event IDs. These links were ignored." : undefined
      };
    }
  }

  // 2. Try Transcript
  try {
    const transcriptTrace = parseTranscriptTrace(trimmed);
    if (transcriptTrace.events.length > 0) {
      return { trace: transcriptTrace };
    }
  } catch {
    // Fallback
  }

  return {
    trace: { title: "Fallback Trace", events: [] },
    error: "Failed to parse input as JSON or plain transcript. Please verify the format."
  };
}
