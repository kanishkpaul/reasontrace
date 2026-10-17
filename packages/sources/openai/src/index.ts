import type { Source } from "@reasontrace/core";
import { PRESETS } from "./presets.ts";
import { openaiCompatible, type Deps } from "./source.ts";

export type { Preset } from "./presets.ts";
export { PRESETS } from "./presets.ts";
export type { Deps } from "./source.ts";
export { openaiCompatible } from "./source.ts";

/** One source per preset endpoint. */
export const openaiSources = (deps: Deps): Source[] => PRESETS.map((preset) => openaiCompatible(preset, deps));
