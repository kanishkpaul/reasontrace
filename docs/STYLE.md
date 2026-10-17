# Style

This is how code and comments are written here, by people and by agents alike.
In this repository, "tasteful" means a reader can trust the code quickly: it
says what it does, a comment explains only what the code cannot, and nothing
is there without a reason.

The guide draws on John Ousterhout's *A Philosophy of Software Design* (ch.
13), antirez's taxonomy of comments in the Redis codebase, the Rust API
Guidelines (whose documentation rules carry over to TSDoc), and Google's
style guidance. Sources are at the end. The final
section lists the habits coding agents fall into, because most code here will
be written by one.

## 1. Comments

### What a comment is for

Code already shows *what* happens, and it is always accurate because it is the
behaviour. A comment exists for what the code cannot show:

- **why** this approach, and why not the obvious alternative;
- **invariants and preconditions**, such as "call `open` before `write`", or
  "positions are token indices, not byte offsets";
- **units and sources of numbers**, i.e. the measurement behind a constant;
- **the defect a guard prevents**, i.e. what would go wrong without this line;
- **domain knowledge** a capable reader may lack, such as what a logit lens
  is, in one line plus a link.

If a comment would only restate the code, either delete it or improve the
names until the code says it.

### Kinds of comment we write

**Interface docs** (TSDoc `/** */`, Python docstrings) go on every exported
item. They say what the item does for its caller, not how it does it: a
one-line summary, then `@throws` (or `Raises:`) for every error a caller can
act on, and the invariants a caller must uphold. Link related items with
`{@link}`. Examples handle errors properly, because readers copy them.

**Design comments** go at the top of a module whose approach is not
obvious. They cover the approach, the alternative that was rejected, and why.
A few sentences, not an essay.

**Why comments** sit above code whose purpose is unclear even though its
behaviour is clear.

**Teacher comments** explain a domain concept once, where it is first used.

**Checklist comments** say "changing X requires changing Y". Prefer a test that
fails when they drift, and keep the comment only if no test can.

### Kinds we don't write

- **Narration**: `// increment the counter`, `// loop over the layers`,
  `// return the result`.
- **Restated names**: `/// Returns the layer index.` on `fn layer_index()`.
- **Banners and dividers**: `// ===== Helpers =====`. If a file needs sections,
  it probably needs to be two modules.
- **History**: `// fixed bug in P3`, `// changed to use safetensors`,
  `// new implementation`. That belongs in git.
- **Commented-out code.** Git keeps it. Delete it.
- **Bare TODOs.** `TODO` is allowed only with a linked issue:
  `// TODO(#41): handle sliding-window layers`.
- **Hedges and apologies**: `// hacky but works`, `// not sure why this is
  needed`. Find out, or fix it.
- **Agent voice**: `// This function…`, `// Here we…`, `// Note:`,
  `// Now let's…`, `// Helper to…`.

### Voice

Present tense, declarative and plain. Full sentences in docs; fragments are
fine in short inline comments. Numbers carry units and where they came from.
Match the voice of the module you are editing; read a neighbouring file before
writing a comment in a new one.

A comment that disagrees with its code is a defect. Update both in the same
commit.

### Examples

```ts
// Bad: narrates what the code already says.
// Check if the layer index is valid
if (layer >= model.numLayers) throw new LayerOutOfRange(layer, model.numLayers);

// Good: no comment. The code and error name already say it.
if (layer >= model.numLayers) throw new LayerOutOfRange(layer, model.numLayers);
```

```py
# Bad: a constant with no reason.
DEFAULT_LAYERS = (6, 12, 18)

# Good: the reason, the measurement and its source.
# Three layers keep a 4k-token Gemma 3 1B capture under 30 MB at fp16.
# All 26 would be about 240 MB per run (1,152 values x 2 bytes per layer per
# token), and a session of a few dozen runs would fill several gigabytes.
DEFAULT_LAYERS = (6, 12, 18)
```

```ts
// Good: the defect this guard exists for.
// The server's prompt cache changes generated tokens at temperature 0, so a
// cached run is a different configuration, not a repeat. Record it, never hide it.
manifest.cache = await server.cacheState();
```

```ts
/**
 * Reads the evidence path behind each final answer: the events that reach it
 * over `supports` edges. Time order is never evidence, so `next` edges are
 * ignored.
 *
 * @throws {CyclicSupportError} if `supports` edges form a cycle.
 */
export function evidencePaths(run: Run): Map<EventId, EventId[]>
```

## 2. Code

**Names carry domain meaning.** Use `residual`, `layer`, `step`, `derivation`,
`capability`. Avoid `data`, `info`, `item`, `manager`, `handler`, `helper`,
and modules named `utils` or `common`. A name that needs a comment to explain
it is the wrong name.

**Types do the work.**
- Use newtypes for identifiers and units: `LayerIdx`, `TokenPos`, `RunId`.
- Use enums instead of boolean pairs.
- Make invalid states unrepresentable. An event has exactly one
  `EvidenceLabel`, and a capability is `Available` or `Unavailable { reason }`,
  never a bare `bool`.

**Small modules, small functions.** A module has one reason to change.
Return early and keep nesting shallow. A function longer than a screen is
usually two functions.

**Errors are honest.**
- Packages throw error classes a caller can act on, or return a result type
  where failure is expected (parsing). Only `apps/server` turns errors into
  responses.
- No non-null assertions (`!`) or `as` casts on data from outside. Where an
  invariant guarantees a value, check it once and throw with a message saying
  why it cannot fail.
- Never swallow an error or substitute a default that hides a failure. An
  error is better than a silent zero.

**Validate at the edges, trust inside.** Parse and check provider responses,
files and user input where they enter. Past that point, types carry the
guarantees, so internal code does not re-check them.

**No speculative abstraction.** A new interface needs either two real
implementations or a place among the five extension points in
ARCHITECTURE.md. No wrapper that only forwards calls, and no configuration
option nobody has asked for.

**Delete freely.** Remove superseded code in the same change that replaces it.
Never keep two implementations, and never keep a feature flag guarding a dead
path.

**Dependencies are earned.** Prefer the standard library and packages
already in the tree. Each new dependency gets a row in [BORROWED.md](BORROWED.md).

**Performance is measured.** Don't optimize before measuring. When you do,
record the measurement in the comment beside the change. Capture code avoids
per-token allocation.

**Tests are named for what they guarantee:** "key is never written to the
run directory", "unavailable depth has a reason". A test for an audited bug
starts with its ID: "P1: transcript events keep their evidence label". They test behaviour, not private details.
Default tests use recorded fixtures and never touch the network.

**Formatting is mechanical.** TypeScript is `strict`, never `any`, checked
by ESLint and `tsc`. Python is formatted and linted by ruff and typed with
pyright. Style arguments that a tool can settle are settled by
the tool.

### The viewer (React + TypeScript)

- One component per file, each doing one job.
- Views receive typed attachment data and never fetch on their own.
- Store state is the open run, the selected step and view settings; derived
  values (diagnostics, layout) are computed once and memoised, not stored.
- Components select the store fields they use, never the whole store.
- Colours, spacing and type come from `design/tokens`. Never use hex values
  or Tailwind palette colours inline.

## 3. Commits

- One logical change per commit, with checks passing.
- The subject is imperative and at most 72 characters. The body says **why**;
  the diff already shows what.
- **No AI attribution, ever.** No `Co-Authored-By` naming an AI tool, no
  "Generated with" line and no session links. The hook in `.githooks/` and CI
  reject them.

## 4. Habits coding agents fall into

Check the diff for these before every commit. Each one is common in
agent-written code, and each one makes code harder to trust.

1. **Narrating comments** that restate the next line.
2. **Docstrings that restate the signature** ("Takes a `run` and returns a
   `Result`").
3. **Defensive overkill**: re-validating data the types already guarantee,
   `switch` arms for impossible cases, `try`/`catch` around code that
   cannot throw.
4. **Swallowed errors**: `?? []`, `|| 0`, `.catch(() => null)` or an empty
   `catch` that turns a failure into a plausible value.
5. **Premature abstraction**: an interface with one implementation, a builder for
   an object with three fields, a factory, or a "manager".
6. **Dead weight**: unused parameters, unused imports, code paths for
   hypothetical callers, leftover debug prints.
7. **Duplicate implementations**: writing a new helper instead of finding the
   existing one. Search before writing.
8. **Confident claims about code that was never run.** Run something that
   would fail if the claim were false (FAILURE_MODES.md, F-A).
9. **Changelog comments** describing the edit rather than the code.
10. **Inconsistent voice**: a new file written in a different style from its
    neighbours.

## Sources

- John Ousterhout, *A Philosophy of Software Design*, ch. 13, "Comments Should
  Describe Things that Aren't Obvious from the Code". [Summary notes](https://danlebrero.com/2021/02/24/philosophy-of-software-design-summary/).
- antirez, [Writing system software: code comments](http://antirez.com/news/124):
  function, design, why, teacher, checklist and guide comments, versus
  trivial, debt and backup comments.
- [Rust API Guidelines: Documentation](https://rust-lang.github.io/api-guidelines/documentation.html):
  C-FAILURE (Errors, Panics, Safety), C-EXAMPLE, C-QUESTION-MARK, C-LINK.
- Google's Go style guide, which says comments explain why, not what. [Notes](https://notes.billmill.org/programming/golang/google_style_guide.html).
- Angular's [coding standards](https://github.com/angular/components/blob/main/CODING_STANDARDS.md)
  on comments that explain decisions.
- Practitioner catalogues of agent-written code habits, e.g.
  [deslop](https://github.com/dabit3/deslop).
