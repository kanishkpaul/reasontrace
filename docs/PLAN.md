# ReasonTrace: bug-fix and webapp plan

Scope: the React prototype on `main` (2,900 lines of TypeScript), plus the
direction and design system kept on the local `new` branch. Goal: one local-first
web app that inspects neural, symbolic and neurosymbolic models, through your own
API keys (BYOK) or models on your machine, and labels every value by how far it
can be trusted.

## 0. Starting point (2026-10-17)

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

## 2. Decisions

Decided on 2026-10-17:

| # | Decision | Why |
|---|---|---|
| D-1 | A TypeScript local server (Hono on Node) for sources, keys and engines, plus a Python sidecar for neural internals | One language with the web app. Internals tooling (nnsight, TransformerLens, SAELens, Gemma Scope) is in Python, so borrowing it beats rebuilding activation hooks. |
| D-2 | Keep React and React Flow | The working code is React. The design kit is plain CSS with a Tailwind bridge. |
| D-3 | Keys live server-side only, in the OS keychain | Charter rule 6. The browser never sees a key and never calls a provider. |
| D-4 | A hosted static build opens trace files only | A shareable demo that can't leak keys. |
| D-5 | Skin: `lens` | The direction in `design/README.md` is written for it. |

## 3. Phases

The phases, their order and their gates are in [BUILD_PLAN.md](BUILD_PLAN.md).
Phase 1 fixes every bug in §1; each one has a test in `packages/analysis` or
`apps/web` that names its ID.
