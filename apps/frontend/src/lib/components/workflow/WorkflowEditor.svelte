<script lang="ts">
  import {
    SvelteFlow,
    Controls,
    Background,
    MiniMap,
    Panel,
    BackgroundVariant,
    Position,
    useSvelteFlow,
    type Node,
    type Edge,
    type NodeTypes,
    type Connection,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import dagre from "@dagrejs/dagre";
  import { Button } from "$lib/components/ui/button";
  import { LayoutGrid } from "@lucide/svelte";
  import type { ISvelteFlowNode, ISvelteFlowEdge } from "@agentpod/types";

  interface Props {
    initialNodes?: ISvelteFlowNode[];
    initialEdges?: ISvelteFlowEdge[];
    onNodesChange?: (nodes: ISvelteFlowNode[]) => void;
    onEdgesChange?: (edges: ISvelteFlowEdge[]) => void;
    onNodeSelect?: (node: ISvelteFlowNode | null) => void;
    deleteNodeId?: string | null;
    readonly?: boolean;
    nodeTypes?: NodeTypes;
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
  }: Props = $props();

  const { screenToFlowPosition } = useSvelteFlow();

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let lastInitialNodesJson = $state("");

  $effect(() => {
    const newJson = JSON.stringify(initialNodes.map(n => ({ id: n.id, data: n.data })));
    if (newJson !== lastInitialNodesJson) {
      lastInitialNodesJson = newJson;
      nodes = initialNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { ...n.position },
        data: { ...n.data },
      })) as Node[];
    }
  });

  $effect(() => {
    edges = initialEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type,
      animated: e.animated ?? true,
      label: e.label,
      data: e.data,
    })) as Edge[];
  });

  function handleNodeDragStop(event: { targetNode: Node | null; nodes: Node[]; event: MouseEvent | TouchEvent }) {
    console.log("[WorkflowEditor] handleNodeDragStop triggered", event.targetNode?.id);
    notifyNodesChange();
  }

  function handleConnect(connection: Connection) {
    console.log("[WorkflowEditor] handleConnect triggered", connection);
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
    console.log("[WorkflowEditor] handleNodeClick triggered", event.node.id);
    onNodeSelect(event.node as ISvelteFlowNode);
  }

  function handlePaneClick() {
    console.log("[WorkflowEditor] handlePaneClick triggered");
    onNodeSelect(null);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    console.log("[WorkflowEditor] dragover");
  }

  // Auto-layout configuration
  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 60;

  function getLayoutedElements(
    nodesToLayout: Node[],
    edgesToLayout: Edge[],
    direction: "TB" | "LR" = "TB"
  ): { nodes: Node[]; edges: Edge[] } {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

    const isHorizontal = direction === "LR";

    nodesToLayout.forEach((node) => {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edgesToLayout.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodesToLayout.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
        position: {
          x: nodeWithPosition.x - NODE_WIDTH / 2,
          y: nodeWithPosition.y - NODE_HEIGHT / 2,
        },
      };
    });

    return { nodes: layoutedNodes, edges: edgesToLayout };
  }

  function handleAutoLayout(direction: "TB" | "LR" = "TB") {
    if (nodes.length === 0) return;
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges, direction);
    nodes = layoutedNodes;
    notifyNodesChange();
  }

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

  function handleDrop(event: DragEvent) {
    console.log("[WorkflowEditor] handleDrop triggered");
    event.preventDefault();
    
    const type = event.dataTransfer?.getData("application/svelteflow");
    console.log("[WorkflowEditor] Drop type:", type);
    
    if (!type) {
      console.log("[WorkflowEditor] No type data found");
      return;
    }

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    console.log("[WorkflowEditor] Position:", position);

    const nodeType = type.includes("trigger") ? "trigger"
      : type.includes("ai") ? "ai-agent"
      : type === "switch" ? "switch"
      : type === "condition" ? "condition"
      : "action";

    const label = nodeTypeLabels[type] || type;

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: nodeType,
      position,
      data: { label, nodeType: type },
    };

    console.log("[WorkflowEditor] Creating node:", newNode);
    nodes = [...nodes, newNode];
    console.log("[WorkflowEditor] Nodes count:", nodes.length);
    notifyNodesChange();
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

  function notifyEdgesChange() {
    onEdgesChange(edges as ISvelteFlowEdge[]);
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
</script>

<div class="w-full h-full bg-background" style="position: absolute; inset: 0;">
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
    ondragover={handleDragOver}
    ondrop={handleDrop}
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
        onclick={() => handleAutoLayout("TB")}
        disabled={readonly || nodes.length === 0}
        class="bg-card/80 backdrop-blur-sm hover:bg-accent/50 shadow-md"
        title="Auto arrange nodes"
      >
        <LayoutGrid class="w-4 h-4 mr-2" />
        Auto Layout
      </Button>
    </Panel>
  </SvelteFlow>
</div>

<style>
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
