import { isSolveRequest, type RunManifest } from "@reasontrace/format";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../lib/api";
import { TIER } from "../lib/completion";
import { groupRuns } from "../lib/runGroups";
import { Ending } from "./EvidenceLabel";
import { useTraceStore } from "../store";

/** What was asked, by its first line: a pipeline's problem in words, a solve's problem without its comment marker, or a prompt. */
function firstLine({ request, pipeline }: RunManifest): string {
  if (pipeline) return pipeline.text.trim().split("\n")[0];
  return isSolveRequest(request) ? request.problem.trim().split("\n")[0].replace(/^;+\s*/, "") : request.prompt.trim().split("\n")[0];
}

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Runs recorded by the local server, grouped by source and model, newest first. */
export function RunList({ onOpen }: { onOpen?: () => void }) {
  const { running, current, openRun } = useTraceStore(useShallow((s) => ({ running: s.live !== null, current: s.run?.manifest.id, openRun: s.openRun })));
  const [runs, setRuns] = useState<RunManifest[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Read again whenever a run finishes or another one opens: a solve opens its run when it is done.
  useEffect(() => {
    if (running) return;
    let cancelled = false;
    api.runs().then((list) => {
      if (!cancelled) setRuns(list);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [running, current]);

  const open = (id: string) => api.run(id).then((run) => {
    openRun(run);
    onOpen?.();
  }).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  return (
    <section>
      <h2 className="section-heading">Runs</h2>
      {error && <p className="hint hint--error" role="alert">{error}</p>}
      {runs.length === 0 && !error && <p className="hint">No runs yet. Runs you start appear here, and stay in the runs folder.</p>}
      {groupRuns(runs).map((group) => (
        <div key={`${group.runs[0].source.id} ${group.name}`} className="run-group">
          <p className="run-group__model">
            <span className="run-group__name">{group.name}</span>
            <span className="badge badge--muted">{TIER[group.tier]}</span>
          </p>
          {group.runs.map((run) => {
            return (
              <button key={run.id} type="button" className="row sample-row" aria-current={run.id === current} onClick={() => void open(run.id)}>
                <span className="row__title">{firstLine(run)}</span>
                <span className="row__meta">{time(run.createdAt)}</span>
                <span className="row__desc"><Ending state={run.completion.state} /> · {run.source.name}{run.pipeline ? ` → ${run.pipeline.engine}` : ""}</span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}
