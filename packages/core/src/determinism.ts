import { join } from "node:path";
import type { Attachment, ResidualAttachment, Run, TopKAttachment } from "@reasontrace/format";
import { readRun } from "./runDir.ts";
import { readSafetensors } from "./safetensors.ts";

export interface Comparison {
  /** Settings that differ between the two manifests, as dotted paths. Empty when the runs are comparable. */
  configurationDifferences: string[];
  /** The first point where the outputs part, or null when they match within `tolerance`. */
  divergence: string | null;
  /** The largest log-probability difference over tokens both runs share. Null when neither run has probabilities. */
  maxLogprobDifference: number | null;
  /** The largest activation difference, as a fraction of the tensor's largest value. Null when the runs captured none. */
  maxTensorDifference: number | null;
  tolerance: Tolerance;
}

export interface Tolerance {
  /** Absolute, in nats. */
  logprob: number;
  /** Relative to the largest absolute value in the tensor. */
  tensor: number;
}

export const DEFAULT_TOLERANCE: Tolerance = { logprob: 1e-4, tensor: 1e-4 };

/**
 * Determinism check settings: the source, its endpoint, the request, what was
 * sent and, for runs of local weights, how they ran. Peak memory is a result,
 * not a setting.
 */
const configurationOf = (run: Run) => {
  const runtime: Record<string, unknown> = { ...run.manifest.runtime };
  delete runtime.peakMemoryBytes;
  return {
    source: { id: run.manifest.source.id, baseUrl: run.manifest.source.baseUrl },
    request: run.manifest.request,
    providerRequest: run.manifest.providerRequest ?? null,
    respondingModel: run.manifest.respondingModel ?? null,
    runtime,
  };
};

const isTopK = (a: Attachment): a is TopKAttachment => a.kind === "probs.top_k/1";
const isResidual = (a: Attachment): a is ResidualAttachment => a.kind === "activations.residual/1";

function flatten(value: unknown, path: string, out: Map<string, string>): Map<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, out);
  } else {
    out.set(path, JSON.stringify(value));
  }
  return out;
}

function differences(a: unknown, b: unknown): string[] {
  const left = flatten(a, "", new Map());
  const right = flatten(b, "", new Map());
  return [...new Set([...left.keys(), ...right.keys()])].filter((key) => left.get(key) !== right.get(key)).sort();
}

/**
 * Compares two runs (docs/CHARTER.md §3, rule 3). Two runs with different
 * settings are reported as different configurations, not as a determinism
 * failure. With matching settings, events must match exactly and token
 * log-probabilities within the tolerance. Activations are compared by
 * `compareRunDirs`, which can read them.
 */
export function compareRuns(a: Run, b: Run, tolerance: Tolerance = DEFAULT_TOLERANCE): Comparison {
  const configurationDifferences = differences(configurationOf(a), configurationOf(b));
  let divergence: string | null = null;
  let maxLogprobDifference: number | null = null;

  const eventsA = a.trace.events;
  const eventsB = b.trace.events;
  for (let i = 0; i < Math.max(eventsA.length, eventsB.length) && !divergence; i++) {
    const x = eventsA[i];
    const y = eventsB[i];
    if (!x || !y) divergence = `event ${i + 1}: present in only one run`;
    else if (x.type !== y.type || x.depth !== y.depth) divergence = `event ${i + 1}: ${x.type}/${x.depth} against ${y.type}/${y.depth}`;
    else if (x.content !== y.content) divergence = `event ${i + 1} (${x.type}): text differs from character ${firstDifference(x.content, y.content) + 1}`;
  }

  if (!divergence && a.manifest.completion.state !== b.manifest.completion.state) {
    divergence = `completion: ${a.manifest.completion.state} against ${b.manifest.completion.state}`;
  }

  const tokensB = new Map(b.attachments.filter(isTopK).map((attachment) => [attachment.eventId, attachment.data.tokens]));
  for (const attachment of a.attachments.filter(isTopK)) {
    const other = tokensB.get(attachment.eventId);
    if (!other) continue;
    attachment.data.tokens.forEach((token, i) => {
      const twin = other[i];
      if (!twin || twin.token !== token.token) return;
      const difference = Math.abs(token.logprob - twin.logprob);
      maxLogprobDifference = Math.max(maxLogprobDifference ?? 0, difference);
      if (!divergence && difference > tolerance.logprob) {
        divergence = `token ${i + 1} of ${attachment.eventId} ("${token.token}"): log-probability differs by ${difference.toPrecision(3)}, over the tolerance of ${tolerance.logprob}`;
      }
    });
  }

  return { configurationDifferences, divergence, maxLogprobDifference, maxTensorDifference: null, tolerance };
}

/**
 * `compareRuns`, plus the activations each run stored: every tensor of the
 * first run must exist in the second with the same shape and match within the
 * relative tolerance.
 */
export function compareRunDirs(root: string, idA: string, idB: string, tolerance: Tolerance = DEFAULT_TOLERANCE): Comparison {
  const a = readRun(root, idA);
  const b = readRun(root, idB);
  const comparison = compareRuns(a, b, tolerance);
  const filesB = new Map(b.attachments.filter(isResidual).map((attachment) => [attachment.eventId, attachment.data.file]));

  for (const attachment of a.attachments.filter(isResidual)) {
    const fileB = filesB.get(attachment.eventId);
    if (!fileB) {
      comparison.divergence ??= `activations of ${attachment.eventId}: captured in only the first run`;
      continue;
    }
    const tensorsA = readSafetensors(join(root, idA, attachment.data.file));
    const tensorsB = readSafetensors(join(root, idB, fileB));
    for (const [name, x] of tensorsA) {
      const y = tensorsB.get(name);
      if (!y || x.shape.join("×") !== y.shape.join("×")) {
        comparison.divergence ??= `tensor ${name}: shape ${x.shape.join("×")} against ${y ? y.shape.join("×") : "missing"}`;
        continue;
      }
      let largest = 0;
      let difference = 0;
      for (let i = 0; i < x.values.length; i++) {
        largest = Math.max(largest, Math.abs(y.values[i]));
        difference = Math.max(difference, Math.abs(x.values[i] - y.values[i]));
      }
      const relative = largest === 0 ? difference : difference / largest;
      comparison.maxTensorDifference = Math.max(comparison.maxTensorDifference ?? 0, relative);
      if (relative > tolerance.tensor) {
        comparison.divergence ??= `tensor ${name}: differs by ${relative.toPrecision(3)} of its largest value, over the tolerance of ${tolerance.tensor}`;
      }
    }
  }
  return comparison;
}

function firstDifference(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
