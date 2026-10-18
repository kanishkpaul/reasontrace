import { isSolveRequest, type RunManifest } from "@reasontrace/format";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../lib/api";
import { COMPLETION, TIER } from "../lib/completion";
import { useTraceStore } from "../store";

/** A prompt's first line, or a problem's, without the comment marker it often starts with. */
const firstLine = (request: RunManifest["request"]) =>
  isSolveRequest(request) ? request.problem.trim().split("\n")[0].replace(/^;+\s*/, "") : request.prompt.trim().split("\n")[0];

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Runs recorded by the local server, grouped by model, newest first. */
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

  const groups = new Map<string, RunManifest[]>();
  for (const run of runs) {
    const key = isSolveRequest(run.request) ? run.request.engine : run.request.model;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }

  return (
    <section>
      <h2 className="section-heading">Runs</h2>
      {error && <p className="hint hint--error" role="alert">{error}</p>}
      {runs.length === 0 && !error && <p className="hint">No runs yet. Runs you start appear here, and stay in the runs folder.</p>}
      {[...groups.entries()].map(([model, list]) => (
        <div key={model} className="run-group">
          <p className="run-group__model">
            <span className="run-group__name">{model}</span>
            <span className="badge badge--muted">{TIER[list[0].source.tier]}</span>
          </p>
          {list.map((run) => {
            const { word, dot } = COMPLETION[run.completion.state];
            return (
              <button key={run.id} type="button" className="row sample-row" aria-current={run.id === current} onClick={() => void open(run.id)}>
                <span className="row__title">{firstLine(run.request)}</span>
                <span className="row__meta">{time(run.createdAt)}</span>
                <span className="row__desc"><span className={`dot ${dot}`} /> {word} · {run.source.name}</span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}
