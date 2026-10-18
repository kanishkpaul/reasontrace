import { useState } from "react";
import { loadFinding, storedFindings } from "../lib/findings";
import { useTraceStore } from "../store";

/** The findings stored with the app, as a list of things to open. */
export function FindingPicker() {
  const setFinding = useTraceStore((s) => s.setFinding);
  const [error, setError] = useState<string | null>(null);
  return (
    <section>
      <h2 className="section-heading">Findings</h2>
      {storedFindings.map((f) => (
        <button key={f.key} type="button" className="row sample-row" onClick={() => loadFinding(f.url).then(setFinding, (e: Error) => setError(e.message))}>
          <span className="row__title">{f.title}</span>
          <span className="row__desc">{f.description}</span>
        </button>
      ))}
      {error && <p className="hint" data-warning>{error}</p>}
    </section>
  );
}
