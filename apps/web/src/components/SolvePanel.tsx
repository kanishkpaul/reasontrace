import { useEffect, useState } from "react";
import { api, ApiError, type EngineInfo } from "../lib/api";
import { useTraceStore } from "../store";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs a problem through a symbolic engine on the local server, then opens the run. */
export function SolvePanel({ onSolved }: { onSolved?: () => void }) {
  const openRun = useTraceStore((s) => s.openRun);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [engineId, setEngineId] = useState("");
  const [problem, setProblem] = useState("");
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = engines.find((e) => e.id === engineId);

  useEffect(() => {
    api.engines().then((list) => {
      setEngines(list);
      setEngineId(list[0]?.id ?? "");
    }, (e) => setError(message(e)));
  }, []);

  const solve = async () => {
    setError(null);
    setSolving(true);
    try {
      const manifest = await api.solve(engineId, problem);
      openRun(await api.run(manifest.id));
      onSolved?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `The solve failed: ${message(e)}`);
    } finally {
      setSolving(false);
    }
  };

  return (
    <section className="run-panel">
      <h2 className="section-heading">Solve a problem</h2>
      <label className="label" htmlFor="solve-engine">Engine</label>
      <select id="solve-engine" className="field" value={engineId} onChange={(e) => setEngineId(e.target.value)} disabled={solving}>
        {engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <label className="label" htmlFor="solve-problem">Problem{engine ? `, in ${engine.language}` : ""}</label>
      <textarea id="solve-problem" className="field run-panel__prompt" value={problem} onChange={(e) => setProblem(e.target.value)} disabled={solving} spellCheck={false} />
      <div className="run-panel__actions">
        <button type="button" className="btn btn--sm" onClick={() => void solve()} disabled={!engine || !problem.trim() || solving}>{solving ? "Solving…" : "Solve"}</button>
      </div>
      {error && <p className="hint hint--error" role="alert">{error}</p>}
    </section>
  );
}
