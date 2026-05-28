import type { TraceEvent } from "../types";

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    event: TraceEvent;
    isSelected: boolean;
    isHighlightedFailure: boolean;
    isNewest: boolean;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated?: boolean;
  style?: Record<string, any>;
  dashed?: boolean;
}

/**
 * Custom layout engine for ReasonTrace events.
 * Arranges nodes in Y-coordinate based on steps, and calculates X-coordinate
 * to spread out branches and center merged paths.
 */
export function buildGraphData(
  events: TraceEvent[],
  selectedNodeId: string | null,
  newestNodeId: string | null,
  showTemporalEdges: boolean,
  highlightFailures: boolean
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (events.length === 0) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const Y_SPACING = 160;
  const X_SPACING = 240;

  // Map to find event index and properties quickly
  const eventMap = new Map<string, TraceEvent>();
  events.forEach(e => eventMap.set(e.id, e));

  // Determine children mapping for explicit links
  const childrenMap = new Map<string, string[]>();
  events.forEach(e => {
    e.links?.forEach(parentId => {
      if (eventMap.has(parentId)) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(e.id);
      }
    });
  });

  // Calculate X and Y coordinates
  const xPositions: Record<string, number> = {};
  const yPositions: Record<string, number> = {};

  // Track coordinates assigned per step to prevent overlaps
  const stepNodes: Record<number, string[]> = {};

  // Sort events by step to ensure correct order of evaluation
  const sortedEvents = [...events].sort((a, b) => a.step - b.step);

  sortedEvents.forEach(event => {
    // Y position is directly related to step
    yPositions[event.id] = event.step * Y_SPACING;

    if (!stepNodes[event.step]) {
      stepNodes[event.step] = [];
    }
    stepNodes[event.step].push(event.id);
  });

  // Assign X positions based on parent links and offsets
  sortedEvents.forEach(event => {
    const parentLinks = (event.links || []).filter(pId => eventMap.has(pId));

    if (parentLinks.length === 0) {
      // Root node or unlinked node
      xPositions[event.id] = 0;
    } else if (parentLinks.length === 1) {
      const parentId = parentLinks[0];
      const parentX = xPositions[parentId] || 0;
      const siblings = childrenMap.get(parentId) || [];

      if (siblings.length <= 1) {
        // Only child, align directly under parent
        xPositions[event.id] = parentX;
      } else {
        // Multiple children, spread them out relative to parent
        const idx = siblings.indexOf(event.id);
        const offset = (idx - (siblings.length - 1) / 2) * X_SPACING;
        xPositions[event.id] = parentX + offset;
      }
    } else {
      // Multiple parents, center between parents
      const parentXSum = parentLinks.reduce((sum, pId) => sum + (xPositions[pId] || 0), 0);
      xPositions[event.id] = parentXSum / parentLinks.length;
    }
  });

  // Post-processing to resolve horizontal overlapping at the same step
  sortedEvents.forEach(event => {
    const step = event.step;
    const nodesAtStep = stepNodes[step] || [];
    if (nodesAtStep.length > 1) {
      // Sort nodes at the same step by their calculated X positions
      nodesAtStep.sort((a, b) => xPositions[a] - xPositions[b]);
      
      // Enforce minimum horizontal distance
      for (let i = 1; i < nodesAtStep.length; i++) {
        const prevId = nodesAtStep[i - 1];
        const currId = nodesAtStep[i];
        if (xPositions[currId] - xPositions[prevId] < X_SPACING - 40) {
          xPositions[currId] = xPositions[prevId] + X_SPACING;
        }
      }

      // Center the group of nodes around 0 again
      const totalWidth = xPositions[nodesAtStep[nodesAtStep.length - 1]] - xPositions[nodesAtStep[0]];
      const offsetToCenter = - (xPositions[nodesAtStep[0]] + totalWidth / 2);
      nodesAtStep.forEach(id => {
        xPositions[id] += offsetToCenter;
      });
    }
  });

  // Build the React Flow nodes
  sortedEvents.forEach(event => {
    const isSelected = event.id === selectedNodeId;
    const isNewest = event.id === newestNodeId;
    const isHighlightedFailure = highlightFailures && event.type === "failure";

    nodes.push({
      id: event.id,
      type: "customTraceNode",
      position: { x: xPositions[event.id], y: yPositions[event.id] },
      data: {
        event,
        isSelected,
        isHighlightedFailure,
        isNewest
      }
    });
  });

  // Build Edges
  const explicitEdges = new Set<string>(); // Keep track of parentId-childId pairs

  sortedEvents.forEach(event => {
    const parentLinks = (event.links || []).filter(pId => eventMap.has(pId));

    parentLinks.forEach(parentId => {
      const edgeId = `edge-${parentId}-${event.id}`;
      explicitEdges.add(`${parentId}->${event.id}`);

      // Determine edge style based on node selection
      let strokeColor = "#3B82F6"; // Default blue
      let strokeWidth = 2;
      let opacity = 0.6;
      let animated = false;

      if (selectedNodeId) {
        if (selectedNodeId === event.id) {
          // Highlight incoming edge (cyan)
          strokeColor = "#06B6D4";
          strokeWidth = 3.5;
          opacity = 1.0;
          animated = true;
        } else if (selectedNodeId === parentId) {
          // Highlight outgoing edge (purple)
          strokeColor = "#8B5CF6";
          strokeWidth = 3.5;
          opacity = 1.0;
          animated = true;
        } else {
          // Dim non-selected paths
          strokeColor = "#1F293D";
          opacity = 0.25;
        }
      }

      edges.push({
        id: edgeId,
        source: parentId,
        target: event.id,
        type: "smoothstep",
        animated,
        style: {
          stroke: strokeColor,
          strokeWidth,
          opacity
        }
      });
    });
  });

  // Add faint temporal edges between consecutive steps if enabled
  if (showTemporalEdges) {
    for (let i = 1; i < sortedEvents.length; i++) {
      const prevEvent = sortedEvents[i - 1];
      const currEvent = sortedEvents[i];

      // Only add temporal edge if there isn't already an explicit edge between them
      if (!explicitEdges.has(`${prevEvent.id}->${currEvent.id}`)) {
        let opacity = 0.25;
        let strokeColor = "#1F293D";

        if (selectedNodeId) {
          // If a node is selected, dim temporal edges even further
          opacity = 0.1;
        }

        edges.push({
          id: `temp-${prevEvent.id}-${currEvent.id}`,
          source: prevEvent.id,
          target: currEvent.id,
          type: "straight",
          style: {
            stroke: strokeColor,
            strokeWidth: 1.5,
            strokeDasharray: "5,5",
            opacity
          },
          dashed: true
        });
      }
    }
  }

  return { nodes, edges };
}
