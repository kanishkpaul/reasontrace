import { Background, Panel, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import type { Edge, Node, NodeChange, ReactFlowInstance, XYPosition } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildGraphData } from "../lib/graph";
import { FitIcon, ICON, ZoomInIcon, ZoomOutIcon } from "../lib/icons";
import { useTraceStore } from "../store";
import { useVisibleEvents } from "../useVisibleEvents";
import { CustomTraceNode } from "./CustomTraceNode";

const nodeTypes = { customTraceNode: CustomTraceNode };

/** The trace as a graph of support links, with time order as dashed edges. */
export function ReasoningGraph() {
  const { currentTrace, selectedNodeId, newestNodeId, settings, setSelectedNodeId } = useTraceStore(useShallow((s) => ({
    currentTrace: s.currentTrace,
    selectedNodeId: s.selectedNodeId,
    newestNodeId: s.newestNodeId,
    settings: s.settings,
    setSelectedNodeId: s.setSelectedNodeId,
  })));
  const visibleEvents = useVisibleEvents();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  // Where the user dragged nodes. Selecting a node rebuilds the graph, which
  // used to put every node back at its computed position (G1); these survive
  // until another trace opens.
  const draggedPositions = useRef(new Map<string, XYPosition>());
  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) draggedPositions.current.set(change.id, change.position);
    }
    onNodesChange(changes);
  }, [onNodesChange]);

  // A new trace starts from its own layout and is fitted to the view; the
  // `fitView` prop only fits on first mount (G2).
  useEffect(() => {
    draggedPositions.current.clear();
    const frame = requestAnimationFrame(() => reactFlowRef.current?.fitView({ padding: 0.2 }));
    return () => cancelAnimationFrame(frame);
  }, [currentTrace]);

  const graphData = useMemo(
    () => buildGraphData(visibleEvents, selectedNodeId, newestNodeId, settings.showTemporalEdges, settings.highlightFailures),
    [visibleEvents, selectedNodeId, newestNodeId, settings],
  );

  useEffect(() => {
    setNodes(graphData.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: draggedPositions.current.get(n.id) ?? n.position,
      data: n.data,
      selectable: true,
      draggable: true,
    })));
    setEdges(graphData.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, animated: e.animated, style: e.style })));
  }, [graphData, setNodes, setEdges]);

  return (
    <div className="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        minZoom={0.1}
        maxZoom={2}
        fitView
        onInit={(instance) => { reactFlowRef.current = instance; }}
      >
        <Background gap={24} size={1} />
        <Panel position="top-right" className="graph-view__controls">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Zoom in" onClick={() => reactFlowRef.current?.zoomIn({ duration: 300 })}>
            <ZoomInIcon size={ICON.size} stroke={ICON.stroke} />
          </button>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Zoom out" onClick={() => reactFlowRef.current?.zoomOut({ duration: 300 })}>
            <ZoomOutIcon size={ICON.size} stroke={ICON.stroke} />
          </button>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Fit the graph to the view" onClick={() => reactFlowRef.current?.fitView({ padding: 0.2, duration: 300 })}>
            <FitIcon size={ICON.size} stroke={ICON.stroke} />
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
