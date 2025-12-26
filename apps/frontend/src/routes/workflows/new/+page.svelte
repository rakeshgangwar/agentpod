<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { createWorkflow } from "$lib/stores/workflows.svelte";
  import { WorkflowEditor } from "$lib/components/workflow";
  import NodePalette from "$lib/components/workflow/NodePalette.svelte";
  import PropertiesPanel from "$lib/components/workflow/PropertiesPanel.svelte";
  import { TriggerNode, AIAgentNode, ActionNode, ConditionNode, SwitchNode } from "$lib/components/workflow/nodes";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import type { ISvelteFlowNode, ISvelteFlowEdge, INode, IConnections, WorkflowNodeType } from "@agentpod/types";
  import { SvelteFlowProvider, type NodeTypes } from "@xyflow/svelte";

  import WorkflowImportModal from "$lib/components/workflow/WorkflowImportModal.svelte";
  import { convertToExportFormat, downloadWorkflowJson } from "$lib/components/workflow/workflow-import-export";

  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import DownloadIcon from "@lucide/svelte/icons/download";

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
      data: { label: "Manual Trigger", nodeType: "manual-trigger" },
    },
  ]);
  let edges = $state<ISvelteFlowEdge[]>([]);
  let selectedNode = $state<ISvelteFlowNode | null>(null);
  let isSaving = $state(false);
  let showPalette = $state(true);
  let showProperties = $state(true);
  let deleteNodeId = $state<string | null>(null);
  let showImportModal = $state(false);

  const nodeTypes: NodeTypes = {
    trigger: TriggerNode,
    "ai-agent": AIAgentNode,
    action: ActionNode,
    condition: ConditionNode,
    switch: SwitchNode,
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

  function convertToWorkflowFormat(): { nodes: INode[]; connections: IConnections } {
    const workflowNodes: INode[] = nodes.map(node => ({
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
    
    // Group edges by source node
    const edgesBySource = new Map<string, typeof edges>();
    edges.forEach(edge => {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);
    });

    // Convert edges to connections format
    edgesBySource.forEach((sourceEdges, sourceId) => {
      const sourceNode = nodes.find(n => n.id === sourceId);
      const isConditionalNode = sourceNode?.data.nodeType === 'switch' || sourceNode?.data.nodeType === 'condition';
      
      if (isConditionalNode) {
        // For switch/condition nodes, group by sourceHandle (branch name)
        const branchesByHandle = new Map<string, typeof edges>();
        sourceEdges.forEach(edge => {
          const handle = edge.sourceHandle || 'main';
          if (!branchesByHandle.has(handle)) {
            branchesByHandle.set(handle, []);
          }
          branchesByHandle.get(handle)!.push(edge);
        });

        // Create output arrays for each branch
        const mainOutputs: Array<Array<{ node: string; type: string; index: number }>> = [];
        branchesByHandle.forEach((branchEdges, handle) => {
          const branchConnections = branchEdges.map(edge => ({
            node: edge.target,
            type: handle,
            index: 0,
          }));
          mainOutputs.push(branchConnections);
        });

        connections[sourceId] = { main: mainOutputs };
      } else {
        // For regular nodes, all connections go to main[0]
        connections[sourceId] = {
          main: [[
            ...sourceEdges.map(edge => ({
              node: edge.target,
              type: edge.sourceHandle || 'main',
              index: 0,
            }))
          ]]
        };
      }
    });

    return { nodes: workflowNodes, connections };
  }

  async function handleSave() {
    if (!workflowName.trim()) return;
    
    isSaving = true;
    try {
      const { nodes: workflowNodes, connections } = convertToWorkflowFormat();
      
      const workflow = await createWorkflow({
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        nodes: workflowNodes,
        connections,
      });

      if (workflow) {
        goto(`/workflows/${workflow.id}`);
      }
    } finally {
      isSaving = false;
    }
  }

  function handleImport(importedNodes: ISvelteFlowNode[], importedEdges: ISvelteFlowEdge[], name?: string, description?: string) {
    nodes = importedNodes;
    edges = importedEdges;
    if (name) workflowName = name;
    if (description) workflowDescription = description;
    selectedNode = null;
    showImportModal = false;
  }

  function handleExport() {
    const workflow = convertToExportFormat(workflowName, workflowDescription, nodes, edges);
    downloadWorkflowJson(workflow);
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

      <div class="w-px h-6 bg-border/30"></div>

      <Button
        variant="ghost"
        size="sm"
        onclick={() => showImportModal = true}
        class="h-8 font-mono text-xs uppercase tracking-wider"
        title="Import workflow from JSON"
      >
        <UploadIcon class="h-4 w-4 mr-1" />
        Import
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onclick={handleExport}
        disabled={nodes.length === 0}
        class="h-8 font-mono text-xs uppercase tracking-wider"
        title="Export workflow to JSON"
      >
        <DownloadIcon class="h-4 w-4 mr-1" />
        Export
      </Button>

      <div class="w-px h-6 bg-border/30"></div>

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
      <NodePalette collapsed={!showPalette} />

      <div class="flex-1 relative" role="application">
        <WorkflowEditor
          initialNodes={nodes}
          initialEdges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeSelect={handleNodeSelect}
          nodeTypes={nodeTypes}
          bind:deleteNodeId
        />
      </div>

      <PropertiesPanel
        {selectedNode}
        onNodeUpdate={handleNodeUpdate}
        onNodeDelete={handleNodeDelete}
        onClose={() => selectedNode = null}
        collapsed={!showProperties}
      />
    </div>
  </SvelteFlowProvider>
</main>

<WorkflowImportModal
  bind:open={showImportModal}
  onImport={handleImport}
  onClose={() => showImportModal = false}
/>
