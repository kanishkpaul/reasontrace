import type { Run } from "@reasontrace/format";

export interface Comparison {
  /** Settings that differ between the two manifests, as dotted paths. Empty when the runs are comparable. */
  configurationDifferences: string[];
  /** The first point where the outputs part, or null when they match within `tolerance`. */
  divergence: string | null;
  /** The largest log-probability difference over tokens both runs share. Null when neither run has probabilities. */
  maxLogprobDifference: number | null;
  tolerance: number;
}

/** Determinism check settings: the source, its endpoint, the request and what was sent. */
const configurationOf = (run: Run) => ({
  source: { id: run.manifest.source.id, baseUrl: run.manifest.source.baseUrl },
  request: run.manifest.request,
  providerRequest: run.manifest.providerRequest ?? null,
  respondingModel: run.manifest.respondingModel ?? null,
});

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
 * log-probabilities within `tolerance`.
 */
export function compareRuns(a: Run, b: Run, tolerance = 1e-4): Comparison {
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

  const tokensB = new Map(b.attachments.map((attachment) => [attachment.eventId, attachment.data.tokens]));
  for (const attachment of a.attachments) {
    const other = tokensB.get(attachment.eventId);
    if (!other) continue;
    attachment.data.tokens.forEach((token, i) => {
      const twin = other[i];
      if (!twin || twin.token !== token.token) return;
      const difference = Math.abs(token.logprob - twin.logprob);
      maxLogprobDifference = Math.max(maxLogprobDifference ?? 0, difference);
      if (!divergence && difference > tolerance) {
        divergence = `token ${i + 1} of ${attachment.eventId} ("${token.token}"): log-probability differs by ${difference.toPrecision(3)}, over the tolerance of ${tolerance}`;
      }
    });
  }

  return { configurationDifferences, divergence, maxLogprobDifference, tolerance };
}

function firstDifference(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
