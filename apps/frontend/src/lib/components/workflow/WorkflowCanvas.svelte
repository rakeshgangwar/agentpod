<script lang="ts">
  import {
    SvelteFlow,
    Controls,
    Background,
    MiniMap,
    Panel,
    BackgroundVariant,
    useSvelteFlow,
    type Node,
    type Edge,
    type NodeTypes,
    type Connection,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { Button } from "$lib/components/ui/button";
  import SaveIcon from "@lucide/svelte/icons/save";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import PlayIcon from "@lucide/svelte/icons/play";
  import type { ISvelteFlowNode, ISvelteFlowEdge } from "@agentpod/types";
  import NodePalette from "./NodePalette.svelte";

  interface Props {
    initialNodes?: ISvelteFlowNode[];
    initialEdges?: ISvelteFlowEdge[];
    onNodesChange?: (nodes: ISvelteFlowNode[]) => void;
    onEdgesChange?: (edges: ISvelteFlowEdge[]) => void;
    onNodeSelect?: (node: ISvelteFlowNode | null) => void;
    deleteNodeId?: string | null;
    readonly?: boolean;
    nodeTypes?: NodeTypes;
    showPalette?: boolean;
  }

  let {
    initialNodes = [],
    initialEdges = [],
    onNodesChange = () => {},
    onEdgesChange = () => {},
    onNodeSelect = () => {},
    deleteNodeId = $bindable(null),
    readonly = false,
    nodeTypes = undefined,
    showPalette = true,
  }: Props = $props();

  const { screenToFlowPosition } = useSvelteFlow();

  let nodes = $state.raw<Node[]>(
    initialNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { ...n.position },
      data: { ...n.data },
    })) as Node[]
  );

  let edges = $state.raw<Edge[]>(
    initialEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type,
      animated: e.animated ?? true,
      label: e.label,
      data: e.data,
    })) as Edge[]
  );

  const nodeTypeLabels: Record<string, string> = {
    "manual-trigger": "Manual Trigger",
    "webhook-trigger": "Webhook",
    "schedule-trigger": "Schedule",
    "event-trigger": "Event",
    "ai-agent": "AI Agent",
    "ai-prompt": "AI Prompt",
    "embeddings": "Embeddings",
    "vector-search": "Vector Search",
    "condition": "Condition",
    "switch": "Switch",
    "loop": "Loop",
    "merge": "Merge",
    "http-request": "HTTP Request",
    "email": "Email",
    "database": "Database",
    "storage": "Storage",
    "notification": "Notification",
    "approval": "Approval",
    "form": "Form",
    "javascript": "JavaScript",
    "python": "Python",
  };

  function handleNodeDragStop(event: { targetNode: Node | null; nodes: Node[]; event: MouseEvent | TouchEvent }) {
    notifyNodesChange();
  }

  function handleConnect(connection: Connection) {
    const newEdge: Edge = {
      id: `${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      animated: true,
    };
    edges = [...edges, newEdge];
    notifyEdgesChange();
  }

  function handleNodeClick(event: { node: Node; event: MouseEvent | TouchEvent }) {
    onNodeSelect(event.node as ISvelteFlowNode);
  }

  function handlePaneClick() {
    onNodeSelect(null);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    console.log("[WorkflowCanvas] onDragOver");
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    console.log("[WorkflowCanvas] onDrop triggered");
    
    const type = event.dataTransfer?.getData("application/svelteflow");
    console.log("[WorkflowCanvas] Drop type:", type);
    
    if (!type) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const nodeType = type.includes("trigger") ? "trigger"
      : type.includes("ai") ? "ai-agent"
      : type.includes("condition") || type.includes("switch") ? "condition"
      : "action";

    const label = nodeTypeLabels[type] || type;

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: nodeType,
      position,
      data: { label, nodeType: type },
    };

    console.log("[WorkflowCanvas] Creating node:", newNode);
    nodes = [...nodes, newNode];
    notifyNodesChange();
  }

  function dropzone(node: HTMLElement) {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      console.log("[dropzone action] dragover");
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      console.log("[dropzone action] drop");
      onDrop(e);
    };

    node.addEventListener("dragover", handleDragOver);
    node.addEventListener("drop", handleDrop);

    return {
      destroy() {
        node.removeEventListener("dragover", handleDragOver);
        node.removeEventListener("drop", handleDrop);
      }
    };
  }

  function notifyNodesChange() {
    const updatedNodes = nodes.map((n) => ({
      id: n.id,
      type: n.type || "action",
      position: { x: n.position.x, y: n.position.y },
      data: n.data as Record<string, unknown>,
    }));
    onNodesChange(updatedNodes);
  }

  function performDeleteNode(nodeId: string) {
    nodes = nodes.filter(n => n.id !== nodeId);
    edges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    notifyNodesChange();
    notifyEdgesChange();
    onNodeSelect(null);
  }

  $effect(() => {
    if (deleteNodeId) {
      performDeleteNode(deleteNodeId);
      deleteNodeId = null;
    }
  });

  function notifyEdgesChange() {
    onEdgesChange(edges as ISvelteFlowEdge[]);
  }

  function handleSave() {
    notifyNodesChange();
    notifyEdgesChange();
  }

  function handleValidate() {
    console.log("Validate workflow:", { nodes, edges });
  }

  function handleExecute() {
    console.log("Execute workflow:", { nodes, edges });
  }
</script>

<div class="workflow-canvas">
  <NodePalette collapsed={!showPalette} />
  
  <div 
    class="flow-container"
    role="application"
    use:dropzone
  >
    <SvelteFlow
      bind:nodes
      bind:edges
      {nodeTypes}
      fitView
      defaultEdgeOptions={{
        animated: true,
        style: "stroke: var(--cyber-cyan); stroke-width: 2px;",
      }}
      nodesDraggable={!readonly}
      nodesConnectable={!readonly}
      elementsSelectable={!readonly}
      onnodedragstop={handleNodeDragStop}
      onconnect={handleConnect}
      onnodeclick={handleNodeClick}
      onpaneclick={handlePaneClick}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} class="opacity-30" />
      <Controls
        showZoom={true}
        showFitView={true}
        class="bg-card/80 backdrop-blur-sm border border-border rounded-lg shadow-lg"
      />
      <MiniMap
        nodeColor={(node) => {
          if (node.type === "ai-agent") return "var(--cyber-emerald)";
          if (node.type?.includes("trigger")) return "var(--cyber-cyan)";
          if (node.type?.includes("condition")) return "var(--cyber-amber)";
          return "var(--muted-foreground)";
        }}
        maskColor="rgba(0, 0, 0, 0.1)"
        class="bg-card/80 backdrop-blur-sm border border-border rounded-lg shadow-lg"
      />
      <Panel position="top-right" class="flex gap-2 m-4">
        <Button
          variant="outline"
          size="sm"
          onclick={handleSave}
          disabled={readonly}
          class="bg-card/80 backdrop-blur-sm hover:bg-accent/50 shadow-md"
        >
          <SaveIcon class="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={handleValidate}
          class="bg-card/80 backdrop-blur-sm hover:bg-accent/50 shadow-md"
        >
          <CheckCircleIcon class="w-4 h-4 mr-2" />
          Validate
        </Button>
        <Button
          size="sm"
          onclick={handleExecute}
          disabled={readonly}
          class="bg-card/80 backdrop-blur-sm shadow-md"
        >
          <PlayIcon class="w-4 h-4 mr-2" />
          Execute
        </Button>
      </Panel>
    </SvelteFlow>
  </div>
</div>

<style>
  .workflow-canvas {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .flow-container {
    flex: 1;
    position: relative;
  }

  /* Custom node components handle their own styling - keep wrapper transparent */
  :global(.svelte-flow__node) {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    color: hsl(var(--foreground));
    font-family: var(--font-body), system-ui, sans-serif;
  }

  :global(.svelte-flow__node:hover) {
    box-shadow: none !important;
  }

  :global(.svelte-flow__node.selected) {
    box-shadow: none !important;
  }

  :global(.svelte-flow__edge-path) {
    stroke: var(--cyber-cyan);
    stroke-width: 2px;
  }

  :global(.svelte-flow__edge.animated path) {
    stroke-dasharray: 6 4;
    animation: dashdraw 0.8s linear infinite;
  }

  :global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
    stroke: var(--cyber-emerald);
    stroke-width: 3px;
  }

  :global(.svelte-flow__handle) {
    width: 10px;
    height: 10px;
    background: var(--cyber-cyan);
    border: 2px solid hsl(var(--background));
    box-shadow: 0 0 8px var(--cyber-cyan);
  }

  :global(.svelte-flow__handle:hover) {
    background: var(--cyber-emerald);
    box-shadow: 0 0 12px var(--cyber-emerald);
  }

  :global(.svelte-flow__controls button) {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
    transition: all 0.2s ease;
  }

  :global(.svelte-flow__controls button:hover:not(:disabled)) {
    background: hsl(var(--accent));
    border-color: var(--cyber-cyan);
  }

  :global(.svelte-flow__controls button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.svelte-flow__minimap) {
    background: hsl(var(--card) / 0.9) !important;
  }

  /* Theme-aware canvas background */
  :global(.svelte-flow) {
    background: hsl(var(--background)) !important;
  }

  :global(.svelte-flow__background) {
    background: hsl(var(--background)) !important;
  }

  :global(.svelte-flow__background pattern circle) {
    fill: hsl(var(--muted-foreground) / 0.3) !important;
  }

  @keyframes dashdraw {
    to {
      stroke-dashoffset: -20;
    }
  }

  /* Dark mode shadows handled by inner node components */
</style>
