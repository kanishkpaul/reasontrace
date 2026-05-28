# ReasonTrace

ReasonTrace is a visual debugger for reasoning traces. It turns raw agent logs, chain-of-thought-style transcripts, or structured event JSON into an inspectable graph with timeline controls and heuristic diagnostics.

I built it because most reasoning traces are easy to generate and annoying to study. Once a trace grows beyond a few lines, you want structure: where the agent formed a hypothesis, where it acted, where it got evidence, where it looped, and where the final answer lost grounding.

## What it does today

- Accepts either structured JSON traces or lightly formatted transcripts
- Normalizes events into a common reasoning-trace schema
- Renders the trace as an interactive graph
- Lets you scrub through the trace step by step
- Filters by event type and search query
- Shows per-node inspection details
- Computes heuristic diagnostics such as unsupported hypotheses, weak grounding, and repeated-action loops
- Exports the current trace as JSON
- Exports a diagnostics report as Markdown
- Ships with sample traces for ARC-style reasoning, coding, planning, and web-agent failures

## Why this project matters

There is a growing gap between "an agent ran" and "we understand why it failed."

ReasonTrace is my attempt to close that gap with a lightweight tool for:

- debugging agent trajectories
- inspecting reasoning failures
- studying whether final answers are evidence-grounded
- making evaluation runs more legible for humans

## Trace model

ReasonTrace centers around a small event vocabulary:

- `hypothesis`
- `action`
- `observation`
- `belief_update`
- `decision`
- `failure`
- `final_answer`

That gives the UI enough structure to show causal flow without locking the project into one agent framework.

## Local setup

```bash
npm install
npm run dev
```

To build for production:

```bash
npm run build
```

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Flow
- Zustand

## Example input

ReasonTrace accepts plain transcripts like:

```text
Hypothesis: The parser bug is an off-by-one error.
Action: Inspect parser loop boundary.
Observation: The loop uses <= tokens.length.
Belief_Update: The hypothesis is strongly supported. [confidence: 0.91]
Final: Change <= to < in parser.ts.
```

It also accepts JSON traces with explicit event IDs and links.

## Diagnostics it currently checks

- unsupported hypotheses
- actions without planning ancestors
- weak evidence grounding for final answers
- repeated action loops
- missing confidence values on belief updates
- explicit failure events in the trajectory

These checks are heuristic on purpose. The point is to make trace review faster, not to pretend the diagnosis layer is perfect.

## Current limitations

- Diagnostics are rule-based, not learned
- The trace schema is intentionally lightweight and may need adapters for other agent runtimes
- This is focused on single-trace inspection, not large-scale run comparison yet

## What I am adding next

- Side-by-side comparison between two traces
- Better import adapters for agent-framework logs
- More graph layout controls
- Richer trace scoring and summary views
- Sharper failure clustering across repeated runs

## Why it belongs in this repo collection

ReasonTrace is the most research-tooling-heavy repo here. It is about observability for reasoning systems: not just building agents, but building ways to inspect whether their reasoning is coherent, grounded, and useful.
