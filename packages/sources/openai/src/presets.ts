import type { Tier, UnavailableDepth } from "@reasontrace/format";

export interface Preset {
  id: string;
  name: string;
  baseUrl: string;
  tier: Tier;
  needsKey: boolean;
  /** OpenAI's reasoning models take only `max_completion_tokens`; most other servers know only `max_tokens`. */
  maxTokensField: "max_tokens" | "max_completion_tokens";
  /** What a model at this endpoint can't provide before it runs, beyond internals. */
  declare?: (model: string) => { tier?: Tier; unavailable: UnavailableDepth[] };
}

/** OpenAI's o-series and GPT-5 reasoning models. Their reasoning stays hidden. */
const OPENAI_REASONING = /^(o\d|gpt-5(?!-chat))/;

export const PRESETS: Preset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    tier: "open",
    needsKey: true,
    maxTokensField: "max_completion_tokens",
    declare: (model) => (OPENAI_REASONING.test(model)
      ? { tier: "frontier", unavailable: [{ depth: "stated", reason: "OpenAI does not return its reasoning models' reasoning text through Chat Completions." }] }
      : { unavailable: [] }),
  },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", tier: "open", needsKey: true, maxTokensField: "max_tokens" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", tier: "open", needsKey: true, maxTokensField: "max_tokens" },
  {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    tier: "frontier",
    needsKey: true,
    maxTokensField: "max_tokens",
    declare: () => ({ unavailable: [{ depth: "stated", reason: "Gemini's OpenAI-compatible endpoint returns thought summaries only with Google-specific options, which this source does not send." }] }),
  },
  { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", tier: "local", needsKey: false, maxTokensField: "max_tokens" },
  { id: "lmstudio", name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", tier: "local", needsKey: false, maxTokensField: "max_tokens" },
  { id: "llamacpp", name: "llama.cpp server", baseUrl: "http://127.0.0.1:8080/v1", tier: "local", needsKey: false, maxTokensField: "max_tokens" },
  { id: "vllm", name: "vLLM", baseUrl: "http://127.0.0.1:8000/v1", tier: "local", needsKey: false, maxTokensField: "max_tokens" },
];
