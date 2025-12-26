<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { connection } from "$lib/stores/connection.svelte";
  import { workflows, fetchWorkflow, updateWorkflow, executeWorkflow, validateWorkflow, fetchExecution } from "$lib/stores/workflows.svelte";
  import { WorkflowEditor } from "$lib/components/workflow";
  import NodePalette from "$lib/components/workflow/NodePalette.svelte";
  import PropertiesPanel from "$lib/components/workflow/PropertiesPanel.svelte";
  import { TriggerNode, AIAgentNode, ActionNode, ConditionNode, SwitchNode } from "$lib/components/workflow/nodes";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import type { ISvelteFlowNode, ISvelteFlowEdge, INode, IConnections, IWorkflowValidationResult, WorkflowNodeType, IWorkflowExecution } from "@agentpod/types";
  import { SvelteFlowProvider, type NodeTypes } from "@xyflow/svelte";

  import WorkflowImportModal from "$lib/components/workflow/WorkflowImportModal.svelte";
  import { convertToExportFormat, downloadWorkflowJson } from "$lib/components/workflow/workflow-import-export";

  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PlayIcon from "@lucide/svelte/icons/play";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";
  import CheckIcon from "@lucide/svelte/icons/check";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import DownloadIcon from "@lucide/svelte/icons/download";

  type ExecutionStatus = "idle" | "running" | "success" | "error";

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
  let executionResult = $state<IWorkflowExecution | null>(null);
  let executionBannerVisible = $state(false);
  let showImportModal = $state(false);

  const nodeTypes: NodeTypes = {
    trigger: TriggerNode,
    "ai-agent": AIAgentNode,
    action: ActionNode,
    condition: ConditionNode,
    switch: SwitchNode,
  };

  async function loadWorkflow() {
    if (!workflowId) return;
    const workflow = await fetchWorkflow(workflowId);
    if (workflow) {
      workflowName = workflow.name;
      workflowDescription = workflow.description || "";
      nodes = convertFromWorkflowFormat(workflow.nodes, workflow.connections);
      edges = convertEdgesFromWorkflow(workflow.nodes, workflow.connections);
      isLoaded = true;
    }
  }

  function convertFromWorkflowFormat(workflowNodes: INode[], connections: IConnections): ISvelteFlowNode[] {
    return workflowNodes.map(node => {
      const nodeType = node.type.includes("trigger") ? "trigger"
        : node.type.includes("ai") ? "ai-agent"
        : node.type === "switch" ? "switch"
        : node.type === "condition" ? "condition"
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

  function convertEdgesFromWorkflow(workflowNodes: INode[], connections: IConnections): ISvelteFlowEdge[] {
    const edgeList: ISvelteFlowEdge[] = [];
    const nodeIds = new Set(workflowNodes.map(n => n.id));
    
    Object.entries(connections).forEach(([sourceId, nodeConnections]) => {
      if (!nodeIds.has(sourceId)) return;
      
      nodeConnections.main.forEach((outputs, outputIndex) => {
        outputs.forEach((conn, connIndex) => {
          if (!nodeIds.has(conn.node)) return;
          
          edgeList.push({
            id: `${sourceId}-${conn.node}-${outputIndex}-${connIndex}`,
            source: sourceId,
            target: conn.node,
            sourceHandle: conn.type && conn.type !== 'main' ? conn.type : undefined,
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

    return { nodes: workflowNodes, connections };
  }

  async function handleSave() {
    if (!workflowName.trim() || !workflowId) return;
    
    isSaving = true;
    try {
      const { nodes: workflowNodes, connections } = convertToWorkflowFormat();
      
      await updateWorkflow(workflowId, {
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        nodes: workflowNodes,
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

  function updateNodeExecutionStatus(nodeId: string, status: ExecutionStatus, error?: string) {
    nodes = nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            executionStatus: status,
            executionError: error,
          },
        };
      }
      return n;
    });
  }

  function setAllNodesStatus(status: ExecutionStatus) {
    nodes = nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        executionStatus: status,
        executionError: undefined,
      },
    }));
  }

  function applyExecutionResult(result: IWorkflowExecution) {
    const stepResults = result.result as Record<string, { success: boolean; error?: string }> | undefined;
    
    console.log("[Execution] Applying results:", { 
      stepResults, 
      nodeIds: nodes.map(n => n.id),
      resultKeys: stepResults ? Object.keys(stepResults) : []
    });
    
    if (stepResults) {
      Object.entries(stepResults).forEach(([nodeId, stepResult]) => {
        const status: ExecutionStatus = stepResult.success ? "success" : "error";
        console.log("[Execution] Updating node:", { nodeId, status, error: stepResult.error });
        updateNodeExecutionStatus(nodeId, status, stepResult.error);
      });
    }
    
    executionResult = result;
    executionBannerVisible = true;
    
    setTimeout(() => {
      executionBannerVisible = false;
    }, 10000);
  }

  async function handleExecute() {
    if (!workflowId) return;
    isExecuting = true;
    executionResult = null;
    
    setAllNodesStatus("running");
    
    try {
      const execution = await executeWorkflow(workflowId);
      if (execution) {
        const maxAttempts = 30;
        let attempts = 0;
        
        const poll = async () => {
          attempts++;
          const result = await fetchExecution(execution.id);
          
          if (result) {
            if (result.status === "completed" || result.status === "errored") {
              applyExecutionResult(result);
              isExecuting = false;
              return;
            }
          }
          
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000);
          } else {
            setAllNodesStatus("idle");
            isExecuting = false;
          }
        };
        
        setTimeout(poll, 500);
      } else {
        setAllNodesStatus("idle");
        isExecuting = false;
      }
    } catch {
      setAllNodesStatus("error");
      isExecuting = false;
    }
  }
  
  function clearExecutionStatus() {
    setAllNodesStatus("idle");
    executionResult = null;
    executionBannerVisible = false;
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

  {#if executionBannerVisible && executionResult}
    {@const isSuccess = executionResult.status === "completed" && !executionResult.error}
    <div 
      class="px-4 py-3 border-b flex items-center justify-between transition-all duration-300 {isSuccess ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}"
    >
      <div class="flex items-center gap-3">
        {#if isSuccess}
          <CheckIcon class="h-5 w-5 text-emerald-500" />
          <div>
            <span class="font-mono text-xs uppercase text-emerald-500">[execution complete]</span>
            <span class="text-sm text-muted-foreground ml-2">
              Completed in {executionResult.durationMs || 0}ms
            </span>
          </div>
        {:else}
          <XCircleIcon class="h-5 w-5 text-red-500" />
          <div>
            <span class="font-mono text-xs uppercase text-red-500">[execution failed]</span>
            <span class="text-sm text-red-400 ml-2">
              {executionResult.error || "Unknown error"}
            </span>
          </div>
        {/if}
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onclick={clearExecutionStatus}
        class="h-7 text-xs font-mono uppercase"
      >
        Clear
      </Button>
    </div>
  {/if}

  <SvelteFlowProvider>
    <div class="flex-1 flex overflow-hidden">
      <NodePalette collapsed={!showPalette} />

      <div class="flex-1 relative" role="application">
        {#if !isLoaded}
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
