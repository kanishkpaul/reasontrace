# ReasonTrace: bug-fix and webapp plan

Scope: the React prototype on `main` (2,900 lines of TypeScript), plus the
direction and design system kept on the local `new` branch. Goal: one local-first
web app that inspects neural, symbolic and neurosymbolic models, through your own
API keys (BYOK) or models on your machine, and labels every value by how far it
can be trusted.

## 0. Where things stand

| Item | State |
|---|---|
| `new` branch | Deleted from GitHub. Kept locally as `new` (4542842): charter, architecture, build plan, rules, commit hooks, CI attribution check, `design/`. |
| `main` on GitHub | eee936b. Prototype + `TODO.md`. No commit on `main` carries an AI trailer. |
| Leftover trailer | `refs/pull/1/head` (1c0c660, `Co-Authored-By: Claude Opus 5.5`). GitHub owns pull refs and rejects pushes to them; only GitHub Support can purge it. PR #1 was squash-merged, so `main` never received it. |
| Build / lint | `npm run build` and `npm run lint` pass. There are no tests. |
| `npm audit` | 0 in production deps; 7 in dev deps (1 moderate, 6 high), all under `vite`. |
| Local `old` branch | d2ca62e, upstream gone. It is an ancestor of `main`, so it can be deleted. |

## 1. Bugs found

Every row marked **ran** was reproduced by a probe script against the real
modules (`parseTrace.ts`, `diagnostics.ts`, `graph.ts`); its output is quoted.
Rows marked **read** come from reading the code and have not yet been run in a
browser.

### 1.1 Parser (`src/lib/parseTrace.ts`)

| ID | Bug | Where | Evidence |
|---|---|---|---|
| P1 | Transcript events lose their evidence mode: `finalizeEvent` doesn't copy it | :294–302 | ran: `[null,null,null]` |
| P2 | Standard ReAct format breaks. `Final Answer:` and `Action Input:` match no prefix, so they are appended to the previous event. The answer becomes part of a hypothesis | :167–175 | ran: `["hypothesis","done\|Final Answer: 42"]` |
| P3 | Malformed JSON falls through to the transcript parser and becomes one `hypothesis` with no error, so a typo looks like model reasoning | :319–347 | ran: `[null, [["hypothesis", null]]]` |
| P4 | Chat import labels every assistant message without tool calls `final_answer`, including mid-conversation turns | :120 | ran: `["observation","final_answer","observation","final_answer"]` |
| P5 | Chat, Responses and transcript parsers link each event to the one before it, so time order is treated as evidence (root cause of D3) | :106, :139, :228–233 | ran via D3 |
| P6 | JSON `type: "assistant"` becomes `hypothesis` with evidence mode `explicit`: the model's output is presented as its reasoning (charter §2) | :73, :86 | ran: `[["hypothesis","explicit"]]` |
| P7 | `id: 0` is falsy and gets a random ID. Random IDs differ on every parse, so links to them can't resolve. Duplicate IDs are not detected | :33 | ran: two `id: 0` events became `ev-njnx9ju`, `ev-b9gm70i` |
| P8 | Object `content` renders as `[object Object]` | :36 | ran |
| P9 | Confidence isn't normalised or clamped: `85` stays `85` (renders as 8500%) | :37 | ran |
| P10 | A non-string `title` (number, object) is kept. Export then crashes on `title.replace` | :28, :21, :23 | ran: `typeof title === "number"` |
| P11 | `Tool: web_search` loses the tool name: the line prefix eats `Tool:` before the tool regex runs | :169, :277 | ran: `[["action",null]]` |
| P12 | `confidence: 100%` is not parsed; any `(5%)` in an observation becomes its confidence | :251–253 | ran: `[null]`, `[0.05]` |
| P13 | `Error:` or `Result:` at the start of a line inside tool output starts a new event | :170, :172 | read |
| P14 | Responses: a tool result's `tool` is its `call_id`, not the tool name; every `message` item becomes `final_answer` | :146, :148 | ran (chat equivalent: `"1"`) |
| P15 | Cyclic and self links are accepted | :325–333 | ran: `[["b"],["a"]]` |
| P16 | A `null` element in `events` throws inside `parseJsonTrace`, which returns `null`, so the JSON is re-parsed as a transcript (see P3) | :32 | read |

### 1.2 Diagnostics (`src/lib/diagnostics.ts`)

| ID | Bug | Where | Evidence |
|---|---|---|---|
| D1 | Graph walks recurse once per event and overflow the stack when no target type appears on the path | :59–92 | ran: 4,000 events OK, 8,000 `RangeError: Maximum call stack size exceeded` |
| D2 | Each event starts a fresh walk, so the cost is quadratic. The UI runs it three times per load (`Layout.tsx:41`, `TraceAnalysisSummary.tsx:8`, `DiagnosisPanel.tsx:10`) | :96–177 | ran: 4,000 events = 1.4 s per call |
| D3 | Evidence coverage counts descendants as support, and with P5 every claim has one. Every bundled sample scores 100% | :177 | ran: all six samples `100` |
| D4 | `hasEvidenceChain` defaults to `true`; a trace with no answer shows "Evidence-grounded output" | :121 | ran: `true` |
| D5 | An answer counts as grounded if any `belief_update` precedes it, even an ungrounded one. One grounded answer clears all others | :124, :175 | ran: `true` with no observation on the path |
| D6 | The tool-loop rule needs 3 consecutive same-tool calls and reports only the first loop. It misses the bundled web-agent loop | :140–151 | ran: flight-booker `[]` (tools `click,click,dom,click,click`) |
| D7 | The repeated-content rule needs 2 duplicates and lists *every* action as involved, not the repeated ones | :154–158 | ran: two identical actions → 0 findings |
| D8 | Chat traces have no `hypothesis`/`decision` events, so every action is "unexplained" | :112 | ran: `["m2"]` |
| D9 | Every `belief_update` without confidence raises a finding. Chat import creates these, so it adds noise | :161–165 | read |
| D10 | Failures are categorised `contradiction` | :170 | read |
| D11 | H/O ratio with zero observations returns the hypothesis count, not "n/a"; coverage with zero claims returns 0% | :36–38, :178 | read |
| D12 | Finding IDs collide when event IDs collide (P7) | :102 etc. | read |

### 1.3 Graph and replay

| ID | Bug | Where | Evidence |
|---|---|---|---|
| G1 | Selecting a node rebuilds every position, so dragged nodes snap back | `ReasoningGraph.tsx:61–95` | read (`graphData` depends on `selectedNodeId`) |
| G2 | `fitView` runs only on first mount. A newly loaded trace can open off-screen | `ReasoningGraph.tsx:172` | read |
| G3 | Y = step × 160. Timestamps as steps place nodes at y = 2.7e14 | `graph.ts:75` | ran |
| G4 | A child placed before its parent gets x = 0 | `graph.ts:92` | ran |
| G5 | Rows with several nodes are re-centred on 0, losing parent alignment; the pass repeats once per node | `graph.ts:112–135` | read |
| G6 | Duplicate links produce duplicate edge IDs | `graph.ts:163` | ran: `["edge-a-b","edge-a-b"]` |
| T1 | A single-step trace computes `0/0`; the slider gradient is `NaN%` | `TimelineControls.tsx:120` | ran |
| T2 | Timestamp steps make `Array.from({length: maxStep})` throw `RangeError: Invalid array length`, which blanks the app | `TimelineControls.tsx:126` | ran |
| T3 | Replay steps by `+1`, so traces with sparse steps (10, 20, 30) need many empty clicks | `store.ts:151–163` | read |
| S1 | Loading a trace keeps the previous search filter, so the new trace can show "0 of N" | `store.ts:89–105` | read |
| S2 | Components subscribe to the whole store, so every playback tick re-renders everything | all `useTraceStore()` calls | read |

### 1.4 Import, export and storage

| ID | Bug | Where | Evidence |
|---|---|---|---|
| I1 | Errors are told apart from warnings by searching for "Failed" or "Could not" in the message | `TraceInput.tsx:20` | read |
| I2 | A load with a warning doesn't call `onLoaded`, so the mobile view stays on Import | `TraceInput.tsx:22–25` | read |
| I3 | Message timers are never cleared, so an older timer hides a newer message | `TraceInput.tsx:25, 28` | read |
| I4 | File drop has no size limit and no `onerror`; binary files load as garbage; there's no keyboard file picker | `TraceInput.tsx:33–45` | read |
| I5 | The saved trace is restored from `localStorage` without validation; a malformed one crashes render | `Layout.tsx:26–35` | read |
| I6 | `localStorage.setItem` isn't guarded; a quota error on a large trace throws inside an effect | `Layout.tsx:37–39, 60` | read |
| I7 | The object URL in the Markdown export is never revoked | `DiagnosisPanel.tsx:53` | read |
| I8 | Export filenames aren't sanitised (`/`, `:`), and a non-string title crashes them (P10) | `DiagnosisPanel.tsx:56`, `Layout.tsx:51` | ran via P10 |
| I9 | Fonts load from Google's CDN, which breaks offline use and the design rule against runtime CDNs | `index.html:13–15` | read |

### 1.5 Claims the UI can't back up (charter rule 5)

| ID | Text | Where |
|---|---|---|
| C1 | "Perfect cognitive coherence. No warnings…" whenever no rule fires | `DiagnosisPanel.tsx:191` |
| C2 | "Evidence-grounded output … successfully linked back to empirical observations" (see D3–D5) | `DiagnosisPanel.tsx:141–146` |
| C3 | Export: "✅ Grounded … valid causal link" and "the cognitive trajectory appears sound" | `DiagnosisPanel.tsx:37–44` |
| C4 | "Evidence coverage" is a heuristic link count but is shown as a percentage of grounding | `TraceAnalysisSummary.tsx:22–23` |
| C5 | Belief-update inspector text says it shows "the model's internal confidence or belief state" | `NodeInspector.tsx` (interpretation for `belief_update`) |

### 1.6 Design and system debt

- Colours are hard-coded: 53 hex values and about 470 Tailwind palette classes (`cyber-*`, `rose-400`, …) instead of `--ui-*` tokens.
- There are three evidence modes, but the charter defines six labels plus `unavailable`.
- There are no tests, no fixtures and no CI on `main`. The commit hook and attribution check exist only on `new`.

## 2. Decisions needed

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D-1 | Backend for BYOK, local models and internals | **TypeScript local server (Node, Hono) + Python sidecar for neural internals** | One language with the web app. Internals tooling (nnsight, TransformerLens, SAELens, Gemma Scope) is in Python, so borrowing beats rebuilding hooks in candle. Alternative: the Rust core from `new`, which costs more and has no web code yet. |
| D-2 | Viewer framework | **Keep React + React Flow** | The working code is React. The design kit is plain CSS with a Tailwind bridge, so it works with either. `new`'s docs say Svelte; update them. |
| D-3 | Where keys live | **Server-side only, in the OS keychain (`@napi-rs/keyring`)** | Charter rule 6. The browser never sees a key and never calls a provider. |
| D-4 | Hosted static build | **Yes, import-only** (open trace files, no keys, no model calls) | A shareable demo that can't leak keys. |
| D-5 | Skin | `lens` (kit default) | The direction doc is already written for it. |

## 3. Plan

Each phase ends at a gate: a test or command that fails if the work isn't done.

### Phase A: Foundation on `main`

1. Bring the rules over from `new` without deleting `src/`:
   `git checkout new -- AGENTS.md CLAUDE.md FAILURE_MODES.md .githooks scripts .github .claude design docs/CHARTER.md docs/STYLE.md docs/BORROWED.md`.
   Rewrite ARCHITECTURE.md and BUILD_PLAN.md for D-1 and D-2. Set `core.hooksPath`.
2. Turn the app into a workspace: `apps/web` (the current app), `apps/server`, `packages/format` (types + JSON schema), `packages/analysis` (parser + diagnostics, no DOM).
3. Add Vitest. Turn every **ran** probe in §1 into a failing test plus fixtures in `fixtures/traces/`.
4. CI: `npm ci`, lint, `tsc`, `vitest`, build, attribution check. Run `npm audit fix` for the vite dev deps.

**Gate:** CI is green, and the probe tests exist and fail on the current code.

### Phase B: Correctness fixes (in this order, each with its test)

1. **Format v1** (`packages/format`): `format_version`, run → step → event; depth (`behaviour | stated | probabilities | internals`); the six charter labels + `unavailable{reason}`; separate `next` (time order) and `supports` (evidence) edges. Reader for v0 prototype JSON. Fixes P5 at the root.
2. **Parser**: P1–P16. Deterministic IDs (`<source>-<index>`), duplicate-ID error, cycle detection, a strict JSON path that reports the JSON error instead of falling through, ReAct prefixes, a role-aware chat import (last assistant turn = answer; earlier turns are `observed` messages), Responses `call_id` → tool-name pairing, confidence clamped to [0, 1].
3. **Diagnostics**: one iterative topological pass with memoised reachability (D1, D2), O(V+E). Grounding only over `supports` edges (D3–D5); no answer means "no answer", not "grounded". Loop rule: same tool **and** same normalised arguments ≥ 2, with no new observation in between, every loop reported with its own events (D6, D7). Planning and confidence rules gated on whether the source can provide them (D8, D9). Each finding carries `rule`, `supportingEventIds` and `limitations`. Compute once per trace, memoised in the store (D2).
4. **Graph and replay**: layout depends only on events (cache by trace ID) and selection only restyles (G1); `fitView` on trace change (G2); rank by order index, not raw step (G3, T2, T3); parents placed first via topological order (G4); dagre or elkjs instead of the hand-rolled pass (G5, rule 7); edge IDs dedupe (G6); guarded timeline (T1); selectors with `useShallow` (S2); reset filters on load (S1).
5. **Import/storage/export**: typed `ParseResult {ok, warnings[], errors[]}` (I1, I2); one timer ref (I3); 20 MB limit, `onerror`, a file `<input>` (I4); schema-validate restores, guard storage (I5, I6); revoke URLs, sanitise filenames (I7, I8).
6. **Wording**: replace C1–C5 with what each rule checked and what it can't check.

**Gate:** all §1 tests pass. A 50,000-event fixture runs diagnostics in under 500 ms and draws the first frame in under 2 s. A trace with no answer never shows "grounded".

### Phase C: Design system (borrowed from `design/` and `../design-kit`)

1. `node ../design-kit/scripts/kit.mjs use . lens`, then re-run with the Tailwind bridge (`tailwind-theme.css`) and set `"tailwind": true` in `design/kit.json`.
2. Import `base.css`, `skins.css`, `components.css` once; replace every `cyber-*` class and hex value with `--ui-*` tokens. Gate it with a lint rule that fails on hex, `rgb(`, and Tailwind palette colours in `apps/web/src`.
3. Bundle the fonts locally (`@fontsource`), and remove Google Fonts (I9).
4. Build the evidence-label component from `design/README.md` (mark, colour, text treatment, badge) and use it for every value. `unavailable` shows its reason in words.
5. Rebuild the layout to the direction: runs sidebar → three aligned columns (behaviour / stated / internals) on one step scrubber → step-detail rail → manifest status bar. Keep the React Flow graph as a second view of the same run.
6. Use the primitives in `design/system/COMPONENTS.md` (button, badge, form controls, lists, surfaces, transcript, feedback). Check the DESIGN.md "Before you add something" list.

**Gate:** the colour lint passes, the app works with the network off, light and dark both pass the kit's contrast checks, and the mobile width (375 px) has no horizontal scroll.

### Phase D: Local server, BYOK and local models (text tier)

1. `apps/server` (Hono on Node) on `127.0.0.1` only, serving the built web app plus `/api`. A random per-launch token, checked on every request, blocks other local pages. Strict CORS.
2. Keys: `POST /api/keys/:provider` stores to the OS keychain; there's no read-back endpoint, and responses and logs are redacted. A test asserts key bytes appear nowhere in run directories or logs.
3. Sources behind one `Source` interface, each declaring capabilities per model:
   - OpenAI-compatible: OpenAI, OpenRouter, Groq, Together; **local**: Ollama, LM Studio, llama.cpp server, vLLM. Logprobs where offered; raw `<think>` text from open reasoning models → `stated`.
   - Anthropic Messages (thinking blocks → `stated`, labelled "summary by provider"), OpenAI Responses (reasoning summaries), Gemini (thought parts).
4. Run directory as in `new`'s ARCHITECTURE §3 (`manifest.json`, `events.jsonl`, `attachments/`). Record errors, refusals, truncation and timeouts as events (charter rule 5).
5. Web UI: a provider/model picker, a prompt runner with streaming, a run list, and a token view with probabilities when present.

**Gate:** recorded fixtures for every source (success, error, refusal, truncation, timeout) parse to the right events and labels; no default test touches the network; the key-leak test passes; a model without logprobs renders "unavailable: provider does not expose token probabilities".

### Phase E: Neural internals (full tier, local only)

1. Python sidecar (`bridge/python`, managed by `uv`) using **nnsight** or **TransformerLens** for activation capture on small open models (Gemma 3 1B, Qwen3 0.6B on MPS). It reads and writes run directories only; the server launches it.
2. A capture plan: named layers, positions and pooling (charter rule 4). Tensors are stored as safetensors.
3. Decoders: logit lens and tuned lens; SAE features via **SAELens** + Gemma Scope; linear probes. Every decoded signal ships with a control (random direction, shuffled inputs, untrained weights) or is shown "unvalidated".
4. Ground truth first: planted-circuit toy models where the decoder must recover the planted variable and the controls must fail.
5. The first finding view: the step where the answer becomes decodable internally vs the step where the stated reasoning commits to it.

**Gate:** the planted-circuit test passes, its controls fail, and the determinism check passes on identical runs and fails with the cache toggled.

### Phase F: Symbolic engines

1. **z3** via `z3-solver` (official WebAssembly build): proofs, models, unsat cores → `exact` events, `symbolic.proof_tree/1`.
2. **Datalog** via a JS engine with provenance (evaluate and add a BORROWED.md row; Soufflé through the sidecar if none records rule firings).
3. Proof-tree view: an indented monospace tree, rule firings as `.tool-row`, unsat cores highlighted.

**Gate:** derivations match hand-checked fixtures, and an oversized derivation is recorded as truncated, not dropped.

### Phase G: Neurosymbolic pipelines

1. Pipeline runner: LLM (any Source) → translation → solver → result, with `nesy.translation/1` as its own event between text and formula.
2. Translation view: the NL span next to the formula, a "translation" badge, and a check that re-reads the formula back to text and flags departures.

**Gate:** a fixture with a planted translation error shows where the formula departs from the text.

### Phase H: MVP review features (from `TODO.md`)

Tool-call inspector (request ↔ result, errors, durations); click a finding to focus its events and path; annotations, failure-point markers, accept/dismiss per finding; export and reopen a portable review (`.rtreview`: source trace + annotations + decisions + `format_version`); OpenTelemetry GenAI import.

**Gate:** a review round-trips export → import byte-for-byte on its stable fields.

## 4. Order and parallel work

A → B → C is sequential (C rewrites the components B fixes). D can start after
A. E, F and G each need D's run directory but not each other. H needs B and C.
