# Borrowed

Everything external that ReasonTrace uses or plans to use: code, weights, data
and ideas. A row is added in the same commit that adds the dependency.

A licence is read from the source's own `LICENSE` file when the piece is
adopted, and is never inferred from the fact that something is public. Until a
row says **adopted**, its licence column is unverified.

| Name | Need | Source | Licence | Removal condition | Status |
|---|---|---|---|---|---|
| React, React DOM | viewer framework | github.com/facebook/react | MIT | — | adopted |
| xyflow (React Flow) | step graph in the viewer | github.com/xyflow/xyflow | MIT | a simpler graph renderer | adopted |
| Zustand | viewer state | github.com/pmndrs/zustand | MIT | React state alone covers it | adopted |
| Tabler Icons | interface icons, the design kit's chosen set | github.com/tabler/tabler-icons | MIT | — | adopted |
| Tailwind CSS | utility classes over the design tokens, through the kit's bridge | github.com/tailwindlabs/tailwindcss | MIT | components written against tokens directly | adopted |
| JetBrains Mono | mono face for traces, IDs and numbers, bundled through Fontsource | github.com/JetBrains/JetBrainsMono | OFL-1.1 | — | adopted |
| Newsreader | display face for empty states, bundled through Fontsource | github.com/productiontype/Newsreader | OFL-1.1 | — | adopted |
| Archivo | wordmark face, bundled through Fontsource | github.com/Omnibus-Type/Archivo | OFL-1.1 | — | adopted |
| Vite | dev server and build | github.com/vitejs/vite | MIT | — | adopted |
| TypeScript | language and typecheck | github.com/microsoft/TypeScript | Apache-2.0 | — | adopted |
| ESLint, typescript-eslint | lint | github.com/eslint/eslint | MIT | — | adopted |
| Vitest | test runner | github.com/vitest-dev/vitest | MIT | — | adopted |
| jsdom | DOM for component tests | github.com/jsdom/jsdom | MIT | browser-mode tests | adopted |
| React Testing Library | rendering components in tests | github.com/testing-library/react-testing-library | MIT | — | adopted |
| Hono | local HTTP server and its event streams | github.com/honojs/hono | MIT | — | adopted |
| @hono/node-server | runs Hono on Node's HTTP server | github.com/honojs/node-server | MIT | — | adopted |
| @napi-rs/keyring | OS keychain access | github.com/Brooooooklyn/keyring-node | MIT | a platform keychain binding with fewer dependencies | adopted |
| Qwen3 0.6B (GGUF, Q8_0) | the model behind the recorded llama.cpp fixtures | huggingface.co/Qwen/Qwen3-0.6B-GGUF | Apache-2.0 | — | adopted (fixtures only) |
| nnsight | activation capture in the sidecar | github.com/ndif-team/nnsight | MIT | TransformerLens covers every model family we need | adopted |
| safetensors | tensor storage in run directories | github.com/huggingface/safetensors | Apache-2.0 | a format with better streaming writes | adopted |
| PyTorch | the sidecar's tensor runtime, on MPS, CUDA or CPU | github.com/pytorch/pytorch | BSD-3-Clause, with third-party notices | — | adopted |
| transformers | loading models and generating in the sidecar; the independent reference for captures | github.com/huggingface/transformers | Apache-2.0 | — | adopted |
| huggingface_hub | downloading and locating cached weights | github.com/huggingface/huggingface_hub | Apache-2.0 | — | adopted |
| uv | the sidecar's Python environment and lockfile | github.com/astral-sh/uv | MIT or Apache-2.0 | — | adopted (tool) |
| pytest | the sidecar's tests | github.com/pytest-dev/pytest | MIT | — | adopted |
| Qwen3 0.6B | full-tier model; source of the stored capture reference | huggingface.co/Qwen/Qwen3-0.6B | Apache-2.0 | — | adopted |
| Gemma 3 1B instruct | full-tier model | huggingface.co/google/gemma-3-1b-it | to verify: the repository is gated, so its terms weren't read here | Qwen3 alone covers the full tier | supported, not downloaded |
| Logit lens | reading a layer's hidden state through the final norm and unembedding | nostalgebraist, "interpreting GPT: the logit lens", LessWrong, 2020 | idea only; no code taken | — | adopted |
| SAELens | loading and encoding SAEs | github.com/jbloomAus/SAELens | to verify | — | planned (phase 6) |
| Gemma Scope 2 | SAE and transcoder weights for Gemma 3 | huggingface.co/google/gemma-scope-2-* | to verify; weights may carry terms separate from code | decoder support dropped for Gemma | planned (phase 6) |
| z3-solver | SMT solver, official WebAssembly build | github.com/Z3Prover/z3 | to verify | — | planned (phase 8) |
| Daedalus practices | run directories, failure modes, honest zeros, borrowing ledger | the author's Daedalus repository | own work | — | adopted |
