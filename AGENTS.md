# Working in this repository

These rules bind every person and every coding agent: Claude Code, Codex,
Cursor or anything else. Where another document disagrees with this file, this
file wins; fix the other document in the same change.

ReasonTrace is a local interpretability tool. It captures what a model does,
what it says it thought, and what happened inside it, and shows how far each
can be trusted. It is a local web app: a TypeScript server, a React viewer and
an optional Python sidecar for model internals. Read these before starting
work:

1. [docs/CHARTER.md](docs/CHARTER.md): what the tool is and what it must never
   claim.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): packages, dependency rules,
   extension points, and how to add or remove a capability.
3. [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md): phases and their gates. Work on
   the earliest phase whose gate has not passed, unless told otherwise.
   [docs/PLAN.md](docs/PLAN.md) lists the known bugs by ID.
4. [docs/STYLE.md](docs/STYLE.md): how to write code and comments here.
5. [FAILURE_MODES.md](FAILURE_MODES.md): how work here goes wrong. Read it
   before writing any claim about code or about a model.

## Rules

**1. No AI attribution, ever.** Commits and pull requests must not credit an AI
tool. That means no `Co-Authored-By` trailer naming one, no "Generated with"
line, and no session link. This applies to every agent and every commit.
`.githooks/commit-msg` rejects such messages locally, and CI rejects them on
push.

**2. Write to [docs/STYLE.md](docs/STYLE.md).** Before every commit, check
your diff against its "Habits coding agents fall into" list. Comments say what
the code cannot. Narration, history, banners, commented-out code and bare
TODOs are not allowed.

**3. Keep the dependency rules.** Capability packages depend only on `core`,
`format` and, for sources, `keys`, and never on each other. Only
`apps/server` wires capabilities in, and `apps/web` reaches them only through
the HTTP API. `npm run check:deps` enforces this.

**4. Never let a key touch disk.** Keys live in the OS keychain and move as
`Secret`. Nothing writes a key to a manifest, run directory, fixture, log or
test output. When recording fixtures, scrub credentials before committing.

**5. Label evidence honestly.**
- Every value carries its charter label.
- A depth a source cannot provide is `unavailable`, with a reason.
- Decoded signals carry their control result.
- Never present `stated` or `decoded` evidence as more than it is: in code, in
  the viewer, or in prose.

**6. Run it before you claim it.** Don't assert that code behaves some way
until you have run something that would fail if it didn't. Report failures
with their output. A skipped step is reported as skipped.

**7. Borrow, don't rebuild.** Check whether a cited tool already ships what you
need. Add a row to [docs/BORROWED.md](docs/BORROWED.md) in the same commit as
any new dependency, with its licence read from the source's `LICENSE` file.

## Setup

```bash
git config core.hooksPath .githooks
```

Run this before every commit. It runs lint, typecheck, tests, the
dependency-rule check and the build:

```bash
npm run check
```

Once phase 4 lands, the sidecar adds `uv run --directory bridge/python pytest`.

## Changing things

- **Adding or removing a capability** follows the checklist in
  [ARCHITECTURE.md §5](docs/ARCHITECTURE.md#5-adding-or-removing-a-capability):
  one package, one dependency line, one registration line.
- **Changing the trace format** bumps `format_version` for breaking changes and
  keeps a reader for the previous version.
- **Commits** are one logical change, with checks passing, an imperative
  subject of at most 72 characters, and a body that says why.
- **Status** comes from tests and run directories. Do not maintain status by
  hand in documents. The build plan lists gates, not progress notes.

## Design

Any change to a user-facing surface (GUI, CLI output, overlay, docs page) follows `design/`.
It is installed from the shared design kit, a separate master repository that lives next to
this one at `../design-kit`, and recorded in `design/kit.json`.

- Read `design/README.md` first: this project's direction. Skin: `lens`.
- Shared rules are in `design/system/DESIGN.md`. Check its "Before you add something" list
  before finishing a UI change.
- Colours, type, spacing, radii, shadows and motion come only from `design/tokens/*.css`
  (`--ui-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--dur-*`).
  No hex values, no `--seed-*`, no ad-hoc rgba, no new shadows in components.
- Use the primitives in `design/system/COMPONENTS.md`. Pick a variant and size; never
  override a primitive's padding, radius or colour at the call site.
- Terminal output from the server follows `design/system/TUI.md`:
  banner only in interactive sessions, `┊` tool rows, `NO_COLOR` respected, `--json` output
  free of colour and decoration.
- Never load fonts, icons or scripts from a CDN at runtime. Everything ships with the app.
- `design/README.md` belongs to this project; edit it freely. Everything else in `design/`
  comes from the master. A change that every project should get (a token, a primitive, a
  rule, a skin) belongs in the master at `../design-kit`, then reaches this repository through
  an update.
- From this repository's root: choose or change the skin with
  `node ../design-kit/scripts/kit.mjs use . <skin>`; pull master changes with
  `node ../design-kit/scripts/kit.mjs update .`, then merge any `*.kit-new` file it leaves and run
  update again. To stop the kit touching a file, add its path to `"ignore"` in
  `design/kit.json`.
- If `../design-kit` is not on this machine, treat `design/` as the source of truth and don't
  regenerate it by hand.
