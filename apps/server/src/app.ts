import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { isRunId, listRuns, newRunId, readRun, RunReadError, RunWriter, type RunOutcome, type Source } from "@reasontrace/core";
import type { CapturePlan, RunRequest } from "@reasontrace/format";
import type { KeyStore } from "@reasontrace/keys";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";

export interface AppOptions {
  /** Every `/api` request must carry it in the `x-reasontrace-token` header. */
  token: string;
  sources: Source[];
  keys: KeyStore;
  runsDir: string;
  /** The built viewer. Without it the server answers `/api` only, as in development behind Vite. */
  webDir?: string;
  /** Where the server reports what it does. Never given a request body. */
  log: (line: string) => void;
  versions: Record<string, string>;
}

export const TOKEN_HEADER = "x-reasontrace-token";

/** Names the server answers to. Any other Host is a DNS-rebinding page, which could otherwise read the token from the viewer. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const DEFAULTS = { maxTokens: 1024, topLogprobs: 5, timeoutMs: 120_000 };

class BadRequest extends Error {}

function hostname(host: string | undefined): string {
  if (!host) return "";
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function sameToken(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const integer = (value: unknown, name: string, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new BadRequest(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
};

/** A capture plan's shape. The sidecar checks layer indices against the model. */
function capturePlan(raw: unknown): CapturePlan {
  const plan = raw as Partial<CapturePlan> | null;
  const layersOk = plan?.layers === "all" || (Array.isArray(plan?.layers) && plan.layers.length > 0 && plan.layers.every((i) => Number.isInteger(i) && i >= 0));
  if (!plan || typeof plan !== "object" || !layersOk || !["all", "generated", "last"].includes(plan.positions as string) || !["none", "mean"].includes(plan.pooling as string)) {
    throw new BadRequest('plan must be {layers: "all" or layer indices, positions: "all" | "generated" | "last", pooling: "none" | "mean"}.');
  }
  return { layers: plan.layers!, positions: plan.positions!, pooling: plan.pooling! };
}

/** A run request from the viewer, checked field by field. */
function runRequest(body: Record<string, unknown>): { sourceId: string; request: RunRequest } {
  const { source, model, prompt } = body;
  if (typeof source !== "string" || !source) throw new BadRequest("source is required.");
  if (typeof model !== "string" || !model) throw new BadRequest("model is required.");
  if (typeof prompt !== "string" || !prompt.trim()) throw new BadRequest("prompt is required.");
  if (prompt.length > 200_000) throw new BadRequest("prompt is over 200,000 characters.");
  const request: RunRequest = {
    model,
    prompt,
    maxTokens: integer(body.maxTokens ?? DEFAULTS.maxTokens, "maxTokens", 1, 200_000),
    topLogprobs: integer(body.topLogprobs ?? DEFAULTS.topLogprobs, "topLogprobs", 0, 20),
    timeoutMs: integer(body.timeoutMs ?? DEFAULTS.timeoutMs, "timeoutMs", 1000, 600_000),
  };
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 2) throw new BadRequest("temperature must be from 0 to 2.");
    request.temperature = body.temperature;
  }
  if (body.seed !== undefined) request.seed = integer(body.seed, "seed", 0, 2 ** 31 - 1);
  if (body.cache !== undefined) {
    if (typeof body.cache !== "boolean") throw new BadRequest("cache must be true or false.");
    request.cache = body.cache;
  }
  if (body.plan !== undefined) request.plan = capturePlan(body.plan);
  return { sourceId: source, request };
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  throw new BadRequest("The body must be a JSON object.");
}

/** The local HTTP API and, when built, the viewer (docs/ARCHITECTURE.md §7). */
export function createApp(options: AppOptions): Hono {
  const { token, sources, keys, runsDir, webDir, log } = options;
  const app = new Hono();
  const sourceById = (id: string) => sources.find((s) => s.id === id);

  app.onError((error, c) => {
    if (error instanceof BadRequest) return c.json({ error: error.message }, 400);
    if (error instanceof RunReadError) return c.json({ error: error.message }, 404);
    log(`error: ${c.req.method} ${c.req.path}: ${error.message}`);
    return c.json({ error: "The server failed to answer; its terminal has the reason." }, 500);
  });

  app.use("*", async (c, next) => {
    if (!LOCAL_HOSTS.has(hostname(c.req.header("host")))) return c.text("This server answers only to 127.0.0.1 and localhost.", 403);
    await next();
  });

  app.use("/api/*", async (c, next) => {
    if (!sameToken(c.req.header(TOKEN_HEADER), token)) return c.json({ error: "Missing or wrong launch token." }, 401);
    await next();
  });

  app.get("/api/sources", async (c) => {
    const list = await Promise.all(sources.map(async (s) => ({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      needsKey: s.needsKey,
      hasKey: s.needsKey ? await keys.has(s.id) : false,
    })));
    return c.json({ sources: list });
  });

  app.put("/api/keys/:id", async (c) => {
    const source = sourceById(c.req.param("id"));
    if (!source?.needsKey) return c.json({ error: "No source with that ID takes a key." }, 404);
    const { key } = await jsonBody(c);
    if (typeof key !== "string" || !key.trim() || key.length > 4096) throw new BadRequest("key must be a non-empty string.");
    await keys.set(source.id, key.trim());
    log(`  ┊ key       stored for ${source.name} in the OS keychain`);
    return c.body(null, 204);
  });

  app.delete("/api/keys/:id", async (c) => {
    const source = sourceById(c.req.param("id"));
    if (!source?.needsKey) return c.json({ error: "No source with that ID takes a key." }, 404);
    await keys.delete(source.id);
    log(`  ┊ key       removed for ${source.name}`);
    return c.body(null, 204);
  });

  app.get("/api/sources/:id/models", async (c) => {
    const source = sourceById(c.req.param("id"));
    if (!source) return c.json({ error: "No source with that ID." }, 404);
    try {
      return c.json({ models: await source.models(AbortSignal.timeout(15_000)) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
    }
  });

  app.get("/api/sources/:id/capabilities", (c) => {
    const source = sourceById(c.req.param("id"));
    const model = c.req.query("model");
    if (!source) return c.json({ error: "No source with that ID." }, 404);
    if (!model) throw new BadRequest("model is required.");
    return c.json(source.capabilities(model));
  });

  app.get("/api/runs", (c) => c.json({ runs: listRuns(runsDir) }));

  app.get("/api/runs/:id", (c) => {
    const id = c.req.param("id");
    if (!isRunId(id)) return c.json({ error: "Not a run ID." }, 404);
    return c.json(readRun(runsDir, id));
  });

  app.post("/api/runs", async (c) => {
    const { sourceId, request } = runRequest(await jsonBody(c));
    const source = sourceById(sourceId);
    if (!source) return c.json({ error: "No source with that ID." }, 404);
    const capabilities = source.capabilities(request.model);

    return streamSSE(c, async (stream) => {
      const stop = new AbortController();
      stream.onAbort(() => stop.abort());
      const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(request.timeoutMs)]);
      // A page closed mid-run can't be written to. The run still finishes and
      // its directory records it; only the live view is lost.
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {});

      const writer = new RunWriter(runsDir, {
        id: newRunId(),
        title: `${request.model} · ${request.prompt.trim().split("\n")[0].slice(0, 60)}`,
        createdAt: new Date().toISOString(),
        source: { id: source.id, name: source.name, tier: capabilities.tier, baseUrl: source.baseUrl },
        request,
        unavailable: capabilities.unavailable,
        versions: options.versions,
      }, (channel, text) => void send("delta", { channel, text }));
      await send("start", { id: writer.manifest.id });

      const started = performance.now();
      let outcome: RunOutcome;
      try {
        outcome = await source.run(request, writer, signal);
      } catch (error) {
        outcome = { completion: { state: "error", reason: `The source failed: ${error instanceof Error ? error.message : String(error)}` }, unavailable: [] };
      }
      const manifest = writer.finish(outcome);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      log(`  ┊ capture   ${source.name} · ${request.model} · ${manifest.completion.state} ${seconds}s`);
      await send("done", { manifest });
    });
  });

  app.all("/api/*", (c) => c.json({ error: "No such API route." }, 404));

  if (webDir) {
    const index = () => readFileSync(join(webDir, "index.html"), "utf8")
      .replace("</head>", `<meta name="reasontrace-token" content="${token}"></head>`);
    app.get("*", (c) => {
      const path = normalize(join(webDir, decodeURIComponent(c.req.path)));
      if (path.startsWith(webDir + sep) && existsSync(path) && statSync(path).isFile() && !path.endsWith("index.html")) {
        const cache = c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
        return c.body(readFileSync(path), 200, { "content-type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream", "cache-control": cache });
      }
      return c.html(index(), 200, { "cache-control": "no-store" });
    });
  }

  return app;
}
