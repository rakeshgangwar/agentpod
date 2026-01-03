<script lang="ts">
  import { GitFork, Tag } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import * as Dialog from "$lib/components/ui/dialog";
  import { createFork, sessionForksStore } from "$lib/stores/session-forks.svelte";
  
  interface Props {
    sandboxId: string;
    sessionId: string;
    sessionTitle?: string;
    messageId?: string;
    messageRole?: 'user' | 'assistant';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onForkCreated?: (forkId: string) => void;
  }
  
  let { 
    sandboxId, 
    sessionId, 
    sessionTitle,
    messageId,
    messageRole,
    open, 
    onOpenChange,
    onForkCreated 
  }: Props = $props();
  
  let reason = $state("");
  let tagInput = $state("");
  let tags = $state<string[]>([]);
  let isCreating = $state(false);
  let error = $state<string | null>(null);
  
  function addTag() {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      tags = [...tags, trimmed];
      tagInput = "";
    }
  }
  
  function removeTag(tag: string) {
    tags = tags.filter(t => t !== tag);
  }
  
  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }
  
  async function handleCreate() {
    isCreating = true;
    error = null;
    
    try {
      const fork = await createFork(
        sessionId,
        {
          messageId,
          messageRole,
          reason: reason.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        },
        sandboxId
      );
      
      if (fork) {
        resetForm();
        onOpenChange(false);
        onForkCreated?.(fork.id);
      } else {
        error = sessionForksStore.error || "Failed to create fork";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create fork";
    } finally {
      isCreating = false;
    }
  }
  
  function resetForm() {
    reason = "";
    tagInput = "";
    tags = [];
    error = null;
  }
  
  function handleClose() {
    resetForm();
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="sm:max-w-[450px]">
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <GitFork class="h-5 w-5 text-[var(--cyber-cyan)]" />
          Fork Session
        </Dialog.Title>
        <Dialog.Description>
          Create a new conversation branch from 
          {#if sessionTitle}
            "{sessionTitle}"
          {:else}
            this session
          {/if}
          {#if messageId}
            at the selected message.
          {:else}
            from the latest message.
          {/if}
        </Dialog.Description>
      </Dialog.Header>
      
      <form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="fork-reason">
            Reason <span class="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="fork-reason"
            type="text"
            placeholder="e.g., Try different approach, Explore alternative"
            bind:value={reason}
            disabled={isCreating}
          />
          <p class="text-xs text-muted-foreground">
            A note to help you remember why you created this fork
          </p>
        </div>
        
        <div class="space-y-2">
          <Label for="fork-tags">
            Tags <span class="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <div class="flex gap-2">
            <Input
              id="fork-tags"
              type="text"
              placeholder="Add a tag..."
              bind:value={tagInput}
              onkeydown={handleTagKeydown}
              disabled={isCreating}
              class="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={addTag}
              disabled={isCreating || !tagInput.trim()}
            >
              <Tag class="h-4 w-4" />
            </Button>
          </div>
          
          {#if tags.length > 0}
            <div class="flex flex-wrap gap-1.5 pt-1">
              {#each tags as tag}
                <Badge variant="secondary" class="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    class="ml-1 hover:text-destructive transition-colors"
                    onclick={() => removeTag(tag)}
                    disabled={isCreating}
                  >
                    ×
                  </button>
                </Badge>
              {/each}
            </div>
          {/if}
        </div>
        
        {#if messageId}
          <div class="px-3 py-2 rounded border border-border bg-muted/30">
            <p class="text-xs text-muted-foreground">
              <span class="font-medium">Fork point:</span> Message {messageId.slice(0, 8)}...
            </p>
          </div>
        {/if}
        
        {#if error}
          <div class="px-3 py-2 rounded border border-destructive/50 bg-destructive/5">
            <p class="text-xs text-destructive font-mono">{error}</p>
          </div>
        {/if}
      </form>
      
      <Dialog.Footer>
        <Button
          type="button"
          variant="ghost"
          onclick={handleClose}
          disabled={isCreating}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          onclick={handleCreate}
          disabled={isCreating}
          class="bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]"
        >
          {#if isCreating}
            Creating...
          {:else}
            <GitFork class="h-4 w-4 mr-2" />
            Create Fork
          {/if}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
