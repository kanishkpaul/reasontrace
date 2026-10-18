import type { AnswerCommitmentFinding } from "@reasontrace/format";
import answerCommitmentQwen3 from "../../../../fixtures/findings/answer-commitment-qwen3-0.6b.json?url";

/** Findings stored under fixtures/findings, fetched only when opened. */
export const storedFindings = [
  {
    key: "answer-commitment-qwen3-0.6b",
    title: "When does Qwen3 0.6B commit to its answer?",
    description: "20 arithmetic problems; the logit lens at each reasoning step, against the step that states the answer, with three controls.",
    url: answerCommitmentQwen3,
  },
];

export async function loadFinding(url: string): Promise<AnswerCommitmentFinding> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the finding: HTTP ${response.status}.`);
  return response.json();
}
