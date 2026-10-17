# reasontrace

An interpretability tool that shows what a model did, what it says it thought, and what
happened inside it, side by side and step by step, with each piece labelled by how far it can be
trusted. It takes Hermes's dashboard palette (teal `#041c1c`, cream `#ffe6cb`, emerald) because
that palette was built for dense data on a dark canvas, and because "lens" is this project's own
word.

| | |
|---|---|
| Default skin | **Lens** (`lens`): cream `#FFE6CB` and teal `#2FBFAE` on deep teal `#041C1C`; deep teal `#0F7068` on mint paper in light |
| Glyph | ∴ |
| Kawaii | **Off.** It would undercut the evidence labels |
| Mode | Follows the OS. Dark is the designed-first mode |
| Surfaces | `reasontrace` CLI (Rust), viewer (Svelte + TypeScript, served by `rt-server`) |
| Uses | `base.css`, `skins.css`, `components.css`, `loader.js`, `rust/theme.rs` |

## Feel

- A lab instrument. Dense, aligned, monospace where values live, and absolutely clear about
  what is a measurement and what is a guess.
- Every value wears its evidence label. The label is never a tooltip-only detail.
- "An honest zero must not look like a silent zero" (charter, rule 5). Unavailable, failed,
  timed out and zero are four different visuals.

## Evidence labels

The charter defines six. They get fixed visual treatments, used identically in every view:

| Label | Colour | Mark | Text treatment |
|---|---|---|---|
| `observed` | `--ui-text-1` | solid square | normal |
| `stated` | `--ui-warm` | dashed underline | italic; frontier summaries also get "summary by provider" |
| `exact` | `--ui-ok` | solid square with tick | normal |
| `measured` | `--ui-info` | solid dot | mono numbers |
| `decoded` (control passed) | `--ui-accent` | solid dot | shows method, version, control result |
| `decoded` (no control) | `--ui-purple` | hollow dot | "unvalidated" badge, always |
| `inferred` | `--ui-text-3` | hollow square | "analyst's guess" badge |
| unavailable | `--ui-text-4` | dash | the reason, in words: "Anthropic API doesn't expose token probabilities" |

## Layout

```
┌ runs ───────┬ step 14 / 52 ──────────────────────────────────────────────────┬ step detail ──────┐
│ ∴ gemma3-1b │       behaviour        │   stated reasoning  │ internals       │ token "Paris"     │
│   #08 14:02 │ ■ call search(…)       │ ┅ "I should check…" │ ● L12 0.83      │ p 0.71  ▕▓▓▓▓▓░▏  │
│   #07 13:40 │ ■ emit "The capital…"  │ ┅ "France → Paris"  │ ○ SAE 4417      │ alt "Lyon" 0.09   │
│ claude-4    │                        │                     │ unvalid.        │ ── controls ──    │
│   #03 tier: │ ─ token probs: — unavailable: provider does not expose them ─  │ shuffled  0.12    │
│   frontier  │ ◀ ▶  step scrubber ▕━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━▏   │ random   0.09     │
└─────────────┴────────────────────────────────────────────────────────────────┴───────────────────┘
 tier full · gemma-3-1b q8 · seed 7 · determinism ✓ · manifest #08
```

- **Sidebar: runs**, grouped by model, each with its tier as a badge. The tier decides which
  columns can exist.
- **Main: three aligned columns** (behaviour, stated reasoning, internals) on one step timeline.
  Rows align by step, so you can read across. Columns a tier can't provide render as one
  full-height "unavailable" panel with the reason, not as empty space.
- **Scrubber** under the columns; ←/→ step, ⇧←/→ jump between events.
- **Rail: step detail.** Token probabilities as horizontal bars with alternatives; decoded
  signals with method, version and their controls beside them.
- **Status bar: the manifest summary.** Tier, model and quantisation, seed, determinism check.

## Key screens

- **Token view.** Generated text where each token's background is `--ui-accent` at an opacity
  from its probability (use a sequential ramp of at most five steps, not continuous). Hover a
  token for alternatives.
- **Symbolic derivation.** z3 / Datalog proofs as an indented tree in mono, with rule firings
  as `.tool-row`s. Unsat cores highlighted with `--ui-warn`.
- **Neurosymbolic translation.** The step where text becomes a formal query gets its own row
  type, since the charter says that's where most such systems fail. Mark the boundary with a
  `--ui-stroke-1` rule and a "translation" badge.
- **Compare runs.** Two runs side by side, aligned by step, with divergence marked by a
  `--ui-warm` stripe in the gutter.

## Terminal

Banner: REASONTRACE in cream/teal. Label ` ∴ ReasonTrace `. Spinner glyphs `∴ ∵`, verbs
capturing, decoding, probing, running controls, aligning steps, deriving. Tool verbs: `capture`,
`decode`, `probe`, `control`, `derive`, `replay`. `rt watch` is a ratatui view: steps scroll in
the left pane with their evidence-label marks, the manifest sits in the status bar.

## Words

Exact and unhedged where the data is exact, explicitly tentative where it isn't. Prefer
"decoded by logit lens v0.3; control: shuffled 0.12" over "the model is thinking about Paris".

## Don't

- Don't render "stated" reasoning in the same style as observed behaviour.
- Don't show a decoded signal without its control, or hide the "unvalidated" badge.
- Don't use a rainbow or diverging palette for probabilities.
