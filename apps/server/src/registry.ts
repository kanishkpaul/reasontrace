import type { Source } from "@reasontrace/core";
import type { KeyStore } from "@reasontrace/keys";
import { anthropicSource } from "@reasontrace/source-anthropic";
import { openaiSources } from "@reasontrace/source-openai";

export interface SourceDeps {
  keys: KeyStore;
  fetch?: typeof fetch;
}

/** Every source the server offers. One line per capability package (docs/ARCHITECTURE.md §5). */
export const registry = (deps: SourceDeps): Source[] => [
  ...openaiSources(deps),
  anthropicSource(deps),
];
