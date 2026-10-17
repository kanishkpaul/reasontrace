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

The viewer opens agent trace files (plain `Thought:` / `Action:` transcripts,
chat-message JSON, OpenAI Responses output, and native event JSON) and draws
them as a replayable graph with rule-based findings. Nothing runs a model yet.
The findings are heuristics over the support links a trace declares, and
each one states its rule and what it cannot tell. [docs/PLAN.md](docs/PLAN.md)
lists the defects found in the prototype; each has a test named by its ID.

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # lint, typecheck, tests, dependency rules, build
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
