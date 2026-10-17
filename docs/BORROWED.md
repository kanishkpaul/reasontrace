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
| Hono | local HTTP server | github.com/honojs/hono | to verify | — | planned (phase 3) |
| @napi-rs/keyring | OS keychain access | github.com/Brooooooklyn/keyring-node | MIT | a platform keychain binding with fewer dependencies | adopted |
| Qwen3 0.6B (GGUF, Q8_0) | the model behind the recorded llama.cpp fixtures | huggingface.co/Qwen/Qwen3-0.6B-GGUF | Apache-2.0 | — | adopted (fixtures only) |
| nnsight | activation capture and interventions in the sidecar | github.com/ndif-team/nnsight | to verify | TransformerLens covers every model family we need | planned (phase 4) |
| safetensors | tensor storage in run directories | github.com/huggingface/safetensors | to verify | a format with better streaming writes | planned (phase 4) |
| SAELens | loading and encoding SAEs | github.com/jbloomAus/SAELens | to verify | — | planned (phase 6) |
| Gemma Scope 2 | SAE and transcoder weights for Gemma 3 | huggingface.co/google/gemma-scope-2-* | to verify; weights may carry terms separate from code | decoder support dropped for Gemma | planned (phase 6) |
| z3-solver | SMT solver, official WebAssembly build | github.com/Z3Prover/z3 | to verify | — | planned (phase 8) |
| Daedalus practices | run directories, failure modes, honest zeros, borrowing ledger | the author's Daedalus repository | own work | — | adopted |
