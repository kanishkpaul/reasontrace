import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { FORMAT_VERSION, type Attachment, type Run, type RunManifest, type TraceEvent, type UnavailableDepth } from "@reasontrace/format";
import type { EventSink, RunOutcome } from "./source.ts";

const RUN_ID = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$/;

/** A sortable run ID: UTC date and time, then random hex so two runs in one second don't collide. */
export function newRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

/** Whether `id` has the shape `newRunId` makes, so it can't name a path outside the runs directory. */
export const isRunId = (id: string): boolean => RUN_ID.test(id);

export class RunReadError extends Error {}

/**
 * Writes one run directory as the run happens: the manifest first, then each
 * event as it is captured. A run that fails partway keeps what it captured and
 * its manifest says why it stopped (docs/ARCHITECTURE.md §3).
 */
export class RunWriter implements EventSink {
  readonly dir: string;
  manifest: RunManifest;
  private readonly onDelta: (channel: "reasoning" | "output", text: string) => void;

  constructor(root: string, manifest: Omit<RunManifest, "formatVersion" | "completion">, onDelta: RunWriter["onDelta"] = () => {}) {
    if (!isRunId(manifest.id)) throw new Error(`Not a run ID: ${manifest.id}`);
    this.dir = join(root, manifest.id);
    this.manifest = { formatVersion: FORMAT_VERSION, ...manifest, completion: { state: "running" } };
    this.onDelta = onDelta;
    mkdirSync(join(this.dir, "attachments"), { recursive: true });
    writeFileSync(join(this.dir, "events.jsonl"), "");
    this.writeManifest();
  }

  delta(channel: "reasoning" | "output", text: string): void {
    this.onDelta(channel, text);
  }

  event(event: TraceEvent): void {
    appendFileSync(join(this.dir, "events.jsonl"), `${JSON.stringify(event)}\n`);
  }

  attach(attachment: Attachment): void {
    appendFileSync(join(this.dir, "attachments", "source.jsonl"), `${JSON.stringify(attachment)}\n`);
  }

  finish(outcome: RunOutcome, now = new Date()): RunManifest {
    this.manifest = {
      ...this.manifest,
      finishedAt: now.toISOString(),
      completion: outcome.completion,
      unavailable: mergeUnavailable(this.manifest.unavailable, outcome.unavailable),
      providerRequest: outcome.providerRequest,
      respondingModel: outcome.respondingModel,
      usage: outcome.usage,
      runtime: outcome.runtime,
    };
    this.writeManifest();
    return this.manifest;
  }

  private writeManifest(): void {
    writeFileSync(join(this.dir, "manifest.json"), `${JSON.stringify(this.manifest, null, 2)}\n`);
  }
}

/** Declared depths first; a depth found missing later only adds a reason when none was declared. */
function mergeUnavailable(declared: UnavailableDepth[], found: UnavailableDepth[]): UnavailableDepth[] {
  const depths = new Set(declared.map((u) => u.depth));
  return [...declared, ...found.filter((u) => !depths.has(u.depth))];
}

function jsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch {
      throw new RunReadError(`${path}: line ${index + 1} is not JSON.`);
    }
  });
}

export function readManifest(root: string, id: string): RunManifest {
  if (!isRunId(id)) throw new RunReadError(`Not a run ID: ${id}`);
  const path = join(root, id, "manifest.json");
  if (!existsSync(path)) throw new RunReadError(`No run ${id} in ${root}.`);
  return JSON.parse(readFileSync(path, "utf8")) as RunManifest;
}

/** A run directory read back as one run: its manifest, its events as a trace, and its attachments. */
export function readRun(root: string, id: string): Run {
  const manifest = readManifest(root, id);
  const dir = join(root, id);
  const attachmentsDir = join(dir, "attachments");
  const attachments = existsSync(attachmentsDir)
    ? readdirSync(attachmentsDir).filter((name) => name.endsWith(".jsonl")).sort().flatMap((name) => jsonLines<Attachment>(join(attachmentsDir, name)))
    : [];
  return {
    manifest,
    trace: {
      formatVersion: FORMAT_VERSION,
      title: manifest.title,
      events: jsonLines<TraceEvent>(join(dir, "events.jsonl")),
      unavailable: manifest.unavailable,
    },
    attachments,
  };
}

/** Every run's manifest under `root`, newest first. Directories that aren't runs are skipped. */
export function listRuns(root: string): RunManifest[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => isRunId(name) && existsSync(join(root, name, "manifest.json")))
    .sort()
    .reverse()
    .map((id) => readManifest(root, id));
}

/**
 * Marks runs still recorded as running as aborted. Call it when a server
 * starts: a run it didn't start belongs to a process that has gone.
 */
export function closeInterruptedRuns(root: string): string[] {
  const closed: string[] = [];
  for (const manifest of listRuns(root)) {
    if (manifest.completion.state !== "running") continue;
    const updated: RunManifest = { ...manifest, completion: { state: "aborted", reason: "The server stopped before the run finished." } };
    writeFileSync(join(root, manifest.id, "manifest.json"), `${JSON.stringify(updated, null, 2)}\n`);
    closed.push(manifest.id);
  }
  return closed;
}
