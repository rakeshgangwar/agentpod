<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { createWorkflow } from "$lib/stores/workflows.svelte";
  import { WorkflowCanvas } from "$lib/components/workflow";
  import PropertiesPanel from "$lib/components/workflow/PropertiesPanel.svelte";
  import { TriggerNode, AIAgentNode, ActionNode, ConditionNode } from "$lib/components/workflow/nodes";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import type { ISvelteFlowNode, ISvelteFlowEdge, INode, IConnections, WorkflowNodeType } from "@agentpod/types";
  import { SvelteFlowProvider, type NodeTypes } from "@xyflow/svelte";

  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";

  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  let workflowName = $state("Untitled Workflow");
  let workflowDescription = $state("");
  let nodes = $state<ISvelteFlowNode[]>([
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 250, y: 100 },
      data: { label: "Manual Trigger", triggerType: "manual" },
    },
  ]);
  let edges = $state<ISvelteFlowEdge[]>([]);
  let selectedNode = $state<ISvelteFlowNode | null>(null);
  let isSaving = $state(false);
  let showPalette = $state(true);
  let showProperties = $state(true);
  let deleteNodeId = $state<string | null>(null);

  const nodeTypes: NodeTypes = {
    trigger: TriggerNode,
    "ai-agent": AIAgentNode,
    action: ActionNode,
    condition: ConditionNode,
  };

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/workflows");
    }
  }

  function handleNodesChange(updatedNodes: ISvelteFlowNode[]) {
    console.log("[Page] handleNodesChange called with", updatedNodes.length, "nodes");
    nodes = updatedNodes;
  }

  function handleEdgesChange(updatedEdges: ISvelteFlowEdge[]) {
    console.log("[Page] handleEdgesChange called with", updatedEdges.length, "edges");
    edges = updatedEdges;
  }

  function handleNodeSelect(node: ISvelteFlowNode | null) {
    console.log("[Page] handleNodeSelect called", node?.id ?? "null");
    selectedNode = node;
  }

  function handleNodeUpdate(nodeId: string, updates: Partial<ISvelteFlowNode>) {
    nodes = nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n);
  }

  function handleNodeDelete(nodeId: string) {
    deleteNodeId = nodeId;
  }

  function convertToN8nFormat(): { nodes: INode[]; connections: IConnections } {
    const n8nNodes: INode[] = nodes.map(node => ({
      id: node.id,
      name: node.data.label as string || node.id,
      type: (node.data.nodeType as WorkflowNodeType) || "http-request",
      position: [node.position.x, node.position.y] as [number, number],
      parameters: {
        ...node.data,
        label: undefined,
        nodeType: undefined,
      },
    }));

    const connections: IConnections = {};
    edges.forEach(edge => {
      if (!connections[edge.source]) {
        connections[edge.source] = { main: [[]] };
      }
      connections[edge.source].main[0].push({
        node: edge.target,
        type: "main",
        index: 0,
      });
    });

    return { nodes: n8nNodes, connections };
  }

  async function handleSave() {
    if (!workflowName.trim()) return;
    
    isSaving = true;
    try {
      const { nodes: n8nNodes, connections } = convertToN8nFormat();
      
      const workflow = await createWorkflow({
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        nodes: n8nNodes,
        connections,
      });

      if (workflow) {
        goto(`/workflows/${workflow.id}`);
      }
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="noise-overlay"></div>

<main class="h-screen flex flex-col grid-bg overflow-hidden">
  <header class="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/50 backdrop-blur-sm">
    <div class="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        onclick={goBack}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
      >
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>

      <div class="flex items-center gap-3">
        <Input
          bind:value={workflowName}
          placeholder="Workflow name..."
          class="h-8 w-64 font-semibold bg-transparent border-transparent hover:border-border focus:border-[var(--cyber-cyan)]"
        />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onclick={() => showPalette = !showPalette}
        class="h-8 w-8 {showPalette ? 'text-[var(--cyber-cyan)]' : ''}"
        title="Toggle node palette"
      >
        <PanelLeftIcon class="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onclick={() => showProperties = !showProperties}
        class="h-8 w-8 {showProperties ? 'text-[var(--cyber-cyan)]' : ''}"
        title="Toggle properties panel"
      >
        <PanelRightIcon class="h-4 w-4" />
      </Button>

      <ThemeToggle />

      <Button
        onclick={handleSave}
        disabled={isSaving || !workflowName.trim()}
        class="cyber-btn-primary px-4 h-8 font-mono text-xs uppercase tracking-wider"
      >
        <SaveIcon class="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  </header>

  <SvelteFlowProvider>
    <div class="flex-1 flex overflow-hidden">
      <WorkflowCanvas
        initialNodes={nodes}
        initialEdges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeSelect={handleNodeSelect}
        nodeTypes={nodeTypes}
        showPalette={showPalette}
        bind:deleteNodeId
      />

      {#if showProperties}
        <div class="w-80">
          <PropertiesPanel
            {selectedNode}
            onNodeUpdate={handleNodeUpdate}
            onNodeDelete={handleNodeDelete}
            onClose={() => selectedNode = null}
          />
        </div>
      {/if}
    </div>
  </SvelteFlowProvider>
</main>
