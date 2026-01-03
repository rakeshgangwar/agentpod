<script lang="ts">
  import { GitFork, GitBranch } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { SessionFork } from "$lib/api/tauri";
  
  interface Props {
    fork?: SessionFork;
    childCount?: number;
    depth?: number;
    compact?: boolean;
  }
  
  let { 
    fork, 
    childCount = 0, 
    depth = 0,
    compact = false 
  }: Props = $props();
  
  let hasParent = $derived(!!fork?.parentSessionId);
  let hasChildren = $derived(childCount > 0);
  let isRoot = $derived(!hasParent && hasChildren);
  let isFork = $derived(hasParent);
  
  function getForkTypeLabel(type: string): string {
    switch (type) {
      case "explicit": return "User fork";
      case "auto-edit": return "Edit branch";
      case "auto-regenerate": return "Regeneration";
      default: return "Fork";
    }
  }
</script>

{#if fork || childCount > 0}
  <Tooltip.Root>
    <Tooltip.Trigger>
      <div class="flex items-center gap-1 text-muted-foreground">
        {#if isFork}
          <GitFork class="h-3 w-3" />
          {#if !compact && depth > 0}
            <span class="text-[10px]">L{depth}</span>
          {/if}
        {:else if isRoot}
          <GitBranch class="h-3 w-3" />
        {/if}
        
        {#if hasChildren && !compact}
          <span class="text-[10px]">
            {childCount} {childCount === 1 ? "fork" : "forks"}
          </span>
        {/if}
      </div>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content side="top" class="text-xs">
        {#if isFork}
          <div class="space-y-1">
            <div>{getForkTypeLabel(fork?.forkType ?? "explicit")}</div>
            {#if fork?.metadata?.reason}
              <div class="text-muted-foreground">{fork.metadata.reason}</div>
            {/if}
            {#if depth > 0}
              <div class="text-muted-foreground">Depth: {depth}</div>
            {/if}
          </div>
        {:else if isRoot}
          <div>Root session with {childCount} {childCount === 1 ? "fork" : "forks"}</div>
        {:else}
          <div>{childCount} child {childCount === 1 ? "fork" : "forks"}</div>
        {/if}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
{/if}
