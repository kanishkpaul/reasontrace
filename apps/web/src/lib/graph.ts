import type { CSSProperties } from "react";
import { supportOrder } from "@reasontrace/analysis";
import type { TraceEvent } from "@reasontrace/format";

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
  style?: CSSProperties;
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
    e.supports.forEach(parentId => {
      if (eventMap.has(parentId)) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(e.id);
      }
    });
  });

  const xPositions: Record<string, number> = {};
  const yPositions: Record<string, number> = {};

  const sortedEvents = [...events].sort((a, b) => a.step - b.step);

  // Rows follow the order of step values, not the values themselves: steps can
  // be sparse or timestamps, which would put rows millions of pixels apart (G3).
  const rowOfStep = new Map([...new Set(sortedEvents.map(e => e.step))].map((step, row) => [step, row + 1]));
  sortedEvents.forEach(event => {
    yPositions[event.id] = (rowOfStep.get(event.step) ?? 0) * Y_SPACING;
  });

  // Each node is placed once, after the nodes that support it (G4), next to
  // its parents, then nudged right past any node already in its row. Rows are
  // not re-centred afterwards, which would undo the alignment (G5).
  const placedInRow = new Map<number, number[]>();
  for (const event of supportOrder(events)) {
    const parentLinks = event.supports.filter(pId => eventMap.has(pId));
    let x = 0;
    if (parentLinks.length === 1) {
      const siblings = childrenMap.get(parentLinks[0]) ?? [];
      x = xPositions[parentLinks[0]] + (siblings.indexOf(event.id) - (siblings.length - 1) / 2) * X_SPACING;
    } else if (parentLinks.length > 1) {
      x = parentLinks.reduce((sum, pId) => sum + xPositions[pId], 0) / parentLinks.length;
    }
    const row = placedInRow.get(event.step) ?? [];
    let blocker = row.find(other => Math.abs(other - x) < X_SPACING - 40);
    while (blocker !== undefined) {
      x = blocker + X_SPACING;
      blocker = row.find(other => Math.abs(other - x) < X_SPACING - 40);
    }
    row.push(x);
    placedInRow.set(event.step, row);
    xPositions[event.id] = x;
  }

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
    const parentLinks = event.supports.filter(pId => eventMap.has(pId));

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
        const strokeColor = "#1F293D";

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
