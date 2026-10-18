import { createElement } from "react";

// The viewer's one icon module. Icons are text glyphs in the page's monospace
// face, so they sit on the same grid as everything else and need no icon set.
const glyph = (text: string) => ({ className }: { className?: string }) =>
  createElement("span", { className: className ? `glyph ${className}` : "glyph", "aria-hidden": true }, text);

export const ReasoningIcon = glyph("~");
export const HypothesisIcon = glyph("?");
export const ActionIcon = glyph("$");
export const ObservationIcon = glyph("<");
export const UpdateIcon = glyph("↻");
export const AlertIcon = glyph("!");
export const DecisionIcon = glyph("⑂");
export const AnswerIcon = glyph("=");
export const ActivationIcon = glyph("▦");
export const DerivationIcon = glyph("⊢");
export const TranslationIcon = glyph("⇄");

export const CheckIcon = glyph("✓");
export const CopyIcon = glyph("⧉");
export const DownloadIcon = glyph("↓");
export const SearchIcon = glyph("/");
export const SidebarIcon = glyph("◧");
export const RailIcon = glyph("◨");
export const FitIcon = glyph("⤢");
export const ZoomInIcon = glyph("+");
export const ZoomOutIcon = glyph("−");
export const PlayIcon = glyph("▶");
export const PauseIcon = glyph("❚❚");
export const StepBackIcon = glyph("◀");
export const StepForwardIcon = glyph("▶");
export const FirstStepIcon = glyph("⏮");
export const LastStepIcon = glyph("⏭");
