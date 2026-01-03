<script lang="ts">
  import { Tag, X, Plus } from "@lucide/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import { addTag, removeTag } from "$lib/stores/session-forks.svelte";
  
  interface Props {
    sandboxId: string;
    sessionId: string;
    tags: string[];
    readonly?: boolean;
    compact?: boolean;
    maxVisible?: number;
  }
  
  let { 
    sandboxId, 
    sessionId, 
    tags, 
    readonly = false,
    compact = false,
    maxVisible = 3
  }: Props = $props();
  
  let tagInput = $state("");
  let isAdding = $state(false);
  let popoverOpen = $state(false);
  
  let visibleTags = $derived(tags.slice(0, maxVisible));
  let hiddenCount = $derived(Math.max(0, tags.length - maxVisible));
  
  async function handleAddTag() {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    
    isAdding = true;
    try {
      await addTag(sessionId, trimmed, sandboxId);
      tagInput = "";
    } finally {
      isAdding = false;
    }
  }
  
  async function handleRemoveTag(tag: string) {
    await removeTag(sessionId, tag, sandboxId);
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }
</script>

<div class="flex items-center gap-1 flex-wrap">
  {#if tags.length === 0 && !readonly}
    <Popover.Root bind:open={popoverOpen}>
      <Popover.Trigger>
        <Button variant="ghost" size="sm" class="h-6 px-2 text-xs text-muted-foreground">
          <Tag class="h-3 w-3 mr-1" />
          Add tag
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="w-64 p-2" align="start">
          <div class="flex gap-2">
            <Input
              type="text"
              placeholder="Enter tag..."
              bind:value={tagInput}
              onkeydown={handleKeydown}
              disabled={isAdding}
              class="h-8 text-sm"
            />
            <Button
              size="sm"
              onclick={handleAddTag}
              disabled={isAdding || !tagInput.trim()}
              class="h-8"
            >
              <Plus class="h-3 w-3" />
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  {:else}
    {#each visibleTags as tag}
      <Badge 
        variant="secondary" 
        class="gap-1 {compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}"
      >
        {tag}
        {#if !readonly}
          <button
            type="button"
            class="ml-0.5 hover:text-destructive transition-colors"
            onclick={() => handleRemoveTag(tag)}
          >
            <X class="h-3 w-3" />
          </button>
        {/if}
      </Badge>
    {/each}
    
    {#if hiddenCount > 0}
      <Popover.Root>
        <Popover.Trigger>
          <Badge variant="outline" class="text-xs cursor-pointer">
            +{hiddenCount}
          </Badge>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content class="w-48 p-2" align="start">
            <div class="flex flex-wrap gap-1">
              {#each tags.slice(maxVisible) as tag}
                <Badge variant="secondary" class="gap-1 text-xs">
                  {tag}
                  {#if !readonly}
                    <button
                      type="button"
                      class="ml-0.5 hover:text-destructive transition-colors"
                      onclick={() => handleRemoveTag(tag)}
                    >
                      <X class="h-3 w-3" />
                    </button>
                  {/if}
                </Badge>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {/if}
    
    {#if !readonly}
      <Popover.Root bind:open={popoverOpen}>
        <Popover.Trigger>
          <Button variant="ghost" size="sm" class="h-5 w-5 p-0">
            <Plus class="h-3 w-3" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content class="w-64 p-2" align="start">
            <div class="flex gap-2">
              <Input
                type="text"
                placeholder="Enter tag..."
                bind:value={tagInput}
                onkeydown={handleKeydown}
                disabled={isAdding}
                class="h-8 text-sm"
              />
              <Button
                size="sm"
                onclick={handleAddTag}
                disabled={isAdding || !tagInput.trim()}
                class="h-8"
              >
                <Plus class="h-3 w-3" />
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {/if}
  {/if}
</div>
