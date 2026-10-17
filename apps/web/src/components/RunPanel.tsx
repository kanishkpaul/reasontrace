import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api, ApiError, startRun, type Capabilities, type ModelInfo, type SourceInfo } from "../lib/api";
import { Unavailable } from "./EvidenceLabel";
import { useTraceStore } from "../store";

const DEFAULT_MAX_TOKENS = 1024;
/** How long to wait for a stopped run's directory to record that it stopped. */
const STOPPED_POLLS = 10;

const SOURCE_KEY = "reasontrace_run_source";

/** The last source picked, a convenience only: storage can be missing or refuse. */
function rememberedSource(): string {
  try {
    return localStorage.getItem(SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberSource(id: string) {
  try {
    localStorage.setItem(SOURCE_KEY, id);
  } catch {
    // Not remembering is fine.
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Runs a prompt against a model the server can reach: a local server, or a
 * provider with your key. Keys go to the server, which keeps them in the OS
 * keychain; the page never holds one after sending it.
 */
export function RunPanel({ onRun }: { onRun?: () => void }) {
  const { live, setLive, openRun } = useTraceStore(useShallow((s) => ({ live: s.live, setLive: s.setLive, openRun: s.openRun })));
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [sourceId, setSourceId] = useState(rememberedSource);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<AbortController | null>(null);

  const source = sources.find((s) => s.id === sourceId);
  const needsKey = Boolean(source?.needsKey && !source.hasKey);

  const loadSources = () => api.sources().then((list) => {
    setSources(list);
    setSourceId((current) => (list.some((s) => s.id === current) ? current : (list.find((s) => !s.needsKey) ?? list[0])?.id ?? ""));
  }).catch((e) => setError(message(e)));

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    if (!sourceId || needsKey) return;
    let cancelled = false;
    api.models(sourceId).then((list) => {
      if (cancelled) return;
      setModels(list);
      setModelsError(null);
      setModel((current) => (list.some((m) => m.id === current) ? current : list[0]?.id ?? ""));
    }).catch((e) => {
      if (cancelled) return;
      setModels([]);
      setModel("");
      setModelsError(message(e));
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, needsKey]);

  useEffect(() => {
    if (!sourceId || !model) return;
    let cancelled = false;
    api.capabilities(sourceId, model).then((c) => {
      if (!cancelled) setCapabilities(c);
    }, (e) => {
      if (!cancelled) setError(message(e));
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, model]);

  const saveKey = async () => {
    if (!keyDraft.trim()) return;
    try {
      await api.storeKey(sourceId, keyDraft);
      setKeyDraft("");
      await loadSources();
    } catch (e) {
      setError(message(e));
    }
  };

  const removeKey = async () => {
    try {
      await api.removeKey(sourceId);
      setModels([]);
      setModel("");
      await loadSources();
    } catch (e) {
      setError(message(e));
    }
  };

  const openWhenRecorded = async (id: string) => {
    for (let i = 0; i < STOPPED_POLLS; i++) {
      const run = await api.run(id);
      if (run.manifest.completion.state !== "running") return openRun(run);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  const run = async () => {
    setError(null);
    const controller = new AbortController();
    stop.current = controller;
    let runId: string | null = null;
    setLive({ title: `${model} · ${prompt.trim().split("\n")[0].slice(0, 60)}`, reasoning: "", output: "" });
    onRun?.();
    try {
      await startRun({ source: sourceId, model, prompt, maxTokens }, {
        onStart: (id) => {
          runId = id;
        },
        onDelta: (channel, text) => useTraceStore.setState((s) => ({ live: s.live && { ...s.live, [channel]: s.live[channel] + text } })),
      }, controller.signal);
      if (runId) await openWhenRecorded(runId);
    } catch (e) {
      if (controller.signal.aborted && runId) await openWhenRecorded(runId).catch((err) => setError(message(err)));
      else setError(e instanceof ApiError ? e.message : `The run failed: ${message(e)}`);
    } finally {
      stop.current = null;
      setLive(null);
    }
  };

  const local = sources.filter((s) => !s.needsKey);
  const keyed = sources.filter((s) => s.needsKey);

  return (
    <section className="run-panel">
      <h2 className="section-heading">Run a model</h2>

      <label className="label" htmlFor="run-source">Source</label>
      <select id="run-source" className="field" value={sourceId} onChange={(e) => { setSourceId(e.target.value); rememberSource(e.target.value); }} disabled={Boolean(live)}>
        <optgroup label="On this machine">
          {local.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </optgroup>
        <optgroup label="With your key">
          {keyed.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasKey ? "" : " · no key"}</option>)}
        </optgroup>
      </select>
      {source && <p className="hint run-panel__where">{source.baseUrl}</p>}

      {needsKey ? (
        <form className="run-panel__key" onSubmit={(e) => { e.preventDefault(); void saveKey(); }}>
          <label className="label" htmlFor="run-key">{source?.name} key</label>
          <input id="run-key" className="field" type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
          <p className="hint">Kept in your OS keychain by the local server. It never comes back to this page.</p>
          <button type="submit" className="btn btn--sm" disabled={!keyDraft.trim()}>Save key</button>
        </form>
      ) : (
        <>
          {source?.needsKey && (
            <p className="hint">
              Key in your OS keychain. <button type="button" className="btn btn--text btn--xs" onClick={() => void removeKey()}>Remove</button>
            </p>
          )}
          <label className="label" htmlFor="run-model">Model</label>
          <select id="run-model" className="field" value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length || Boolean(live)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
          </select>
          {modelsError && <p className="hint hint--error" role="alert">{modelsError}</p>}
          {model && capabilities && capabilities.unavailable.length > 0 && (
            <ul className="run-panel__unavailable" aria-label="What this model can't show">
              {capabilities.unavailable.map((u) => <li key={u.depth}><Unavailable reason={`${u.depth}: ${u.reason}`} /></li>)}
            </ul>
          )}

          <label className="label" htmlFor="run-prompt">Prompt</label>
          <textarea id="run-prompt" className="field run-panel__prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={Boolean(live)} />

          <label className="label" htmlFor="run-max">Output token limit</label>
          <input id="run-max" className="field run-panel__max" type="number" min={1} max={200000} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} disabled={Boolean(live)} />

          <div className="run-panel__actions">
            {live ? (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => stop.current?.abort()}>Stop</button>
            ) : (
              <button type="button" className="btn btn--sm" onClick={() => void run()} disabled={!model || !prompt.trim() || !(maxTokens >= 1)}>Run</button>
            )}
          </div>
        </>
      )}
      {error && <p className="hint hint--error" role="alert">{error}</p>}
    </section>
  );
}
