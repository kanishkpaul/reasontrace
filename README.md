# ReasonTrace (archived browser prototype)

This branch preserves the first version of ReasonTrace: a browser-only viewer
for agent traces. It is no longer developed. The current project is on
[`main`](https://github.com/kanishkpaul/reasontrace/tree/main), where ReasonTrace is being rebuilt as a runtime
interpretability tool for neural, symbolic and neurosymbolic models.

![The prototype reviewing a web-agent trace](docs/screenshot.png)

## What it did

You paste an agent log and get a graph you can replay step by step, plus
rule-based findings. It accepts four input formats:

- plain transcripts with `Thought:` / `Action:` / `Observation:` /
  `Final:` lines;
- chat-message JSON, including `tool_calls`;
- OpenAI Responses-style `output` arrays;
- native event JSON with explicit IDs and parent links.

Every event has one of seven types and an evidence mode (`explicit`,
`observed` or `inferred`). The evidence mode keeps observed behaviour from
being presented as the model's hidden reasoning.

Stack: React 19, TypeScript, Vite, Tailwind 4, React Flow, Zustand. There is
no backend.

```bash
npm install
npm run dev        # http://localhost:5173
```

Needs Node 20.19+ or 22.12+.

## Why it was retired

A browser can only read logs. It cannot run a model or see inside one, which
is what the rebuild on `main` is for.

The prototype also has known defects. They are recorded here so nobody mistakes
its findings for reliable ones:

- **The transcript parser drops the evidence mode.** `finalizeEvent` in
  `src/lib/parseTrace.ts` returns events without it.
- **Grounding checks can't fail on transcripts or chat logs.** Those parsers
  link each event to the one before it, so an unrelated earlier observation
  counts as evidence. All six bundled samples score 100% evidence coverage.
- **The loop detector misses the bundled web-agent loop.** It needs three
  consecutive calls to the same tool; the sample has two.
- **Diagnostics recurse once per event and overflow the call stack** somewhere
  between 4,000 and 8,000 events.
- **Chat import labels every assistant message without tool calls as a
  final answer.**
- **Clicking a node rebuilds the layout,** so manually dragged nodes snap
  back.
- **The timeline divides by zero** when a trace has a single step.

## License

MIT
