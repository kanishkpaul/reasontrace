import type { AnswerGrounding, EventType, ReasonTrace, TraceEvent, TraceDiagnostics, TraceFinding } from "@reasontrace/format";
import { supportGraph, typeMask } from "./supportGraph";

/**
 * Computes heuristic diagnostics for a reasoning trace.
 */
export function computeDiagnostics(trace: ReasonTrace): TraceDiagnostics {
  const events = trace.events;
  const warnings: string[] = [];
  const findings: TraceFinding[] = [];
  const addFinding = (finding: TraceFinding) => {
    findings.push(finding);
    warnings.push(`${finding.title}: ${finding.detail}`);
  };

  // 1. Count event types
  let hypothesisCount = 0;
  let actionCount = 0;
  let observationCount = 0;
  let failureCount = 0;
  let beliefUpdateCount = 0;
  let decisionCount = 0;
  let finalAnswerCount = 0;

  events.forEach(e => {
    switch (e.type) {
      case "hypothesis": hypothesisCount++; break;
      case "action": actionCount++; break;
      case "observation": observationCount++; break;
      case "failure": failureCount++; break;
      case "belief_update": beliefUpdateCount++; break;
      case "decision": decisionCount++; break;
      case "final_answer": finalAnswerCount++; break;
    }
  });

  const hypothesisToObservationRatio = observationCount === 0
    ? hypothesisCount
    : parseFloat((hypothesisCount / observationCount).toFixed(2));

  const { upstream, downstream } = supportGraph(events);
  const childrenCount = new Map<string, number>();
  events.forEach(e => e.supports.forEach(id => childrenCount.set(id, (childrenCount.get(id) ?? 0) + 1)));
  const canReachType = (id: string, types: EventType[]) => ((downstream.get(id) ?? 0) & typeMask(types)) !== 0;
  const hasAncestorType = (id: string, types: EventType[]) => ((upstream.get(id) ?? 0) & typeMask(types)) !== 0;

  // Without declared support links, the checks below would flag every claim
  // and action; say once that they can't be run instead (D8).
  const recordsSupport = events.some(e => e.supports.length > 0);
  if (!recordsSupport) {
    addFinding({ id: "support-not-recorded", severity: "info", category: "visibility", title: "Support links not recorded", detail: "This trace doesn't say which events support which, so grounding, unsupported claims and unexplained actions can't be checked.", eventIds: [], recommendation: "Use a trace format that records which observations each claim relies on." });
  }

  // 2. Detect unsupported hypotheses (hypotheses with no downstream effect / no links going to observations/belief_updates/final_answers)
  const unsupportedHypotheses: string[] = [];
  if (recordsSupport) events.forEach(e => {
    if (e.type === "hypothesis") {
      // An unsupported hypothesis has no children at all, or none that lead to updates or answers
      if (!childrenCount.get(e.id) || !canReachType(e.id, ["action", "observation", "belief_update", "final_answer"])) {
        unsupportedHypotheses.push(e.id);
        addFinding({ id: `unsupported-${e.id}`, severity: "warning", category: "grounding", title: "Unsupported claim", detail: `Step ${e.step} does not lead to an action, observation, update, or answer.`, eventIds: [e.id], recommendation: "Collect evidence for this claim or mark it as abandoned." });
      }
    }
  });

  // 3. Detect actions taken without prior hypothesis or decision
  const actionsWithoutPriorHypothesis: string[] = [];
  if (recordsSupport) events.forEach(e => {
    if (e.type === "action") {
      // Check if it has any ancestor that is a hypothesis or decision
      const hasPlanningAncestor = hasAncestorType(e.id, ["hypothesis", "decision"]);
      if (!hasPlanningAncestor) {
        actionsWithoutPriorHypothesis.push(e.id);
        addFinding({ id: `unplanned-${e.id}`, severity: "info", category: "planning", title: "Unexplained action", detail: `Step ${e.step} has no linked hypothesis or decision. This may be normal for an opaque agent.`, eventIds: [e.id], recommendation: "Link the action to a goal or keep it classified as an observed behavior." });
      }
    }
  });

  // 4. An answer is grounded when an observation lies upstream of it. A
  // belief update on the path counts only through its own support, so an
  // unsupported update can't ground an answer (D5).
  const finalAnswers = events.filter(e => e.type === "final_answer");
  const ungroundedAnswers = finalAnswers.filter(fa => !hasAncestorType(fa.id, ["observation"]));
  let answerGrounding: AnswerGrounding;
  if (finalAnswers.length === 0) answerGrounding = "no_answer";
  else if (!recordsSupport) answerGrounding = "not_recorded";
  else if (ungroundedAnswers.length) answerGrounding = "ungrounded";
  else answerGrounding = "grounded";
  if (answerGrounding === "ungrounded") {
    addFinding({ id: "ungrounded-answer", severity: "critical", category: "grounding", title: "Answer lacks an evidence path", detail: `${ungroundedAnswers.length} of ${finalAnswers.length} final answers have no support path back to an observation.`, eventIds: ungroundedAnswers.map(event => event.id), recommendation: "Inspect the answer's support links and add the observations that justify it." });
  }

  // 5. Repeated calls. Either can be legitimate (polling, retrying after a
  // fix), so they are warnings to check, not failures.
  const actions = events.filter(e => e.type === "action");
  const callKey = (e: TraceEvent) => `${e.tool ?? ""}\u0000${e.content.trim().toLowerCase()}`;

  const identical = new Map<string, TraceEvent[]>();
  for (const action of actions) {
    const group = identical.get(callKey(action));
    if (group) group.push(action);
    else identical.set(callKey(action), [action]);
  }
  for (const group of identical.values()) {
    if (group.length < 2) continue;
    addFinding({ id: `same-call-${group[0].id}`, severity: "warning", category: "loop", title: "Same call repeated", detail: `The same ${group[0].tool ? `${group[0].tool} call` : "action"} appears ${group.length} times, at steps ${group.map(e => e.step).join(", ")}.`, eventIds: group.map(e => e.id), recommendation: "Check whether anything changed between the calls that could give a different result." });
  }

  // Runs of the same tool with no other action between them (D6). A run whose
  // calls are all identical is already reported above.
  let run: TraceEvent[] = [];
  const closeRun = () => {
    if (run.length >= 2 && new Set(run.map(callKey)).size > 1) {
      addFinding({ id: `tool-run-${run[0].id}`, severity: "warning", category: "loop", title: "Repeated tool call", detail: `${run[0].tool} is called ${run.length} times in a row, at steps ${run.map(e => e.step).join(", ")}, with no other action between.`, eventIds: run.map(e => e.id), recommendation: "Check whether each call used what the previous one returned, or repeated a step that was not working." });
    }
    run = [];
  };
  for (const action of actions) {
    if (!action.tool || (run.length && run[0].tool !== action.tool)) closeRun();
    if (action.tool) run.push(action);
  }
  closeRun();

  // 6. Warnings for missing confidence on updates
  events.forEach(e => {
    if (e.type === "belief_update" && e.confidence === undefined) {
      addFinding({ id: `missing-confidence-${e.id}`, severity: "info", category: "confidence", title: "Uncalibrated update", detail: `Step ${e.step} changes a belief without a confidence value.`, eventIds: [e.id], recommendation: "Record confidence when the runtime provides it; do not invent it after the fact." });
    }
  });

  // 7. General failure node warnings
  events.forEach(e => {
    if (e.type === "failure") {
      addFinding({ id: `failure-${e.id}`, severity: "critical", category: "contradiction", title: "Failure recorded", detail: `A failure event appears at step ${e.step}.`, eventIds: [e.id], recommendation: "Trace the incoming evidence and the next recovery action." });
    }
  });

  const groundedAnswerCount = finalAnswers.length - ungroundedAnswers.length;
  const claims = events.filter(e => ["hypothesis", "belief_update", "decision", "final_answer"].includes(e.type));
  // Support flows from evidence to claim, so only observations upstream count.
  // An observation a claim leads to is a test of it, not support for it (D3).
  const supportedClaims = claims.filter(event => hasAncestorType(event.id, ["observation"]));
  const evidenceCoverage = recordsSupport && claims.length ? Math.round((supportedClaims.length / claims.length) * 100) : null;
  const opaqueEventCount = events.filter(e => e.label === "observed").length;
  const inferredEventCount = events.filter(e => e.label === "inferred").length;

  if (opaqueEventCount > 0) {
    addFinding({ id: "opaque-trace", severity: "info", category: "visibility", title: "Observed behavior trace", detail: `${opaqueEventCount} events are observable outputs or tool records, not private model reasoning.`, eventIds: events.filter(e => e.label === "observed").map(e => e.id), recommendation: "Use this trace to evaluate behavior and evidence paths; do not infer hidden thoughts from it." });
  }
  if (inferredEventCount > 0) {
    addFinding({ id: "inferred-events", severity: "info", category: "visibility", title: "Analyst inferences present", detail: `${inferredEventCount} events were reconstructed from behavior.`, eventIds: events.filter(e => e.label === "inferred").map(e => e.id), recommendation: "Treat inferred nodes as hypotheses about behavior, not observations." });
  }

  return {
    hypothesisCount,
    actionCount,
    observationCount,
    failureCount,
    beliefUpdateCount,
    decisionCount,
    finalAnswerCount,
    hypothesisToObservationRatio,
    unsupportedHypotheses,
    actionsWithoutPriorHypothesis,
    answerGrounding,
    evidenceCoverage,
    groundedAnswerCount,
    opaqueEventCount,
    inferredEventCount,
    findings,
    warnings
  };
}
