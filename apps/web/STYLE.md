# The viewer's style

ReasonTrace looks like a terminal on a dark ground, after Mr. Robot: black
glass, pale phosphor text, terminal green for the prompt and for what holds,
fsociety red for what fails. It is a lab instrument dressed as a terminal, so
the look never outranks the evidence. Every value still wears its evidence
label, and an honest zero still never looks like a silent zero.

These notes, `src/styles/tokens.css` and `src/styles/base.css` are the whole
design system. Nothing comes from outside the app.

## Tokens

`src/styles/tokens.css` is the only file where a colour is written.
`npm run check:colours` rejects a hex value or colour function anywhere else
in `src`, any `var(--…)` the viewer does not define, and any import from the
old `design/` kit.

| Token | Use |
|---|---|
| `--bg-0` … `--bg-3` | grounds, darkest first: panels and fields, the page, hover, the status line |
| `--bg-alert`, `--bg-select` | a departure or failure; a selection |
| `--ink-1` … `--ink-3` | text, brightest first; `--ink-3` is the faintest text allowed |
| `--ink-green` | the prompt, primary actions, what holds (`exact`, complete) |
| `--ink-red` | failures and departures only |
| `--ink-amber` | `stated` text, truncated and refused runs, warnings |
| `--ink-cyan` | `measured` values and probability bars |
| `--ink-violet` | `decoded` values |
| `--line-1`, `--line-2`, `--line-glow` | rules and borders; never text |
| `--fs-1` … `--fs-6` | type sizes, 11 px to 40 px |
| `--sp-1` … `--sp-6` | spacing, 4 px to 40 px |

`npm run check:contrast` holds every `--ink-*` to WCAG AA (4.5:1) on every
`--bg-*`. A new text colour is an `--ink-*` token, so it is checked too.

The viewer is dark only. One face, JetBrains Mono, bundled through
Fontsource, with ligatures off so `<=` reads as typed. Corners are square;
borders are one pixel; nothing has a shadow except the focus glow.

## Primitives

`src/styles/base.css` has them: `.btn` (default green, `--secondary`,
`--ghost`, `--text`, `--text-strong`; sizes `--sm`, `--xs`, `--icon`),
`.badge` (a bracketed tag; `--muted`, `--ok`, `--warn`, `--destructive`),
`.field`, `.label`, `.search`, `.switch` (a checkbox drawn `[ ]` / `[x]`),
`.seg`, `.row`, `.section-heading` (a box-drawing rule: `── RUNS ───`),
`.hint`, `.empty`, `.eyebrow`, `.wordmark`, `.cursor` and `.glyph`. Use one
before writing a new one, and don't override its colour or padding at the
call site.

Icons are text glyphs from `src/lib/icons.ts`, on the same grid as the text.

## Evidence labels and run endings

Each has its own mark and its own word, so none depends on colour.
`src/components/Marks.test.tsx` checks that.

| Label | Mark | Colour | Text |
|---|---|---|---|
| `observed` | ■ | `--ink-1` | plain |
| `stated` | “ | `--ink-amber` | italic; a provider's summary also says "summary by provider" |
| `exact` | ✓ | `--ink-green` | green |
| `measured` | ● | `--ink-cyan` | tabular numbers |
| `decoded`, validated | ◆ | `--ink-violet` | "validated" badge |
| `decoded`, unvalidated | ◇ | `--ink-violet` | "unvalidated" badge, always |
| `inferred` | ? | `--ink-3` | faint; "analyst's guess" badge |
| unavailable | ∅ | `--ink-3` | the reason, in words |

Run endings read like a boot log: `[ .. ] running`, `[ OK ] complete`,
`[TRNC] truncated`, `[DENY] refused`, `[FAIL] error`, `[TIME] timed out`,
`[STOP] stopped`.

## Layout

Runs and inputs in the sidebar; the trace by step and depth in the main
surface, with the graph and, for pipelines, the handoff as other views; step
detail in the rail; and a status line along the bottom, after vim's: a mode
block naming the tier, then the manifest's fields split by `│`. Under 64 rem
one region shows at a time. At 375 px nothing scrolls sideways except a
table or the step columns inside their own surface.

Probabilities, shares and norms get an ASCII bar (`███▍········`) beside the
number; the number is what a screen reader hears.

## Motion

The cursor blinks, the live indicator blinks, and the wordmark glitches now
and then. Each sits in a `@media (prefers-reduced-motion: no-preference)`
block; `npm run check:motion` rejects any animation or transition outside
one. The scanlines are a still overlay.

## The server's terminal output

The server prints a banner only when stdout is a terminal, one dim metadata
line (version, address, where keys and runs live), then a `┊` row per action
(`┊ capture   …`, `┊ solve     …`) with a nine-cell verb. It uses colour only
on a terminal and never with `NO_COLOR` set.

## Before you add something

- Reused a primitive and the existing tokens; no hex outside `tokens.css`?
- Every value labelled, and an unavailable depth shown with its reason?
- Red only for failures and departures?
- Loading, empty and error states written, with real words?
- Animation only inside the no-preference block?
- Works at 375 px wide, and with the network off?
- Changed a token, a mark or a primitive? These notes changed in the same
  commit.
