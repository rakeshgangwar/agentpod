<script lang="ts">
  import { GitBranch } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Dialog from "$lib/components/ui/dialog";
  import { gitStore, createBranch } from "$lib/stores/git.svelte";
  
  interface Props {
    sandboxId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }
  
  let { sandboxId, open, onOpenChange }: Props = $props();
  
  // Local state
  let branchName = $state("");
  let fromRef = $state("");
  let isCreating = $state(false);
  let error = $state<string | null>(null);
  
  // Derived state
  let currentBranch = $derived(gitStore.currentBranch);
  let branches = $derived(gitStore.branches);
  
  // Validate branch name
  let isValidName = $derived(() => {
    if (!branchName.trim()) return false;
    // Git branch naming rules (simplified)
    const invalidChars = /[~^:?*\[\]\\@{}\s]/;
    if (invalidChars.test(branchName)) return false;
    if (branchName.startsWith("-") || branchName.endsWith(".") || branchName.endsWith("/")) return false;
    if (branchName.includes("..") || branchName.includes("//")) return false;
    // Check if branch already exists
    if (branches.some(b => b.name === branchName)) return false;
    return true;
  });
  
  async function handleCreate() {
    if (!isValidName) return;
    
    isCreating = true;
    error = null;
    
    try {
      const success = await createBranch(branchName.trim(), fromRef.trim() || undefined, sandboxId);
      if (success) {
        // Reset form and close
        branchName = "";
        fromRef = "";
        onOpenChange(false);
      } else {
        error = gitStore.branchError || "Failed to create branch";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create branch";
    } finally {
      isCreating = false;
    }
  }
  
  function handleClose() {
    branchName = "";
    fromRef = "";
    error = null;
    onOpenChange(false);
  }
  
  // Reset error when name changes
  $effect(() => {
    if (branchName) {
      error = null;
    }
  });
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="sm:max-w-[400px]">
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <GitBranch class="h-5 w-5 text-[var(--cyber-cyan)]" />
          Create New Branch
        </Dialog.Title>
        <Dialog.Description>
          Create a new branch from the current HEAD or a specific ref.
        </Dialog.Description>
      </Dialog.Header>
      
      <form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="space-y-4 py-4">
        <!-- Branch name input -->
        <div class="space-y-2">
          <Label for="branch-name">Branch Name</Label>
          <Input
            id="branch-name"
            type="text"
            placeholder="feature/my-new-feature"
            bind:value={branchName}
            disabled={isCreating}
            class="font-mono"
          />
          {#if branchName && !isValidName}
            <p class="text-xs text-destructive">
              {#if branches.some(b => b.name === branchName)}
                Branch already exists
              {:else}
                Invalid branch name
              {/if}
            </p>
          {/if}
        </div>
        
        <!-- From ref input (optional) -->
        <div class="space-y-2">
          <Label for="from-ref">
            From <span class="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="from-ref"
            type="text"
            placeholder={currentBranch || "HEAD"}
            bind:value={fromRef}
            disabled={isCreating}
            class="font-mono"
          />
          <p class="text-xs text-muted-foreground">
            Leave empty to branch from current HEAD ({currentBranch || "HEAD"})
          </p>
        </div>
        
        <!-- Error message -->
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
          disabled={isCreating || !isValidName}
          class="bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
        >
          {#if isCreating}
            Creating...
          {:else}
            Create Branch
          {/if}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
