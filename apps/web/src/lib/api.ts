import type { Run, RunManifest, Tier, UnavailableDepth } from "@reasontrace/format";

/**
 * The local server's API (docs/ARCHITECTURE.md §7). The server puts its launch
 * token in the page; a viewer opened any other way has no server and works on
 * trace files alone.
 */
const token = typeof document === "undefined" ? null : document.querySelector<HTMLMetaElement>('meta[name="reasontrace-token"]')?.content ?? null;

export const hasServer = token !== null;

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  needsKey: boolean;
  hasKey: boolean;
}

export interface ModelInfo {
  id: string;
  name?: string;
}

export interface Capabilities {
  tier: Tier;
  unavailable: UnavailableDepth[];
}

export interface EngineInfo {
  id: string;
  name: string;
  language: string;
}

export interface RunBody {
  source: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topLogprobs?: number;
}

export class ApiError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("x-reasontrace-token", token);
  if (init.body) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("The ReasonTrace server is not answering. Is it still running?");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError((body as { error?: string }).error ?? `HTTP ${response.status}`);
  return body as T;
}

export const api = {
  sources: () => call<{ sources: SourceInfo[] }>("/api/sources").then((r) => r.sources),
  storeKey: (id: string, key: string) => call<void>(`/api/keys/${id}`, { method: "PUT", body: JSON.stringify({ key }) }),
  removeKey: (id: string) => call<void>(`/api/keys/${id}`, { method: "DELETE" }),
  models: (id: string) => call<{ models: ModelInfo[] }>(`/api/sources/${id}/models`).then((r) => r.models),
  capabilities: (id: string, model: string) => call<Capabilities>(`/api/sources/${id}/capabilities?model=${encodeURIComponent(model)}`),
  runs: () => call<{ runs: RunManifest[] }>("/api/runs").then((r) => r.runs),
  run: (id: string) => call<Run>(`/api/runs/${id}`),
  engines: () => call<{ engines: EngineInfo[] }>("/api/engines").then((r) => r.engines),
  solve: (engine: string, problem: string) => call<{ manifest: RunManifest }>("/api/solve", { method: "POST", body: JSON.stringify({ engine, problem }) }).then((r) => r.manifest),
};

export interface RunStream {
  onStart: (id: string) => void;
  onDelta: (channel: "reasoning" | "output", text: string) => void;
}

/** A pipeline's model fields as for a run, with the problem in words in place of a prompt. */
export interface PipelineBody extends Omit<RunBody, "prompt"> {
  text: string;
  engine: string;
}

/**
 * Starts a run, or a pipeline, and reads its event stream until the server reports it done.
 * Aborting `signal` stops the run; the server records it as aborted.
 */
export async function startRun(body: RunBody | PipelineBody, handlers: RunStream, signal: AbortSignal): Promise<RunManifest> {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("x-reasontrace-token", token);
  const response = await fetch("engine" in body ? "/api/pipelines" : "/api/runs", { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError((error as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // The server writes `event:` then `data:` lines, one message per blank-line-separated block.
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || data === undefined) continue;
      const payload = JSON.parse(data);
      if (event === "start") handlers.onStart(payload.id);
      else if (event === "delta") handlers.onDelta(payload.channel, payload.text);
      else if (event === "done") return payload.manifest as RunManifest;
    }
  }
  throw new ApiError("The run's stream ended before the server reported the result.");
}
