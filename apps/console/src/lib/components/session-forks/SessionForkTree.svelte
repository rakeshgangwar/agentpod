<script lang="ts">
  import { GitFork, ChevronRight, ChevronDown, MessageSquare } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import SessionTagsManager from "./SessionTagsManager.svelte";
  import { 
    sessionForksStore, 
    fetchSessionChildren 
  } from "$lib/stores/session-forks.svelte";
  import type { SessionFork } from "$lib/api/tauri";
  
  interface Props {
    sandboxId: string;
    sessionId: string;
    currentSessionId?: string;
    onSelectSession?: (sessionId: string) => void;
    depth?: number;
  }
  
  let { 
    sandboxId, 
    sessionId, 
    currentSessionId,
    onSelectSession,
    depth = 0 
  }: Props = $props();
  
  let isOpen = $state(depth < 2);
  let isLoading = $state(false);
  let childrenLoaded = $state(false);
  
  let fork = $derived(sessionForksStore.getFork(sessionId));
  let children = $derived(sessionForksStore.getChildren(sessionId));
  let isSelected = $derived(sessionId === currentSessionId);
  
  async function loadChildren() {
    if (childrenLoaded || isLoading) return;
    isLoading = true;
    try {
      await fetchSessionChildren(sessionId, sandboxId);
      childrenLoaded = true;
    } finally {
      isLoading = false;
    }
  }
  
  $effect(() => {
    if (isOpen && !childrenLoaded) {
      loadChildren();
    }
  });
  
  async function handleToggle() {
    if (!isOpen && !childrenLoaded) {
      await loadChildren();
    }
    isOpen = !isOpen;
  }
  
  function handleSelect() {
    onSelectSession?.(sessionId);
  }
  
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
</script>

<div class="relative">
  {#if depth > 0}
    <div 
      class="absolute left-2 top-0 bottom-0 w-px bg-border"
      style="left: {depth * 16 + 8}px"
    />
  {/if}
  
  <div 
    class="flex items-start gap-1 py-1 px-2 rounded-md transition-colors
           {isSelected ? 'bg-primary/15 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/50'}"
    style="padding-left: {depth * 16 + 8}px"
  >
    <Button
      variant="ghost"
      size="sm"
      class="h-6 w-6 p-0 shrink-0"
      onclick={handleToggle}
      disabled={isLoading}
    >
      {#if isLoading}
        <div class="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      {:else if isOpen}
        <ChevronDown class="h-3 w-3" />
      {:else}
        <ChevronRight class="h-3 w-3" />
      {/if}
    </Button>
    
    <button
      type="button"
      class="flex-1 text-left min-w-0"
      onclick={handleSelect}
    >
      <div class="flex items-center gap-2">
        {#if fork?.parentSessionId}
          <GitFork class="h-3 w-3 shrink-0 {isSelected ? 'text-primary' : 'text-muted-foreground'}" />
        {:else}
          <MessageSquare class="h-3 w-3 shrink-0 {isSelected ? 'text-primary' : 'text-muted-foreground'}" />
        {/if}
        
        <span class="text-sm truncate {isSelected ? 'text-primary font-medium' : ''}">
          {fork?.metadata?.originalTitle || `Session ${sessionId.slice(0, 8)}`}
        </span>
        
        {#if fork?.forkType && fork.forkType !== "explicit"}
          <Badge variant="outline" class="text-[10px] px-1 py-0">
            {fork.forkType === "auto-edit" ? "edit" : "regen"}
          </Badge>
        {/if}
      </div>
      
      <div class="flex items-center gap-2 mt-0.5">
        <span class="text-[10px] text-muted-foreground">
          {fork?.createdAt ? formatDate(fork.createdAt) : ""}
        </span>
        
        {#if fork?.tags && fork.tags.length > 0}
          <SessionTagsManager
            {sandboxId}
            {sessionId}
            tags={fork.tags}
            readonly
            compact
            maxVisible={2}
          />
        {/if}
      </div>
    </button>
  </div>
  
  {#if isOpen && children.length > 0}
    <Collapsible.Root open={isOpen}>
      <Collapsible.Content>
        <div class="mt-1">
          {#each children as child}
            <svelte:self
              {sandboxId}
              sessionId={child.id}
              {currentSessionId}
              {onSelectSession}
              depth={depth + 1}
            />
          {/each}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
</div>
