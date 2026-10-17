# Charter

ReasonTrace is an interpretability tool. It runs a model or connects to one,
and captures three things: what the model does, what it says about its own
reasoning, and what happens inside it. It shows them side by side, step by
step, and labels how far each one can be trusted. It works with neural
models, LLMs first, with symbolic engines, and with neurosymbolic systems that
join the two, through your own API keys or with models running on your
machine.

This page says what the tool is and what it will not claim. How it is built is
in [ARCHITECTURE.md](ARCHITECTURE.md), and the order of work is in
[BUILD_PLAN.md](BUILD_PLAN.md). What works today is whatever the tests and run
directories show; this page does not track status.

## 1. Three depths, four tiers

Each model is captured at up to three depths: **behaviour** (what it emitted
and called), **stated reasoning** (its own account of what it thought) and
**internals** (what it computed). Between the last two sit **token
probabilities**, which show where a model hesitated and what it nearly said
instead.

What a model exposes depends on how it is reached, not on what we would like
to see:

| Tier | How it is reached | Behaviour | Stated reasoning | Token probabilities | Internals |
|---|---|---|---|---|---|
| **Full** | ReasonTrace runs the weights itself | yes | raw | yes | activations, lenses, features, probes, interventions |
| **Local server** | Ollama, LM Studio, llama.cpp server, vLLM | yes | raw, from open reasoning models | where the server supports it | no |
| **Open API (BYOK)** | OpenRouter, Groq, Together, OpenAI chat models | yes | partial | where the provider supports it | no |
| **Frontier API (BYOK)** | Anthropic, OpenAI reasoning models, Gemini | yes | provider summaries only | mostly no | no |
| **Symbolic engine** | z3, Datalog, run locally | queries and results | none; engines do not narrate | not applicable | the exact derivation: proofs, rule firings, unsat cores |

A neurosymbolic system is captured as both: the neural side at whatever tier it
is reached through, the symbolic side exactly, and the translation between
them as an event of its own. Most such systems fail at that translation.

Each source declares its capabilities, and the viewer draws from those
declarations. A depth the source cannot provide is shown as **unavailable, with
the reason**. It never renders as an empty or clean result.

## 2. Evidence labels

Every value carries one of these labels:

| Label | Meaning | How far to trust it |
|---|---|---|
| `observed` | the system emitted or did this | it happened |
| `stated` | the model's own account of its reasoning | not an explanation; models often leave out what drove the answer, and frontier APIs return summaries written by another model |
| `exact` | a derivation from an instrumented symbolic engine | complete, if the instrumentation is tested |
| `measured` | raw internal values, such as activations | faithful numbers, with no interpretation |
| `decoded` | an interpretation of internals by a method: lens, feature, probe | a hypothesis; it records its method, version and control result |
| `inferred` | an analyst's reconstruction | a guess, labelled as one |

## 3. Rules

These rules carry over lessons from the Daedalus project.

1. **Every decoded signal ships with its control:** a random direction,
   shuffled inputs, or untrained weights. A decoder without a control is
   displayed as unvalidated. Being able to decode something from a hidden
   state does not mean the model uses it.
2. **Methods are validated on known ground truth first.** That means models
   with planted circuits, and symbolic engines whose derivations are exact. A
   method that cannot recover a planted circuit is not shown on a real model.
3. **Every capture is reproducible.** Every run writes a manifest covering
   model and revision, quantization, dtype, device, cache and batching
   settings, seeds and library versions. A determinism check compares runs
   within a stated tolerance and must be able to fail. In Daedalus, a prompt
   cache changed generated outputs.
4. **Capture is selective.** A full residual stream (the hidden state at every
   layer) is about 60 KB per token for Gemma 3 1B, so a capture plan names the
   layers, positions and pooling it keeps.
5. **An honest zero must not look like a silent zero.** Timeouts, crashes,
   truncation, refusals and unavailable depths are recorded as what they are.
6. **Keys stay in the OS keychain.** They are never written to a manifest, run
   directory, export or log. Calls go from the local server straight to the
   provider, with no proxy and no browser-side requests.
7. **Borrow, don't rebuild.** Model internals come from nnsight and
   TransformerLens, feature dictionaries from Gemma Scope through SAELens, and
   solvers from z3, all run through the optional Python sidecar or official
   WebAssembly builds. Each borrowed piece is logged in
   [BORROWED.md](BORROWED.md).

## 4. Non-goals

- It does not say what a model "really thought". It lines up evidence and says
  how much each piece can bear.
- It does not reveal the hidden reasoning of closed models. A local model run
  over a closed model's output inspects the reader, not the model. If that is
  ever offered, it is labelled `inferred`.
- It is not a hosted agent-observability product. It imports OpenTelemetry
  GenAI traces rather than competing with tools built for that.
- It does not train or fine-tune models.
