<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import RouteIcon from "@lucide/svelte/icons/route";
  import ExecutionStatusBadge from "./ExecutionStatusBadge.svelte";
  import { NODE_REGISTRY } from "../node-registry";
  import type { WorkflowNodeType } from "@agentpod/types";

  type ExecutionStatus = "idle" | "running" | "success" | "error" | "skipped";
  type SwitchCase = { value: string; outputBranch: string };
  type Props = NodeProps;

  let { data, selected = false }: Props = $props();

  const nodeType = $derived(data.nodeType as WorkflowNodeType | undefined);
  const nodeEntry = $derived(nodeType ? NODE_REGISTRY[nodeType] : undefined);
  const NodeIcon = $derived(nodeEntry?.icon || RouteIcon);
  const nodeColor = $derived(nodeEntry?.color || "var(--cyber-purple)");

  const cases = $derived((data.cases as SwitchCase[]) || []);
  const defaultCase = $derived((data.defaultCase as string) || "default");
  const allBranches = $derived([...cases.map(c => c.outputBranch), defaultCase]);

  const executionStatus = $derived((data.executionStatus as ExecutionStatus) || "idle");
  const executionError = $derived(data.executionError as string | undefined);

  const statusColors = {
    idle: { border: "hsl(var(--border) / 0.5)", shadow: "none" },
    running: { border: "#f59e0b", shadow: "0 0 12px rgba(245,158,11,0.4)" },
    success: { border: "#10b981", shadow: "0 0 12px rgba(16,185,129,0.3)" },
    error: { border: "#ef4444", shadow: "0 0 12px rgba(239,68,68,0.4)" },
    skipped: { border: "#94a3b8", shadow: "0 0 8px rgba(148,163,184,0.3)" },
  };

  const statusStyle = $derived(statusColors[executionStatus] || statusColors.idle);
  const isRunning = $derived(executionStatus === "running");

  const branchColors = [
    "cyber-emerald",
    "cyber-cyan", 
    "cyber-amber",
    "cyber-purple",
    "cyber-red",
  ];

  function getBranchColor(index: number): string {
    return branchColors[index % branchColors.length];
  }

  function getHandlePosition(index: number, total: number): number {
    const padding = 15;
    const availableWidth = 100 - (2 * padding);
    if (total === 1) return 50;
    return padding + (index * availableWidth / (total - 1));
  }
</script>

<div
  class="relative bg-card/90 backdrop-blur-sm rounded-md border-2 transition-all duration-200 min-w-[220px]"
  class:node-running={isRunning}
  class:border-cyber-purple={selected && executionStatus === "idle"}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-purple)_30%,transparent)]={selected && executionStatus === "idle"}
  style="border-color: {statusStyle.border}; box-shadow: {statusStyle.shadow};"
>
  <div 
    class="absolute -top-[1px] left-0 right-0 h-[1px] opacity-60"
    style="background-image: linear-gradient(to right, transparent, {nodeColor}, transparent);"
  ></div>
  
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div 
        class="flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center"
        style="background: linear-gradient(to bottom right, color-mix(in oklch, {nodeColor} 20%, transparent), color-mix(in oklch, {nodeColor} 5%, transparent)); border: 1px solid color-mix(in oklch, {nodeColor} 30%, transparent);"
      >
        <span style="color: {nodeColor}; filter: drop-shadow(0 0 8px {nodeColor});">
          <NodeIcon class="w-5 h-5" />
        </span>
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-foreground truncate">
          {data.label || "Switch"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          Router
        </div>
      </div>
    </div>

    {#if executionStatus === "idle"}
      <div class="flex flex-wrap items-center gap-2 pt-1">
        {#each allBranches as branch, i}
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 border border-border/50">
            <div 
              class="w-1.5 h-1.5 rounded-full"
              style="background-color: var(--{getBranchColor(i)}); box-shadow: 0 0 6px var(--{getBranchColor(i)});"
            ></div>
            <div 
              class="text-[10px] font-mono uppercase tracking-wide"
              style="color: var(--{getBranchColor(i)});"
            >
              {branch}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <ExecutionStatusBadge status={executionStatus} error={executionError} />
    {/if}
  </div>

  <Handle type="target" position={Position.Top} />
  
  {#each allBranches as branch, i}
    <Handle 
      id={branch} 
      type="source" 
      position={Position.Bottom} 
      style="left: {getHandlePosition(i, allBranches.length)}% !important"
    />
  {/each}
</div>

<style>
  :global(.svelte-flow__handle-top) {
    top: -5px;
  }
  :global(.svelte-flow__handle-bottom) {
    bottom: -5px;
  }
</style>
