import type { Run, TranslationAttachment } from "@reasontrace/format";

/** The run's translation, if it has one: what makes it a pipeline run the handoff view can show. */
export const translationOf = (run: Pick<Run, "attachments"> | null): TranslationAttachment["data"] | null =>
  run?.attachments.find((a): a is TranslationAttachment => a.kind === "nesy.translation/1")?.data ?? null;
