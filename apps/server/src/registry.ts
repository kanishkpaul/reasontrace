import { join } from "node:path";
import type { Source } from "@reasontrace/core";
import type { KeyStore } from "@reasontrace/keys";
import { anthropicSource } from "@reasontrace/source-anthropic";
import { weightsSource } from "@reasontrace/sidecar";
import { openaiSources } from "@reasontrace/source-openai";

const BRIDGE = join(import.meta.dirname, "../../../bridge/python");

export interface SourceDeps {
  keys: KeyStore;
  fetch?: typeof fetch;
}

/** Every source the server offers. One line per capability package (docs/ARCHITECTURE.md §5). */
export const registry = (deps: SourceDeps): Source[] => [
  ...openaiSources(deps),
  anthropicSource(deps),
  weightsSource({ command: "uv", args: ["run", "--frozen", "--extra", "model", "python", "-m", "reasontrace_sidecar"], cwd: BRIDGE }),
];
