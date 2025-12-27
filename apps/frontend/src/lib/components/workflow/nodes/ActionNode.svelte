<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import SendIcon from "@lucide/svelte/icons/send";
  import ExecutionStatusBadge from "./ExecutionStatusBadge.svelte";
  import { NODE_REGISTRY } from "../node-registry";
  import type { WorkflowNodeType } from "@agentpod/types";

  type ExecutionStatus = "idle" | "running" | "success" | "error" | "skipped";
  type Props = NodeProps;

  let { data, selected = false }: Props = $props();

  const nodeType = $derived(data.nodeType as WorkflowNodeType | undefined);
  const nodeEntry = $derived(nodeType ? NODE_REGISTRY[nodeType] : undefined);
  const NodeIcon = $derived(nodeEntry?.icon || SendIcon);
  const nodeColor = $derived(nodeEntry?.color || "var(--muted-foreground)");

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
</script>

<div
  class="relative bg-card/90 backdrop-blur-sm rounded-md border-2 transition-all duration-200 min-w-[200px]"
  class:node-running={isRunning}
  class:border-cyber-cyan={selected && executionStatus === "idle"}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-cyan)_30%,transparent)]={selected && executionStatus === "idle"}
  style="border-color: {statusStyle.border}; box-shadow: {statusStyle.shadow};"
>
  <div 
    class="absolute -top-[1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent to-transparent opacity-60"
    style="--tw-gradient-via: {nodeColor}; background-image: linear-gradient(to right, transparent, {nodeColor}, transparent);"
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
          {data.label || "Action"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {data.actionType || nodeEntry?.name || "Action"}
        </div>
      </div>
    </div>

    <ExecutionStatusBadge status={executionStatus} error={executionError} />
  </div>

  <Handle type="target" position={Position.Top} />
  <Handle type="source" position={Position.Bottom} />
</div>

<style>
  :global(.svelte-flow__handle-top) {
    top: -5px;
  }
  :global(.svelte-flow__handle-bottom) {
    bottom: -5px;
  }
</style>
