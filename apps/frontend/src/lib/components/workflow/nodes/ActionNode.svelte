<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import SendIcon from "@lucide/svelte/icons/send";
  import ExecutionStatusBadge from "./ExecutionStatusBadge.svelte";

  type ExecutionStatus = "idle" | "running" | "success" | "error";
  type Props = NodeProps;

  let { data, selected = false }: Props = $props();

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
  class="relative bg-card/90 backdrop-blur-sm rounded-md border-2 transition-all duration-200 min-w-[200px] {borderClass} {shadowClass}"
  class:border-cyber-cyan={selected && executionStatus === "idle"}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-cyan)_30%,transparent)]={selected && executionStatus === "idle"}
>
  <div class="absolute -top-[1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-60"></div>
  
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0 w-10 h-10 rounded-sm bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/5 flex items-center justify-center border border-muted-foreground/30">
        <SendIcon class="w-5 h-5 text-muted-foreground" />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-foreground truncate">
          {data.label || "Action"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {data.actionType || "HTTP"}
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
