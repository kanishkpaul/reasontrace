import { isSolveRequest, type RunManifest } from "@reasontrace/format";

/**
 * Runs by source and model, in the order given. One model can be served by
 * several sources of different tiers, and a group shows one tier for all its runs.
 */
export function groupRuns(runs: RunManifest[]): { name: string; tier: RunManifest["source"]["tier"]; runs: RunManifest[] }[] {
  const groups = new Map<string, { name: string; tier: RunManifest["source"]["tier"]; runs: RunManifest[] }>();
  for (const run of runs) {
    const name = isSolveRequest(run.request) ? run.request.engine : run.request.model;
    const key = `${run.source.id}\u0000${name}`;
    const group = groups.get(key) ?? { name, tier: run.source.tier, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }
  return [...groups.values()];
}
