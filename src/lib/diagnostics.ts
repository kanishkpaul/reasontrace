import type { ReasonTrace, TraceEvent, TraceDiagnostics } from "../types";

/**
 * Computes heuristic diagnostics for a reasoning trace.
 */
export function computeDiagnostics(trace: ReasonTrace): TraceDiagnostics {
  const events = trace.events;
  const warnings: string[] = [];

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
        warnings.push(`Unsupported hypothesis: no observations or actions linked downstream of Step ${e.step} ("${e.content.substring(0, 40)}...")`);
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
        warnings.push(`Action taken without explicit prior hypothesis or decision at Step ${e.step} ("${e.content.substring(0, 40)}...")`);
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
      warnings.push("Final answer weakly grounded: no link back to observations or belief update evidence.");
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
          warnings.push(`Possible loop: repeated action pattern detected (tool '${e.tool}' executed consecutively in steps ${lastAction.step} and ${e.step}).`);
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
    warnings.push("Possible loop: repeated action content found. Agent might be stuck executing identical tasks.");
  }

  // 6. Warnings for missing confidence on updates
  events.forEach(e => {
    if (e.type === "belief_update" && e.confidence === undefined) {
      warnings.push(`Belief update missing confidence value at Step ${e.step}.`);
    }
  });

  // 7. General failure node warnings
  events.forEach(e => {
    if (e.type === "failure") {
      warnings.push(`Reasoning breakdown / failure event recorded at Step ${e.step}. Inspect surrounding context.`);
    }
  });

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
    warnings
  };
}
