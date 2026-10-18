# Architecture

ReasonTrace is a local web app. A TypeScript server runs on your machine,
holds your API keys, talks to providers, local model servers and symbolic
engines, and serves a React viewer to your browser. Neural internals come from
an optional Python sidecar, because the tools that read a model's activations
(nnsight, SAELens) exist in Python. Every capability is its own
package. The trace format is the only contract between those packages, so
adding a capability means adding one package and one registration line, and
removing one means deleting the same.

```
 producers                          run directory                 consumers
 ─────────                          ─────────────                 ─────────
 Source  (APIs, local servers)  ─┐                           ┌─► Viewer   (React, over /api)
 Engine  (z3)                   ─┼─► events + tensors      ──┤
 Sidecar (Python: weights,      ─┘   + manifest              └─► Decoder  (Python: logit lens, SAE)
          activations, decoders)
 Import  (trace files, OTel)    ───► events only, labelled by what the file can show
```

## 1. Workspace layout

npm workspaces. Packages are created when their phase in
[BUILD_PLAN.md](BUILD_PLAN.md) starts, not ahead of time; the listing below is
the target shape.

```
apps/
  web/               @reasontrace/web        React + Vite viewer
  server/            @reasontrace/server     local HTTP API (Hono on Node); serves web; the registry
packages/
  format/            @reasontrace/format     trace format: types, schema, format_version; no I/O
  analysis/          @reasontrace/analysis   trace import and diagnostics; no I/O, no DOM
  core/              @reasontrace/core       extension interfaces, run directory, determinism check
  keys/              @reasontrace/keys       OS keychain access and redaction
  sources/
    openai/          OpenAI-compatible: OpenAI, OpenRouter, Groq, Gemini, Ollama, LM Studio, llama.cpp, vLLM
    anthropic/       Messages API: thinking blocks
  engines/
    z3/              z3-solver (WebAssembly)
  sidecar/           @reasontrace/sidecar    starts and talks to bridge/python
bridge/python/       capture and decoders (uv project); reads and writes run directories only
fixtures/            recorded provider responses, trace files, small tensors
```

## 2. Dependency rules

```
format  ◄──  analysis
   ▲
   └──  core  ◄──  capability packages  ◄──  apps/server
                                                 │
 apps/web  ──► format, analysis, and /api only ◄─┘
```

1. `format` depends on nothing in the workspace.
2. `analysis` and `core` depend only on `format`.
3. A capability package (`sources/*`, `engines/*`, `sidecar`) depends only on
   `core`, `format` and, for sources, `keys`. **Capability packages never
   depend on each other.**
4. Only `apps/server` depends on capability packages.
5. `apps/web` depends on `format` and `analysis`, and reaches everything else
   through the HTTP API. It never imports a source, an engine or `keys`.
6. Decoders live in the sidecar and work from what a run directory holds.

`npm run check:deps` reads every workspace's `package.json` and fails on an
edge outside these rules. Rule 3 is what makes a capability removable: nothing
but the server can notice it is gone.

## 3. The trace format

The format is versioned (`format_version`). A change that breaks old runs
bumps the major version and ships a reader for the previous one. The
prototype's JSON (`{title, events[]}`) is read as version 0.

- **Run:** one capture. Holds the manifest, the source's declared
  capabilities, and an ordered list of steps.
- **Step:** one unit of progress, in whatever unit the producer has: a
  reasoning sentence, a tool call, a rule application. Steps carry their own
  span (tokens, characters or derivation nodes), so different granularities
  can be aligned.
- **Event:** something that happened in a step, at one depth (`behaviour`,
  `stated`, `probabilities`, `internals`), carrying one evidence label from the
  charter.
- **Edges:** `next` records time order; `supports` records that one event is
  evidence for another. Only the producer or an analyst adds `supports`, and
  time order never implies it.
- **Attachment:** typed data hung on a step or event. Its kind is a namespaced,
  versioned string: `probs.top_k/1`, `lens.logit/1`, `sae.features/1`,
  `symbolic.proof_tree/1`, `nesy.translation/1`. Large tensors are stored once
  in `tensors/` as safetensors and referenced by name.

Producers add events and attachments; decoders add attachments to existing
runs. Nothing rewrites raw captured data.

### Run directory

```
runs/<run-id>/
  manifest.json      model, revision, quantization, dtype, device, cache and batching
                     settings, seeds, library versions, capture plan, capabilities,
                     completion state
  events.jsonl       steps and events in order
  tensors/           safetensors files named in events
  attachments/       one JSONL file per decoder run, with its control result
```

A failed or interrupted run keeps its directory and records why it stopped.

## 4. Extension points

There are five. A new interface outside this list needs a recorded reason in
the pull request that adds it.

```ts
/** A model reached over HTTP: hosted APIs and local servers. */
interface Source {
  id: string;
  needsKey: boolean;
  /** What this source can provide for this model. The viewer draws from this,
   *  so a missing depth shows as unavailable rather than empty. */
  capabilities(model: string): Capabilities;
  models(signal: AbortSignal): Promise<ModelInfo[]>;
  /** Errors, refusals, truncation and timeouts are outcomes, not rejections. */
  run(request: RunRequest, sink: EventSink, signal: AbortSignal): Promise<RunOutcome>;
}

/** A symbolic engine. Its derivations are recorded as `exact`. */
interface Engine {
  id: EngineId;
  solve(problem: Problem, sink: EventSink, signal: AbortSignal): Promise<void>;
}

/** The sidecar's contract, over JSON-RPC on stdio. */
interface Runner {
  capabilities(model: ModelRef): Promise<Capabilities>;
  generate(request: RunRequest, plan: CapturePlan): AsyncIterable<RunEvent>;
}
```

Decoders are the fourth point and live in Python
(`bridge/python/reasontrace_sidecar/decoders/`): each declares its attachment
kind and version, and its attachments carry its validation. A validation comes
from the harness in `reasontrace_sidecar/ground_truth/`, which runs the decoder
on a model with a planted circuit and on three controls (random direction,
shuffled inputs, untrained weights). The decoder is validated only if it
recovers the planted variable and every control fails to. The result is stored
under `fixtures/validation/`, and a test reruns the harness against it. The
viewer shows an attachment as unvalidated when it has no validation, when the
validation failed, or when it was made for another version of the decoder.

The fifth is in the viewer: a **view** is a React component registered for
one attachment kind in `apps/web/src/views/`. An attachment kind with no view
renders through a generic fallback that shows its fields and labels, so a
decoder can ship before its view does.

These signatures are the intended shape. The code is the source of truth once
it exists.

## 5. Adding or removing a capability

**To add one:**

1. Create the package under the matching folder. It depends only on what rule
   3 allows.
2. Add it to `apps/server/package.json`.
3. Add one registration line in `apps/server/src/registry.ts`.
4. If it produces a new attachment kind, add a view, or rely on the fallback.
5. Add recorded fixtures and tests inside the package. Add a row to
   [BORROWED.md](BORROWED.md) for any new dependency.

**To remove one:** delete the package, its dependency line and its
registration line. If anything else fails to build, that is a dependency-rule
violation, and `npm run check:deps` should already have caught it.

## 6. Keys

`@reasontrace/keys` is the only package that touches secrets. It reads and
writes the OS keychain and hands sources a `Secret` whose `toJSON` and
`toString` return a redaction marker. The server has an endpoint to store a
key and none to read one back. The browser never holds a key and never calls a
provider. A workspace test runs each source against fixtures and fails if the
key's bytes appear anywhere in the run directory or the server log.

## 7. The server

`apps/server` listens on `127.0.0.1` only. It generates a token at launch,
passes it to the page it serves, and rejects any `/api` request without it, so
other pages open in the same browser cannot drive it. It also refuses any
request whose `Host` is not `127.0.0.1` or `localhost`: a page on another
domain that rebinds its name to this machine could otherwise read the token
from the served page. It serves the built viewer, so `npm start` is the whole
install. In development, `npm run dev` starts the server with `--dev` (API
only) and Vite, which puts the same token in the page and forwards `/api`.

## 8. The Python sidecar

`bridge/python/` is a uv project. The server starts it on first use, through
`uv run --extra model python -m reasontrace_sidecar`, and talks to it over
JSON-RPC 2.0 on stdio, one message per line: `hello`, `models`, `run` (which
streams `delta` notifications), `decode` and `cancel`. `packages/sidecar` is the client,
and registers it as the `weights` source.

It runs open-weights models (Gemma 3 1B, Qwen3 0.6B, on Apple MPS where
available) in float32 through transformers, and captures the residual stream
through nnsight to the plan it is given, in a teacher-forced forward pass over
the prompt and the generated tokens after generation ends. Tensors go to the
run directory's `tensors/` as safetensors; events and the manifest come back
over JSON-RPC and the server writes them. The manifest records device, dtype,
quantisation, the cache setting, seed, the weights' revision, library versions
and sampled peak memory. The decoders and their ground-truth harness live here
too (§4). After each run, the weights source asks the sidecar to `decode` the
run directory: the logit lens reads every captured layer at every captured
position, and for Gemma 3 1B the Gemma Scope 2 layer-13 residual SAE, through
SAELens, gives each position's strongest features, its L0 and the
reconstruction's FVU. Each decoder writes `attachments/<kind>.jsonl`. A
decoder that can't run (no SAE for the model, its layer not captured, a pooled
capture) is recorded with its reason on the activation event, as
`metadata.decoders`.

A **finding** asks one question of a model across a fixed problem set, with
controls, and is stored whole under `fixtures/findings/`. The first,
answer commitment (`reasontrace_sidecar/findings/`, run by
`scripts/answer_commitment.py`), splits each reasoning text into sentence
steps (`steps.py`), reads the ten digit tokens through the logit lens at each
step's last token, and compares the step from which the answer stays
decodable with the first step that states it. Its rules are free of torch, so
CI recomputes the stored summary from the stored readouts. The viewer opens
stored findings from the sidebar.

Without uv, Python or the model runtime, every depth of the full tier is
unavailable with that reason, and nothing else changes.
