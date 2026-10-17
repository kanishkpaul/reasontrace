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

Phase 8 can start any time after phases 2 and 3.

The tool does a few things well rather than everything: anything not listed
here (more sources, more decoders, interventions, review annotations, a
hosted build) stays out until a phase above needs it.

---

## Phase 0: Foundation

**Builds**
- npm workspaces: `apps/web` (the prototype), `packages/format` (types),
  `packages/analysis` (parser and diagnostics, no DOM).
- Vitest. Every audit bug reproduced by a probe becomes a test, marked as an
  expected failure (`test.fails`) until its fix lands; trace fixtures under
  `fixtures/traces/`.
- `npm run check:deps`, which enforces ARCHITECTURE.md §2.
- CI: `npm ci`, lint, typecheck, test, build, `check:deps`, and the
  attribution check over every commit.

**Gate**
- `npm run check` passes locally and in CI.
- Each bug test fails when its `.fails` marker is removed.
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
- A lint rule rejecting hex, `rgb(` and Tailwind palette colours in
  `apps/web/src` passes.
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
