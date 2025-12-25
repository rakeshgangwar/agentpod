<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";

  type Props = NodeProps;

  let { data, selected = false }: Props = $props();
</script>

<div
  class="relative bg-card/90 backdrop-blur-sm rounded-md border transition-all duration-200 min-w-[200px]"
  class:border-cyber-amber={selected}
  class:shadow-[0_0_0_2px_color-mix(in_oklch,var(--cyber-amber)_30%,transparent)]={selected}
  class:border-border={!selected}
>
  <div class="absolute -top-[1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-amber to-transparent opacity-60"></div>
  
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0 w-10 h-10 rounded-sm bg-gradient-to-br from-cyber-amber/20 to-cyber-amber/5 flex items-center justify-center border border-cyber-amber/30">
        <GitBranchIcon class="w-5 h-5 text-cyber-amber drop-shadow-[0_0_8px_var(--cyber-amber)]" />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-foreground truncate">
          {data.label || "Condition"}
        </div>
        <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          Logic Gate
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 pt-1">
      <div class="flex items-center gap-2">
        <div class="w-1.5 h-1.5 rounded-full bg-cyber-emerald shadow-[0_0_6px_var(--cyber-emerald)]"></div>
        <div class="text-[10px] text-cyber-emerald font-mono uppercase tracking-wide">
          True
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <div class="w-1.5 h-1.5 rounded-full bg-cyber-red shadow-[0_0_6px_var(--cyber-red)]"></div>
        <div class="text-[10px] text-cyber-red font-mono uppercase tracking-wide">
          False
        </div>
      </div>
    </div>
  </div>

  <Handle type="target" position={Position.Top} />
  <Handle id="true" type="source" position={Position.Bottom} style="left: 35%" />
  <Handle id="false" type="source" position={Position.Bottom} style="left: 65%" />
</div>

<style>
  :global(.svelte-flow__handle-top) {
    top: -5px;
  }
  :global(.svelte-flow__handle-bottom) {
    bottom: -5px;
  }
</style>
