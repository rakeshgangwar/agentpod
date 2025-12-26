<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import GitForkIcon from "@lucide/svelte/icons/git-fork";
  import ExecutionStatusBadge from "./ExecutionStatusBadge.svelte";

  type ExecutionStatus = "idle" | "running" | "success" | "error";
  type Props = NodeProps;

  let { data, selected = false }: Props = $props();

  const branches = $derived(Math.max(2, Math.min(10, (data.branches as number) || 2)));

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

  const branchColors = [
    "cyber-emerald",
    "cyber-cyan", 
    "cyber-amber",
    "cyber-purple",
    "cyber-red",
    "cyber-magenta",
    "cyber-orange",
    "cyber-indigo",
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

  const branchArray = $derived(Array.from({ length: branches }, (_, i) => i + 1));
</script>

<div
  class="relative bg-card/90 backdrop-blur-sm rounded-md border-2 transition-all duration-200 min-w-[220px] {borderClass} {shadowClass}"
  class:border-cyber-amber={selected && executionStatus === "idle"}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-amber)_30%,transparent)]={selected && executionStatus === "idle"}
>
  <div class="absolute -top-[1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-amber to-transparent opacity-60"></div>
  
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0 w-10 h-10 rounded-sm bg-gradient-to-br from-cyber-amber/20 to-cyber-amber/5 flex items-center justify-center border border-cyber-amber/30">
        <GitForkIcon class="w-5 h-5 text-cyber-amber drop-shadow-[0_0_8px_var(--cyber-amber)]" />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-foreground truncate">
          {data.label || "Split"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          Fan-out
        </div>
      </div>
    </div>

    {#if executionStatus === "idle"}
      <div class="flex flex-wrap items-center gap-2 pt-1">
        {#each branchArray as branchNum, i}
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 border border-border/50">
            <div 
              class="w-1.5 h-1.5 rounded-full"
              style="background-color: var(--{getBranchColor(i)}); box-shadow: 0 0 6px var(--{getBranchColor(i)});"
            ></div>
            <div 
              class="text-[10px] font-mono uppercase tracking-wide"
              style="color: var(--{getBranchColor(i)});"
            >
              Branch {branchNum}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <ExecutionStatusBadge status={executionStatus} error={executionError} />
    {/if}
  </div>

  <Handle type="target" position={Position.Top} />
  
  {#each branchArray as branchNum, i}
    <Handle 
      id="branch-{branchNum}" 
      type="source" 
      position={Position.Bottom} 
      style="left: {getHandlePosition(i, branches)}% !important"
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
