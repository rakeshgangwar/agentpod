<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import BotIcon from "@lucide/svelte/icons/bot";
  import ExecutionStatusBadge from "./ExecutionStatusBadge.svelte";
  import { NODE_REGISTRY } from "../node-registry";
  import type { WorkflowNodeType } from "@agentpod/types";

  type ExecutionStatus = "idle" | "running" | "success" | "error";
  type Props = NodeProps;

  let { data, selected = false }: Props = $props();

  const nodeType = $derived(data.nodeType as WorkflowNodeType | undefined);
  const nodeEntry = $derived(nodeType ? NODE_REGISTRY[nodeType] : undefined);
  const NodeIcon = $derived(nodeEntry?.icon || BotIcon);
  const nodeColor = $derived(nodeEntry?.color || "var(--cyber-emerald)");

  const executionStatus = $derived((data.executionStatus as ExecutionStatus) || "idle");
  const executionError = $derived(data.executionError as string | undefined);

  const borderClass = $derived({
    idle: "border-border",
    running: "border-[var(--cyber-cyan)] node-running",
    success: "border-[var(--cyber-emerald)]",
    error: "border-[var(--cyber-red)]",
  }[executionStatus]);

  const shadowClass = $derived({
    idle: "",
    running: "shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-cyan)_30%,transparent)]",
    success: "shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-emerald)_20%,transparent)]",
    error: "shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-red)_30%,transparent)]",
  }[executionStatus]);
</script>

<div
  class="relative bg-card/90 backdrop-blur-sm rounded-md border-2 transition-all duration-200 min-w-[220px] {borderClass} {shadowClass}"
  class:border-cyber-emerald={selected && executionStatus === "idle"}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-emerald)_30%,transparent)]={selected && executionStatus === "idle"}
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
          {data.label || "AI Agent"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {data.model || "Claude"}
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
