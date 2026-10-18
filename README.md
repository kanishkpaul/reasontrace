# ReasonTrace

An interpretability tool for seeing how models reason. It captures what a model
does, what it says it was thinking, and what happens inside it, and shows them
side by side, step by step, with each piece labelled by how far it can be
trusted. It works with neural models (LLMs first), symbolic engines and
neurosymbolic systems that join the two, using your own API keys or models
running on your machine.

It is a local web app: a TypeScript server on your machine holds your keys and
talks to models and solvers, a React viewer runs in your browser, and an
optional Python sidecar reads model internals.

![The viewer reviewing a web-agent trace](docs/screenshot.png)

## Where it is

The local server runs a prompt against a model on a local server (Ollama, LM
Studio, llama.cpp, vLLM) or a provider you hold a key for (OpenAI, OpenRouter,
Groq, Gemini, Anthropic). Each run is written to `runs/<id>/` with its
manifest, and the viewer shows its behaviour, its stated reasoning and, where
the source returns them, its token probabilities. Keys go to the OS keychain.

With the Python sidecar, it also runs Qwen3 0.6B or Gemma 3 1B from their
weights and stores each run's residual stream, to a capture plan, as
safetensors next to the run. Nothing interprets those activations yet.

The viewer also opens agent trace files (plain `Thought:` / `Action:`
transcripts, chat-message JSON, OpenAI Responses output, and native event
JSON) as a replayable graph with rule-based findings. The findings are
heuristics over the support links a trace declares, and each one states its
rule and what it cannot tell.

```bash
npm install
npm start          # builds the viewer and serves it at http://127.0.0.1:4317
npm run dev        # the API server and Vite, at http://localhost:5173
npm run check      # lint, typecheck, tests, dependency rules, build
npm run test:live  # sources against a running llama.cpp server or a stored key
```

`npm run test:live` picks a source with `RT_LIVE_SOURCE` (default `llamacpp`)
and a model with `RT_LIVE_MODEL`, and runs the sidecar's determinism check on
Qwen3 0.6B. The default tests never touch the network.

The sidecar needs [uv](https://docs.astral.sh/uv/). Install its model runtime
once; the weights download on first run (Gemma 3 needs its licence accepted on
Hugging Face first):

```bash
uv sync --directory bridge/python --extra model
```

Needs Node 22.22.2+ or 24.15+ (the test tools, jsdom and ESLint, set the floor).

## Models

| Kind | Models | How they are reached |
|---|---|---|
| LLMs, hosted | GPT (OpenAI), Claude (Anthropic), Gemini, and open models on OpenRouter or Groq | your own API key |
| LLMs, local server | any model served by Ollama, LM Studio, llama.cpp server or vLLM (Llama, Qwen, Gemma, Mistral, DeepSeek, …) | the server's local URL |
| LLMs, weights | Gemma 3 1B and Qwen3 0.6B, from Hugging Face | the Python sidecar |
| Symbolic | z3 | in-process |
| Neurosymbolic | an LLM that writes a formula or program, and the solver that runs it | an LLM above plus z3 |

## What it will show

| How the model is reached | What you can see |
|---|---|
| Weights run in the Python sidecar (Gemma 3, Qwen3) | behaviour, raw reasoning, token probabilities, activations, logit lens, SAE features |
| A local server (Ollama, LM Studio, llama.cpp, vLLM) | behaviour, raw reasoning from open models, token probabilities where supported |
| Your own API key (OpenAI, Anthropic, Gemini, OpenRouter, Groq) | behaviour, provider reasoning summaries, token probabilities where supported |
| A symbolic engine (z3) | queries, results, and the exact derivation |

What a source cannot provide is shown as unavailable, with the reason. Signals
decoded from a model's internals carry the result of their control.

## Documents

- [Charter](docs/CHARTER.md): what the tool is and what it will not claim.
- [Architecture](docs/ARCHITECTURE.md): packages, the trace format, extension
  points, and how to add or remove a capability.
- [Build plan](docs/BUILD_PLAN.md): phases and their gates.
- [Plan](docs/PLAN.md): the bug audit and the stack decisions.
- [Style](docs/STYLE.md): how code and comments are written.
- [Failure modes](FAILURE_MODES.md): how work here goes wrong, and the checks.
- [Borrowed](docs/BORROWED.md): external code, weights and ideas.
- [AGENTS.md](AGENTS.md): rules for anyone, human or agent, writing code here.

## License

MIT
