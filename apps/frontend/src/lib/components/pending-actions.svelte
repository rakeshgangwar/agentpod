<script lang="ts">
  /**
   * Pending Actions Component
   * 
   * Shows all pending permission requests across all sandboxes on the home page.
   * Allows users to see which sandboxes need their attention and navigate to them.
   * 
   * Design:
   * - Cyber-themed card matching home page style
   * - Shows permission type icon, title, and sandbox name
   * - Click to navigate to the sandbox chat
   * - Badge with count when multiple pending
   */
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { getAllPendingPermissions, type PendingPermission } from "$lib/api/tauri";
  import { sandboxes } from "$lib/stores/sandboxes.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  
  // Icons
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import FileEditIcon from "@lucide/svelte/icons/file-edit";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  // =============================================================================
  // State
  // =============================================================================
  
  let pendingPermissions = $state<PendingPermission[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  // =============================================================================
  // Lifecycle
  // =============================================================================

  onMount(() => {
    fetchPendingPermissions();
    
    // Refresh every 10 seconds to catch new permissions
    refreshInterval = setInterval(fetchPendingPermissions, 10000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  // =============================================================================
  // Handlers
  // =============================================================================

  async function fetchPendingPermissions() {
    try {
      const permissions = await getAllPendingPermissions();
      pendingPermissions = permissions;
      error = null;
    } catch (err) {
      console.error("[PendingActions] Failed to fetch pending permissions:", err);
      error = err instanceof Error ? err.message : "Failed to fetch pending permissions";
    } finally {
      isLoading = false;
    }
  }

  function handleRefresh() {
    isLoading = true;
    fetchPendingPermissions();
  }

  function handleNavigate(permission: PendingPermission) {
    // Navigate to the sandbox chat, including the session ID
    goto(`/projects/${permission.sandboxId}/chat?session=${permission.sessionID}`);
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  function getSandboxName(sandboxId: string): string {
    const sandbox = sandboxes.list.find(s => s.id === sandboxId);
    return sandbox?.name || "Unknown Project";
  }

  function getPermissionTypeLabel(type: string): string {
    switch (type.toLowerCase()) {
      case "bash":
        return "Run Command";
      case "edit":
        return "Edit File";
      case "write":
        return "Write File";
      case "webfetch":
        return "Fetch URL";
      case "external_directory":
        return "Access Directory";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  function formatRelativeTime(timestamp?: number): string {
    if (!timestamp) return "";
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(timestamp));
  }
</script>

<!-- Only show if there are pending permissions or loading -->
{#if isLoading || error || pendingPermissions.length > 0}
  <div class="space-y-4 animate-fade-in-up stagger-2">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <ShieldAlertIcon class="h-5 w-5 text-[var(--cyber-amber)]" />
        Pending Actions
        {#if pendingPermissions.length > 0}
          <span class="ml-2 px-2 py-0.5 text-xs font-mono rounded bg-[var(--cyber-amber)]/20 text-[var(--cyber-amber)] border border-[var(--cyber-amber)]/30">
            {pendingPermissions.length}
          </span>
        {/if}
      </h2>
      <Button
        variant="ghost"
        size="icon"
        onclick={handleRefresh}
        disabled={isLoading}
        class="h-8 w-8"
        title="Refresh"
      >
        <RefreshCwIcon class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
      </Button>
    </div>

    {#if isLoading && pendingPermissions.length === 0}
      <div class="cyber-card p-4 space-y-3">
        {#each [1, 2] as _}
          <div class="flex items-center gap-3">
            <Skeleton class="h-10 w-10 rounded" />
            <div class="flex-1 space-y-1">
              <Skeleton class="h-3 w-1/3" />
              <Skeleton class="h-2 w-1/2" />
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="cyber-card p-4 border-[var(--cyber-red)]/50">
        <div class="flex items-center gap-3 text-[var(--cyber-red)]">
          <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
          <span class="text-sm">{error}</span>
        </div>
      </div>
    {:else if pendingPermissions.length === 0}
      <!-- Empty state - component is hidden when no pending permissions -->
    {:else}
      <div class="cyber-card divide-y divide-border/30 border-[var(--cyber-amber)]/30">
        {#each pendingPermissions as permission (permission.id)}
          <button
            onclick={() => handleNavigate(permission)}
            class="w-full p-4 flex items-center gap-4 hover:bg-[var(--cyber-amber)]/5 transition-colors text-left group"
          >
            <!-- Icon based on permission type -->
            <div class="flex-shrink-0 rounded border border-[var(--cyber-amber)]/30 bg-[var(--cyber-amber)]/10 p-2 text-[var(--cyber-amber)]">
              {#if permission.type === "bash" || permission.type === "command"}
                <TerminalIcon class="h-5 w-5" />
              {:else if permission.type === "edit" || permission.type === "write" || permission.type === "file"}
                <FileEditIcon class="h-5 w-5" />
              {:else if permission.type === "webfetch" || permission.type === "web" || permission.type === "http"}
                <GlobeIcon class="h-5 w-5" />
              {:else if permission.type === "external_directory" || permission.type === "directory"}
                <FolderOpenIcon class="h-5 w-5" />
              {:else}
                <ShieldAlertIcon class="h-5 w-5" />
              {/if}
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-mono text-xs font-medium uppercase tracking-wider text-[var(--cyber-amber)]">
                  [{getPermissionTypeLabel(permission.type)}]
                </span>
                <span class="font-mono text-xs text-muted-foreground">
                  {formatRelativeTime(permission.time?.created)}
                </span>
              </div>
              <h4 class="font-mono text-sm font-medium text-foreground truncate group-hover:text-[var(--cyber-cyan)] transition-colors">
                {permission.title}
              </h4>
              <p class="text-xs font-mono text-muted-foreground truncate">
                {getSandboxName(permission.sandboxId)}
              </p>
            </div>

            <!-- Arrow -->
            <ChevronRightIcon class="h-5 w-5 text-muted-foreground group-hover:text-[var(--cyber-cyan)] transition-colors" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
