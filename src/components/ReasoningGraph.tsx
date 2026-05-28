import React, { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { useTraceStore } from "../store";
import { buildGraphData } from "../lib/graph";
import { CustomTraceNode } from "./CustomTraceNode";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

// Register custom node type
const nodeTypes = {
  customTraceNode: CustomTraceNode,
};

export const ReasoningGraph: React.FC = () => {
  const {
    currentTrace,
    currentStep,
    selectedNodeId,
    newestNodeId,
    filters,
    settings,
    setSelectedNodeId,
  } = useTraceStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // 1. Filter events based on active filters and current scrubber step
  const visibleEvents = useMemo(() => {
    if (!currentTrace) return [];

    return currentTrace.events.filter(event => {
      // Step boundary filter (replay scrubber)
      if (event.step > currentStep) return false;

      // Event Type filter
      if (!filters.eventTypes[event.type]) return false;

      // Search Query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const contentMatch = event.content.toLowerCase().includes(query);
        const toolMatch = event.tool ? event.tool.toLowerCase().includes(query) : false;
        const typeMatch = event.type.toLowerCase().includes(query);
        if (!contentMatch && !toolMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [currentTrace, currentStep, filters]);

  // 2. Build graph nodes and edges from visible events using custom layout
  const graphData = useMemo(() => {
    return buildGraphData(
      visibleEvents,
      selectedNodeId,
      newestNodeId,
      settings.showTemporalEdges,
      settings.highlightFailures
    );
  }, [visibleEvents, selectedNodeId, newestNodeId, settings]);

  // 3. Update React Flow state when built data changes
  useEffect(() => {
    // Map custom GraphNode to React Flow Node type
    const rfNodes: Node[] = graphData.nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
      selectable: true,
      draggable: true, // Allow users to clean up layout manually if needed
    }));

    // Map custom GraphEdge to React Flow Edge type
    const rfEdges: Edge[] = graphData.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      animated: e.animated,
      style: e.style,
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, setNodes, setEdges]);

  // 4. Handle Node Click
  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  };

  // 5. Handle Pane Click (deselects node if clicking empty canvas)
  const onPaneClick = () => {
    setSelectedNodeId(null);
  };

  // React Flow Ref to fit view
  const reactFlowRef = React.useRef<any>(null);

  const fitView = () => {
    if (reactFlowRef.current) {
      reactFlowRef.current.fitView({ padding: 0.2, duration: 800 });
    }
  };

  const zoomIn = () => {
    if (reactFlowRef.current) {
      reactFlowRef.current.zoomIn({ duration: 300 });
    }
  };

  const zoomOut = () => {
    if (reactFlowRef.current) {
      reactFlowRef.current.zoomOut({ duration: 300 });
    }
  };

  // Empty state landing screen if no trace is imported
  if (!currentTrace || currentTrace.events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-cyber-bg text-cyber-text">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-blue-500 rounded-full filter blur-xl opacity-20 animate-pulse w-24 h-24 mx-auto" />
          <Brain className="w-16 h-16 text-blue-500 mx-auto relative z-10" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-cyber-text mb-2">
          Paste a reasoning trace to turn it into a debuggable graph.
        </h2>
        <p className="text-sm text-cyber-muted max-w-md">
          Inspect hypotheses. Trace evidence. Find the failure point.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg w-full">
          <div className="p-4 rounded-xl border border-cyber-border bg-cyber-card text-left hover:border-cyber-hover transition-colors cursor-pointer"
               onClick={() => useTraceStore.getState().loadSampleTrace("arc-agi-solver")}>
            <span className="text-xs font-bold text-pink-400 block mb-1 font-mono uppercase">Featured Example</span>
            <span className="text-sm font-semibold block text-cyber-text">ARC-AGI Solver Failure</span>
            <span className="text-xs text-cyber-muted block mt-1">Spurious Symmetry Hypothesis loop & object counting recovery.</span>
          </div>
          <div className="p-4 rounded-xl border border-cyber-border bg-cyber-card text-left hover:border-cyber-hover transition-colors cursor-pointer"
               onClick={() => useTraceStore.getState().loadSampleTrace("code-debugger")}>
            <span className="text-xs font-bold text-blue-400 block mb-1 font-mono uppercase">Developer Demo</span>
            <span className="text-sm font-semibold block text-cyber-text">Parser Loop boundary Bug</span>
            <span className="text-xs text-cyber-muted block mt-1">Finding an off-by-one boundary error in parser loops.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-cyber-bg border border-cyber-border rounded-xl overflow-hidden shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        minZoom={0.1}
        maxZoom={2}
        fitView
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
      >
        <Background color="#1F293D" gap={24} size={1} />
        
        {/* Custom MiniMap */}
        <MiniMap 
          style={{ background: '#121826', border: '1px solid #1F293D', borderRadius: '8px' }}
          nodeColor={(node) => {
            const evType = (node.data as any)?.event?.type;
            if (evType === "failure") return "#EF4444";
            if (evType === "final_answer") return "#EC4899";
            return "#1F293D";
          }}
          maskColor="rgba(10, 14, 23, 0.7)"
          ariaLabel="Mini Map View"
        />

        {/* Custom floating control bar */}
        <Panel position="top-right" className="flex space-x-1 bg-cyber-card border border-cyber-border p-1 rounded-lg shadow-cyber-glow">
          <button
            onClick={zoomIn}
            className="p-1.5 rounded text-cyber-muted hover:text-cyber-primary hover:bg-cyber-hover transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={zoomOut}
            className="p-1.5 rounded text-cyber-muted hover:text-cyber-primary hover:bg-cyber-hover transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitView}
            className="p-1.5 rounded text-cyber-muted hover:text-cyber-primary hover:bg-cyber-hover transition-colors"
            title="Fit View"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </Panel>

        {/* Graph metadata overlay */}
        <Panel position="top-left" className="bg-cyber-card/80 backdrop-blur-sm border border-cyber-border px-3 py-1.5 rounded-lg text-[10px] text-cyber-muted flex items-center space-x-2 pointer-events-none">
          <span className="font-semibold text-cyber-text">{currentTrace.title}</span>
          <span className="w-1 h-1 rounded-full bg-cyber-border" />
          <span>Showing {visibleEvents.length} of {currentTrace.events.length} events</span>
          {filters.searchQuery && (
            <>
              <span className="w-1 h-1 rounded-full bg-cyber-border" />
              <span className="text-cyan-400 font-semibold font-mono">Filtered by: "{filters.searchQuery}"</span>
            </>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
};

// Simple Fallback Brain Icon for Empty State
const Brain = ({ className, ...props }: React.ComponentProps<"svg">) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="M12 6v12" />
    <path d="M8 10h8" />
    <path d="M8 14h8" />
  </svg>
);
