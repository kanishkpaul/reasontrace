# Build plan

Phases are ordered by dependency: each phase uses what the phases before it
built. A phase is done when its gate passes. A gate is a test, a command or a
run directory, never a sentence in a document. If a defect turns up after a
gate passed, the gate reopens.

Bug IDs (P1, D3, …) refer to the audit in [PLAN.md](PLAN.md).

| Phase | Builds | Depends on |
|---|---|---|
| 0 | Foundation: workspaces, tests for every known bug, CI | — |
| 1 | Correctness: format v1, parser, diagnostics, graph, import | 0 |
| 2 | Design system in the viewer | 1 |
| 3 | Local server, keys, BYOK and local-server sources | 0 |
| 4 | Full tier: Python sidecar and activation capture | 3 |
| 5 | Ground truth and controls | 4 |
| 6 | Decoders: logit lens and SAE features | 4, 5 |
| 7 | First finding view: when the answer is committed | 2, 6 |
| 8 | Symbolic engine: z3 | 2, 3 |
| 9 | Neurosymbolic pipelines | 3 or 4, 8 |
| 10 | The viewer's own hacker aesthetic | 2–9 |
| 11 | Live testing against real providers, servers, models and engines | 3–10 |
| 12 | The README, for researchers, engineers and recruiters | 11 |

Phase 8 can start any time after phases 2 and 3. Phases 10 to 12 come last,
in that order.

The tool does a few things well rather than everything: anything not listed
here (more sources, more decoders, interventions, review annotations, a
hosted build) stays out until a phase above needs it.

---

## Phase 0: Foundation

**Builds**
- npm workspaces: `apps/web` (the prototype), `packages/format` (types),
  `packages/analysis` (parser and diagnostics, no DOM).
- Vitest. Every audit bug reproduced by a probe becomes a test that fails
  until its fix lands; trace fixtures under `fixtures/traces/`.
- `npm run check:deps`, which enforces ARCHITECTURE.md §2.
- CI: `npm ci`, lint, typecheck, test, build, `check:deps`, and the
  attribution check over every commit.

**Gate**
- `npm run check` passes locally and in CI.
- Each bug test fails against the code it was written for.
- `check:deps` fails on a test workspace in which one capability package
  depends on another.

## Phase 1: Correctness

**Builds**
- Format v1 in `packages/format`: run, step, event, depth, the six charter
  labels plus `unavailable` with a reason, separate `next` and `supports`
  edges. A reader for the prototype's v0 JSON.
- Parser fixes P1–P16; diagnostics fixes D1–D12 in one iterative,
  memoised pass; graph and replay fixes G1–G6, T1–T3, S1–S2; import and
  storage fixes I1–I9; wording fixes C1–C5.
- Every finding carries its rule, supporting events and limitations.

**Gate**
- Every bug test passes with its `.fails` marker removed.
- Diagnostics over a 50,000-event fixture finish in under 500 ms.
- A trace with no answer never reports a grounded answer.

## Phase 2: Design system

**Builds**
- The `lens` skin through the kit's Tailwind bridge; `base.css`, `skins.css`
  and `components.css` loaded once; fonts bundled.
- Every colour, radius, shadow and spacing value from `--ui-*` and related
  tokens; the primitives in `design/system/COMPONENTS.md`.
- The evidence-label component from `design/README.md`, used for every value.
- The direction's layout: runs sidebar, behaviour / stated / internals
  columns on one scrubber, step-detail rail, manifest status bar. The step
  graph stays as a second view.

**Gate**
- `npm run check:colours`, which rejects hex values, colour functions, seed
  tokens and Tailwind palette classes in `apps/web/src`, passes.
- The app loads and works with the network disabled.
- At 375 px wide there is no horizontal scroll, in light and dark.

## Phase 3: Local server and sources

**Builds**
- `apps/server`: Hono on `127.0.0.1`, per-launch token, serves the viewer and
  `/api`; the registry.
- `packages/core`: the `Source` and `Engine` interfaces, the run-directory
  writer and reader, the determinism comparison.
- `packages/keys`: keychain storage and a `Secret` that never serialises.
- Sources: OpenAI-compatible (OpenAI, OpenRouter, Groq, Gemini's compatible
  endpoint; Ollama, LM Studio, llama.cpp server, vLLM) with log-probabilities
  and raw `<think>` text; Anthropic (thinking blocks, labelled as provider
  summaries).
- Per-model capability declarations: unavailable depths carry reasons.
- Viewer: key entry, model picker, prompt runner with streaming, run list,
  token view with probabilities when present.

**Gate**
- Each source parses recorded fixtures (success, errors, refusals,
  truncation, timeouts) into the right events and labels.
- No default test touches the network. A live smoke test runs only with
  `RT_LIVE_TESTS=1` and a key present.
- For every source, the key's bytes appear nowhere in the run directory or
  the server log.
- A model without a depth produces an `unavailable` record with a reason, and
  the viewer renders it as such (component test).
- A request without the launch token is rejected.

## Phase 4: Full tier

**Builds**
- `bridge/python` (uv): Gemma 3 1B-it and Qwen3 0.6B on MPS through nnsight;
  activation capture to a plan naming layers, positions
  and pooling; tensors as safetensors.
- `packages/sidecar`: starts the sidecar and speaks JSON-RPC on stdio.
- The manifest records quantization, dtype, device, cache state and peak
  memory.

**Gate**
- Captured activations for a fixed prompt match a stored Hugging Face
  transformers reference within the stated tolerance.
- Two runs of one plan pass the determinism check; a run with the cache
  toggled is reported as a different configuration.
- With Python absent, the full tier shows as unavailable with that reason.

## Phase 5: Ground truth and controls

**Builds**
- A harness that runs a decoder against a model with a planted circuit.
- Reusable controls: random direction, shuffled inputs, untrained weights.
- Validation results stored with every decoder attachment and shown in the
  viewer.

**Gate**
- On the planted-circuit model, the logit lens recovers the planted variable,
  and each control fails to. A control that also succeeds
  marks the decoder unvalidated.

## Phase 6: Decoders

**Builds**
- Logit lens.
- Gemma Scope SAEs through SAELens, with the top features per step.

**Gate**
- SAE reconstruction error on captured Gemma 3 activations is in the range
  the Gemma Scope release reports.
- Every decoder passes the phase 5 harness or is shown as unvalidated.

## Phase 7: First finding view

**Builds**
- Sentence-level segmentation of reasoning text into steps.
- The answer-commitment view: the step where the answer becomes decodable
  from internals, next to the step where the stated reasoning commits to it.

**Gate**
- A run over a fixed problem set, with controls, is stored under `fixtures/`
  and renders, including cases where the answer is never decodable early.

## Phase 8: Symbolic engine

**Builds**
- z3 through `z3-solver`: models, unsat cores and proofs as `exact`
  derivations.
- A proof-tree view that collapses large derivations and expands on demand.

**Gate**
- Derivations for small known problems match hand-checked trees stored as
  fixtures.
- A derivation over the size limit is truncated with a recorded reason.

## Phase 9: Neurosymbolic pipelines

**Builds**
- LLM → solver pipelines with the text-to-formula translation as a
  `nesy.translation/1` event. Internals at the handoff come from the full
  tier when it is available.
- A handoff view with the text, the formula and the derivation side by side.

**Gate**
- A fixture with a deliberate translation error shows where the formula
  departs from the text.

## Phase 10: Hacker aesthetic

**Builds**
- The viewer's own look, made for this app rather than taken from the
  design kit, and replacing phase 2's: a terminal on a dark ground, after Mr.
  Robot. Dark only. Monospace throughout, phosphor-style text, box-drawing
  rules and panel borders, a vim-style status line, a blinking cursor where
  input goes, and an ASCII bar for each probability. Its colour, type and
  spacing tokens live in `apps/web`, and `npm run check:colours` enforces
  them in place of `design/`.
- Every view from phases 2–9 restyled, including the token, decoder,
  answer-commitment, proof-tree and handoff views. Every action still works
  as it did.
- The design rules move with it: AGENTS.md's Design section, `design/` and
  `design/kit.json` are replaced by the app's own style notes in the same
  change.

**Gate**
- Nothing in `apps/web` imports from `design/`, and `check:colours` passes
  against the app's own tokens.
- Each evidence label and each run ending (complete, truncated, refused,
  error, timed out, stopped) and "unavailable" stay distinguishable without
  colour: a component test checks each has its own mark and word.
- A script checks every text and background token pair for WCAG AA
  contrast.
- With `prefers-reduced-motion`, nothing blinks or animates.
- At 375 px wide there is no horizontal scroll, and the app loads and works
  with the network disabled, fonts included.

## Phase 11: Live testing

**Builds**
- Live runs of every source, tier and engine the earlier phases built:
  each hosted provider, with its key or with a dummy key against a local
  server standing in for its API (PLAN.md D-6), each local server (Ollama,
  LM Studio, llama.cpp, vLLM), the full tier on Gemma 3 1B and Qwen3 0.6B,
  z3, and a neurosymbolic pipeline on a Virgil task.
- Responses recorded from local servers, including the stand-ins, join the
  fixtures written by hand from provider documentation, with keys scrubbed.
- One live-test command that runs whatever is available on the machine and
  reports each source as passed, failed (with the error) or skipped (with
  the reason: no key, server not running, Python absent).

**Gate**
- `npm run test:live` passes for every source with a key or server present,
  and reports every other source as skipped with its reason.
- Every fixture says where it came from. One written from documentation
  remains only for a reply no local server sends (a refusal, an error
  mid-stream, a key echoed back, a provider's own stream and error shapes).
- Each live run leaves a run directory that the viewer opens, and the key
  check (no key bytes in the run directory or the server log) passes on
  those directories.
- Every defect the live runs find is fixed with a test, or listed in
  PLAN.md by ID.

## Phase 12: README

**Builds**
- A README that answers, in order: what ReasonTrace shows and why it
  matters; what it will not claim; how to run it; what each tier and
  source can show; how it is built; how it was checked.
- Readable by three audiences: researchers (the evidence labels, the
  controls, the limits of stated reasoning, what a finding can and cannot
  bear), engineers (install, architecture, how to add a source), and
  recruiters (what was built and how it was tested, in the first screen).
- Screenshots and one short recording, taken from the current build with
  real runs from phase 11, in the phase 10 aesthetic.

**Gate**
- Every command in the README, run in order on a fresh clone, works.
- Every screenshot and the recording come from the current build and a run
  directory in the repository or under `fixtures/`.
- Every claim about behaviour links to the test or run directory that
  shows it; nothing describes a feature that a test doesn't cover.
- The README contains no status the tests could contradict: no hand-kept
  progress lists or counts.
