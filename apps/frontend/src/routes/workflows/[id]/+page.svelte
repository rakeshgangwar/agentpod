<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { connection } from "$lib/stores/connection.svelte";
  import { workflows, fetchWorkflow, updateWorkflow, executeWorkflow, validateWorkflow } from "$lib/stores/workflows.svelte";
  import { WorkflowEditor } from "$lib/components/workflow";
  import NodePalette from "$lib/components/workflow/NodePalette.svelte";
  import PropertiesPanel from "$lib/components/workflow/PropertiesPanel.svelte";
  import { TriggerNode, AIAgentNode, ActionNode, ConditionNode } from "$lib/components/workflow/nodes";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import type { ISvelteFlowNode, ISvelteFlowEdge, INode, IConnections, IWorkflowValidationResult, WorkflowNodeType } from "@agentpod/types";
  import { SvelteFlowProvider, type NodeTypes } from "@xyflow/svelte";

  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PlayIcon from "@lucide/svelte/icons/play";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";

  const workflowId = $derived($page.params.id);

  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  $effect(() => {
    if (connection.isConnected && workflowId) {
      loadWorkflow();
    }
  });

  let workflowName = $state("Loading...");
  let workflowDescription = $state("");
  let nodes = $state<ISvelteFlowNode[]>([]);
  let edges = $state<ISvelteFlowEdge[]>([]);
  let selectedNode = $state<ISvelteFlowNode | null>(null);
  let isSaving = $state(false);
  let isExecuting = $state(false);
  let isValidating = $state(false);
  let showPalette = $state(true);
  let showProperties = $state(true);
  let validationResult = $state<IWorkflowValidationResult | null>(null);
  let isLoaded = $state(false);
  let deleteNodeId = $state<string | null>(null);

  const nodeTypes: NodeTypes = {
    trigger: TriggerNode,
    "ai-agent": AIAgentNode,
    action: ActionNode,
    condition: ConditionNode,
  };

  async function loadWorkflow() {
    if (!workflowId) return;
    const workflow = await fetchWorkflow(workflowId);
    if (workflow) {
      workflowName = workflow.name;
      workflowDescription = workflow.description || "";
      nodes = convertFromN8nFormat(workflow.nodes, workflow.connections);
      edges = convertEdgesFromN8n(workflow.nodes, workflow.connections);
      isLoaded = true;
    }
  }

  function convertFromN8nFormat(n8nNodes: INode[], connections: IConnections): ISvelteFlowNode[] {
    return n8nNodes.map(node => {
      const nodeType = node.type.includes("trigger") ? "trigger"
        : node.type.includes("ai") ? "ai-agent"
        : node.type.includes("condition") || node.type.includes("switch") ? "condition"
        : "action";

      return {
        id: node.id,
        type: nodeType,
        position: { x: node.position[0], y: node.position[1] },
        data: {
          label: node.name,
          nodeType: node.type,
          ...node.parameters,
        },
      };
    });
  }

  function convertEdgesFromN8n(n8nNodes: INode[], connections: IConnections): ISvelteFlowEdge[] {
    const edgeList: ISvelteFlowEdge[] = [];
    
    Object.entries(connections).forEach(([sourceId, nodeConnections]) => {
      nodeConnections.main.forEach((outputs, outputIndex) => {
        outputs.forEach((conn, connIndex) => {
          edgeList.push({
            id: `${sourceId}-${conn.node}-${outputIndex}-${connIndex}`,
            source: sourceId,
            target: conn.node,
            sourceHandle: outputIndex > 0 ? `output-${outputIndex}` : undefined,
            targetHandle: conn.index > 0 ? `input-${conn.index}` : undefined,
            animated: true,
          });
        });
      });
    });

    return edgeList;
  }

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/workflows");
    }
  }

  function handleNodesChange(updatedNodes: ISvelteFlowNode[]) {
    nodes = updatedNodes;
  }

  function handleEdgesChange(updatedEdges: ISvelteFlowEdge[]) {
    edges = updatedEdges;
  }

  function handleNodeSelect(node: ISvelteFlowNode | null) {
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
    if (!workflowName.trim() || !workflowId) return;
    
    isSaving = true;
    try {
      const { nodes: n8nNodes, connections } = convertToN8nFormat();
      
      await updateWorkflow(workflowId, {
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        nodes: n8nNodes,
        connections,
      });
    } finally {
      isSaving = false;
    }
  }

  async function handleValidate() {
    if (!workflowId) return;
    isValidating = true;
    try {
      validationResult = await validateWorkflow(workflowId);
    } finally {
      isValidating = false;
    }
  }

  async function handleExecute() {
    if (!workflowId) return;
    isExecuting = true;
    try {
      const execution = await executeWorkflow(workflowId);
      if (execution) {
        console.log("Workflow execution started:", execution.id);
      }
    } finally {
      isExecuting = false;
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
        {#if workflows.isLoading && !isLoaded}
          <div class="h-8 w-64 bg-muted/50 rounded animate-pulse"></div>
        {:else}
          <Input
            bind:value={workflowName}
            placeholder="Workflow name..."
            class="h-8 w-64 font-semibold bg-transparent border-transparent hover:border-border focus:border-[var(--cyber-cyan)]"
          />
        {/if}
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
        variant="outline"
        size="sm"
        onclick={handleValidate}
        disabled={isValidating || !isLoaded}
        class="h-8 font-mono text-xs uppercase tracking-wider"
      >
        {#if isValidating}
          <LoaderIcon class="h-4 w-4 mr-2 animate-spin" />
        {:else}
          <CheckCircleIcon class="h-4 w-4 mr-2" />
        {/if}
        Validate
      </Button>

      <Button
        variant="outline"
        size="sm"
        onclick={handleExecute}
        disabled={isExecuting || !isLoaded}
        class="h-8 font-mono text-xs uppercase tracking-wider text-[var(--cyber-emerald)] border-[var(--cyber-emerald)]/30 hover:bg-[var(--cyber-emerald)]/10"
      >
        {#if isExecuting}
          <LoaderIcon class="h-4 w-4 mr-2 animate-spin" />
        {:else}
          <PlayIcon class="h-4 w-4 mr-2" />
        {/if}
        Execute
      </Button>

      <Button
        onclick={handleSave}
        disabled={isSaving || !workflowName.trim() || !isLoaded}
        class="cyber-btn-primary px-4 h-8 font-mono text-xs uppercase tracking-wider"
      >
        <SaveIcon class="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  </header>

  {#if validationResult && !validationResult.valid}
    <div class="px-4 py-2 bg-[var(--cyber-red)]/10 border-b border-[var(--cyber-red)]/30">
      <div class="flex items-center gap-2 text-sm text-[var(--cyber-red)]">
        <span class="font-mono text-xs uppercase">[validation errors]</span>
        {#each validationResult.errors as error}
          <span class="text-xs">{error.message}</span>
        {/each}
      </div>
    </div>
  {/if}

  <SvelteFlowProvider>
    <div class="flex-1 flex overflow-hidden">
      {#if showPalette}
        <NodePalette />
      {/if}

      <div class="flex-1 relative" role="application">
        {#if workflows.isLoading && !isLoaded}
          <div class="absolute inset-0 flex items-center justify-center bg-background/50">
            <div class="flex items-center gap-3 text-muted-foreground">
              <LoaderIcon class="h-6 w-6 animate-spin" />
              <span class="font-mono text-sm">Loading workflow...</span>
            </div>
          </div>
        {:else}
          <WorkflowEditor
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeSelect={handleNodeSelect}
            nodeTypes={nodeTypes}
            bind:deleteNodeId
          />
        {/if}
      </div>

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
