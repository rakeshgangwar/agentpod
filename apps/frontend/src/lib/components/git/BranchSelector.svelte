<script lang="ts">
  /**
   * Branch Selector Component
   * 
   * A dropdown for selecting Git branches using the DropdownMenu UI component.
   * Includes options to create new branches and delete existing ones.
   */

  import { GitBranch, Check, Plus, Trash2, RefreshCw, ChevronDown } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { gitStore, fetchBranches, checkoutBranch, deleteBranch } from "$lib/stores/git.svelte";
  
  interface Props {
    sandboxId: string;
    onCreateBranch?: () => void;
    compact?: boolean;
  }
  
  let { sandboxId, onCreateBranch, compact = false }: Props = $props();
  
  // Local state
  let deleteConfirmBranch = $state<string | null>(null);
  let isOpen = $state(false);
  
  // Derived state from store
  let branches = $derived(gitStore.branches);
  let currentBranch = $derived(gitStore.currentBranch);
  let isLoading = $derived(gitStore.isLoadingBranches);
  let error = $derived(gitStore.branchError);
  
  // Fetch branches on mount
  $effect(() => {
    if (sandboxId) {
      fetchBranches(sandboxId);
    }
  });
  
  async function handleBranchSelect(branchName: string) {
    if (branchName === currentBranch) return;
    await checkoutBranch(branchName, sandboxId);
  }
  
  async function handleDeleteBranch(branchName: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    
    if (deleteConfirmBranch === branchName) {
      // Second click - confirm delete
      await deleteBranch(branchName, sandboxId);
      deleteConfirmBranch = null;
    } else {
      // First click - show confirmation
      deleteConfirmBranch = branchName;
      // Auto-reset after 3 seconds
      setTimeout(() => {
        deleteConfirmBranch = null;
      }, 3000);
    }
  }
  
  async function handleRefresh() {
    await fetchBranches(sandboxId);
  }
  
  function handleCreateBranch() {
    isOpen = false;
    onCreateBranch?.();
  }
</script>

<div class="flex items-center gap-2">
  <DropdownMenu.Root bind:open={isOpen}>
    <DropdownMenu.Trigger
      disabled={isLoading}
      class="inline-flex items-center justify-between gap-2 rounded-md border border-border/50 
             bg-background/50 font-mono transition-colors
             hover:bg-accent/50 hover:border-[var(--cyber-cyan)]/50
             focus:outline-none focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:border-[var(--cyber-cyan)]
             disabled:opacity-50 disabled:pointer-events-none
             {compact ? 'h-7 text-xs px-2 min-w-[100px] max-w-[160px]' : 'h-9 text-sm px-3 min-w-[140px] max-w-[200px]'}"
    >
      <span class="flex items-center gap-2 truncate">
        <GitBranch class="h-3.5 w-3.5 text-[var(--cyber-cyan)] flex-shrink-0" />
        <span class="truncate">{currentBranch || "Select branch"}</span>
      </span>
      {#if isLoading}
        <RefreshCw class="h-3 w-3 animate-spin flex-shrink-0" />
      {:else}
        <ChevronDown class="h-3 w-3 flex-shrink-0 opacity-50" />
      {/if}
    </DropdownMenu.Trigger>
    
    <DropdownMenu.Portal>
      <DropdownMenu.Content 
        class="font-mono border-border/50 bg-background/95 backdrop-blur-sm min-w-[180px] max-w-[280px]"
        align="start"
        sideOffset={4}
      >
        <!-- Branches Group -->
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)] px-2 py-1.5">
            Branches
          </DropdownMenu.GroupHeading>
          
          {#if branches.length === 0}
            <div class="px-3 py-4 text-center text-sm text-muted-foreground">
              No branches found
            </div>
          {:else}
            {#each branches as branch (branch.name)}
              {@const isCurrent = branch.current}
              <DropdownMenu.Item
                class="flex items-center gap-2 cursor-pointer {isCurrent ? 'bg-accent/30' : ''}"
                onSelect={() => handleBranchSelect(branch.name)}
              >
                <!-- Current indicator -->
                <span class="w-4 flex-shrink-0">
                  {#if isCurrent}
                    <Check class="h-4 w-4 text-[var(--cyber-emerald)]" />
                  {/if}
                </span>
                
                <!-- Branch name -->
                <span class="flex-1 truncate text-sm" title={branch.name}>
                  {branch.name}
                </span>
                
                <!-- Delete button (only for non-current branches) -->
                {#if !isCurrent && branches.length > 1}
                  <button
                    type="button"
                    onclick={(e) => handleDeleteBranch(branch.name, e)}
                    class="opacity-0 group-hover:opacity-100 p-1 rounded
                           hover:bg-destructive/20 transition-all ml-auto
                           {deleteConfirmBranch === branch.name ? '!opacity-100 bg-destructive/20' : ''}"
                    title={deleteConfirmBranch === branch.name ? "Click again to confirm" : "Delete branch"}
                  >
                    <Trash2 class="h-3 w-3 {deleteConfirmBranch === branch.name ? 'text-destructive' : 'text-muted-foreground'}" />
                  </button>
                {/if}
              </DropdownMenu.Item>
            {/each}
          {/if}
        </DropdownMenu.Group>
        
        <DropdownMenu.Separator />
        
        <!-- Actions Group -->
        <DropdownMenu.Group>
          {#if onCreateBranch}
            <DropdownMenu.Item
              class="flex items-center gap-2 text-[var(--cyber-cyan)] cursor-pointer"
              onSelect={handleCreateBranch}
            >
              <Plus class="h-4 w-4" />
              <span class="text-sm">Create new branch</span>
            </DropdownMenu.Item>
          {/if}
          
          <DropdownMenu.Item
            class="flex items-center gap-2 text-muted-foreground cursor-pointer"
            disabled={isLoading}
            onSelect={handleRefresh}
          >
            <RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
            <span class="text-sm">Refresh</span>
          </DropdownMenu.Item>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
  
  <!-- Error display -->
  {#if error}
    <span class="text-xs text-destructive font-mono truncate max-w-[150px]" title={error}>
      {error}
    </span>
  {/if}
</div>
