import type { ReasonTrace, TraceEvent, TraceDiagnostics, TraceFinding } from "../types";

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

  // Build graph representations for reachability
  // dependency graph: child -> parent (represented by event.links)
  // We want to traverse forward (parent -> children) and backward (child -> parents)
  const childrenMap = new Map<string, string[]>(); // parentId -> childIds[]
  const parentMap = new Map<string, string[]>();   // childId -> parentIds[]
  const eventMap = new Map<string, TraceEvent>();

  events.forEach(e => {
    eventMap.set(e.id, e);
    parentMap.set(e.id, e.links || []);
    e.links?.forEach(parentId => {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(e.id);
    });
  });

  // Helper: check if a node has any path to a node of certain types
  function canReachType(startId: string, targetTypes: string[], visited = new Set<string>()): boolean {
    if (visited.has(startId)) return false;
    visited.add(startId);

    const children = childrenMap.get(startId) || [];
    for (const childId of children) {
      const child = eventMap.get(childId);
      if (child && targetTypes.includes(child.type)) {
        return true;
      }
      if (canReachType(childId, targetTypes, visited)) {
        return true;
      }
    }
    return false;
  }

  // Helper: check if a node is reachable from any node of certain types (backward traversal)
  function hasAncestorType(startId: string, targetTypes: string[], visited = new Set<string>()): boolean {
    if (visited.has(startId)) return false;
    visited.add(startId);

    const parents = parentMap.get(startId) || [];
    for (const parentId of parents) {
      const parent = eventMap.get(parentId);
      if (parent && targetTypes.includes(parent.type)) {
        return true;
      }
      if (hasAncestorType(parentId, targetTypes, visited)) {
        return true;
      }
    }
    return false;
  }

  // 2. Detect unsupported hypotheses (hypotheses with no downstream effect / no links going to observations/belief_updates/final_answers)
  const unsupportedHypotheses: string[] = [];
  events.forEach(e => {
    if (e.type === "hypothesis") {
      const children = childrenMap.get(e.id) || [];
      // An unsupported hypothesis has no children at all, or none that lead to updates or answers
      if (children.length === 0 || !canReachType(e.id, ["action", "observation", "belief_update", "final_answer"])) {
        unsupportedHypotheses.push(e.id);
        addFinding({ id: `unsupported-${e.id}`, severity: "warning", category: "grounding", title: "Unsupported claim", detail: `Step ${e.step} does not lead to an action, observation, update, or answer.`, eventIds: [e.id], recommendation: "Collect evidence for this claim or mark it as abandoned." });
      }
    }
  });

  // 3. Detect actions taken without prior hypothesis or decision
  const actionsWithoutPriorHypothesis: string[] = [];
  events.forEach(e => {
    if (e.type === "action") {
      // Check if it has any ancestor that is a hypothesis or decision
      const hasPlanningAncestor = hasAncestorType(e.id, ["hypothesis", "decision"]);
      if (!hasPlanningAncestor) {
        actionsWithoutPriorHypothesis.push(e.id);
        addFinding({ id: `unplanned-${e.id}`, severity: "info", category: "planning", title: "Unexplained action", detail: `Step ${e.step} has no linked hypothesis or decision. This may be normal for an opaque agent.`, eventIds: [e.id], recommendation: "Link the action to a goal or keep it classified as an observed behavior." });
      }
    }
  });

  // 4. Verify grounding of final answer (is there a path from final answer back to observations or belief updates?)
  let hasEvidenceChain = true;
  if (finalAnswerCount > 0) {
    const finalAnswers = events.filter(e => e.type === "final_answer");
    const groundedAnswers = finalAnswers.filter(fa => hasAncestorType(fa.id, ["observation", "belief_update"]));
    
    if (groundedAnswers.length === 0) {
      hasEvidenceChain = false;
      addFinding({ id: "ungrounded-answer", severity: "critical", category: "grounding", title: "Answer lacks an evidence path", detail: "No final answer links back to an observation or an evidence-informed update.", eventIds: finalAnswers.map(event => event.id), recommendation: "Inspect the answer's parent links and add the observations that justify it." });
    }
  }

  // 5. Detect loops or repeated action patterns
  // Pattern 1: Same tool called consecutively
  let lastAction: TraceEvent | null = null;
  let repeatedToolCount = 0;
  let loopDetected = false;

  for (const e of events) {
    if (e.type === "action") {
      if (lastAction && e.tool && lastAction.tool === e.tool) {
        repeatedToolCount++;
        if (repeatedToolCount >= 2 && !loopDetected) {
          addFinding({ id: `tool-loop-${e.id}`, severity: "warning", category: "loop", title: "Possible tool loop", detail: `${e.tool} repeats without an intervening strategy change near steps ${lastAction.step} and ${e.step}.`, eventIds: [lastAction.id, e.id], recommendation: "Check whether the later call used new evidence or add a recovery condition." });
          loopDetected = true;
        }
      } else {
        repeatedToolCount = 0;
      }
      lastAction = e;
    }
  }

  // Pattern 2: Identical action content
  const actionContents = events.filter(e => e.type === "action").map(e => e.content.trim().toLowerCase());
  const uniqueActions = new Set(actionContents);
  if (actionContents.length - uniqueActions.size > 1) {
    addFinding({ id: "content-loop", severity: "warning", category: "loop", title: "Repeated action content", detail: "The trace repeats the same action text more than once.", eventIds: events.filter(e => e.type === "action").map(e => e.id), recommendation: "Compare the repeated attempts and require a changed input or new observation before retrying." });
  }

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

  const answerEvents = events.filter(e => e.type === "final_answer");
  const groundedAnswerCount = answerEvents.filter(answer => hasAncestorType(answer.id, ["observation", "belief_update"])).length;
  const claims = events.filter(e => ["hypothesis", "belief_update", "decision", "final_answer"].includes(e.type));
  const supportedClaims = claims.filter(event => hasAncestorType(event.id, ["observation"]) || canReachType(event.id, ["observation"]));
  const evidenceCoverage = claims.length ? Math.round((supportedClaims.length / claims.length) * 100) : 0;
  const opaqueEventCount = events.filter(e => e.evidenceMode === "observed").length;
  const inferredEventCount = events.filter(e => e.evidenceMode === "inferred").length;

  if (opaqueEventCount > 0) {
    addFinding({ id: "opaque-trace", severity: "info", category: "visibility", title: "Observed behavior trace", detail: `${opaqueEventCount} events are observable outputs or tool records, not private model reasoning.`, eventIds: events.filter(e => e.evidenceMode === "observed").map(e => e.id), recommendation: "Use this trace to evaluate behavior and evidence paths; do not infer hidden thoughts from it." });
  }
  if (inferredEventCount > 0) {
    addFinding({ id: "inferred-events", severity: "info", category: "visibility", title: "Analyst inferences present", detail: `${inferredEventCount} events were reconstructed from behavior.`, eventIds: events.filter(e => e.evidenceMode === "inferred").map(e => e.id), recommendation: "Treat inferred nodes as hypotheses about behavior, not observations." });
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
    hasEvidenceChain,
    evidenceCoverage,
    groundedAnswerCount,
    opaqueEventCount,
    inferredEventCount,
    findings,
    warnings
  };
}
