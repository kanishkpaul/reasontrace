import type { AnswerGrounding } from "@reasontrace/format";

/**
 * What each grounding state can honestly claim. The check follows the support
 * links a trace declares; it can't tell whether an observation justifies the
 * answer, so no state says the answer is correct.
 */
export const GROUNDING_TEXT: Record<AnswerGrounding, { title: string; detail: string }> = {
  grounded: {
    title: "Answer linked to observations",
    detail: "Every final answer has a support path back to at least one observation. This checks the declared links, not whether the observations justify the answer.",
  },
  ungrounded: {
    title: "Answer not linked to observations",
    detail: "At least one final answer has no support path back to an observation.",
  },
  no_answer: {
    title: "No final answer",
    detail: "The trace has no final answer to check.",
  },
  not_recorded: {
    title: "Support links not recorded",
    detail: "This trace doesn't say which events support which, so whether the answer rests on observations can't be checked from it.",
  },
};
