<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    getUser,
    getUserLimits,
    getUserSandboxes,
    updateUserLimits,
    banUser,
    unbanUser,
    updateUserRole,
    forceStopSandbox,
    forceDeleteSandbox,
  } from "$lib/api/admin";
  import type {
    AdminUserView,
    UserResourceLimits,
    UserResourceUsage,
    UserRole,
    UpdateUserResourceLimitsInput,
  } from "@agentpod/types";
  import {
    listResourceTiers,
    type Sandbox,
    type ResourceTier,
  } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import * as Dialog from "$lib/components/ui/dialog";
  import PageHeader from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";

  // Icons
  import UserIcon from "@lucide/svelte/icons/user";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import HomeIcon from "@lucide/svelte/icons/home";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import BanIcon from "@lucide/svelte/icons/ban";
  import CheckIcon from "@lucide/svelte/icons/check";
  import SaveIcon from "@lucide/svelte/icons/save";
  import BoxIcon from "@lucide/svelte/icons/box";
  import SquareIcon from "@lucide/svelte/icons/square";
  import TrashIcon from "@lucide/svelte/icons/trash-2";

  // Get user ID from route params
  let userId = $derived($page.params.id ?? "");

  // State
  let isLoading = $state(true);
  let user = $state<AdminUserView | null>(null);
  let limits = $state<UserResourceLimits | null>(null);
  let usage = $state<UserResourceUsage | null>(null);
  let sandboxes = $state<Sandbox[]>([]);
  let resourceTiers = $state<ResourceTier[]>([]);
  let error = $state<string | null>(null);

  // Edit state
  let editLimits = $state<UpdateUserResourceLimitsInput>({});
  let isSavingLimits = $state(false);

  // Action dialogs
  let showBanDialog = $state(false);
  let showRoleDialog = $state(false);
  let showDeleteSandboxDialog = $state(false);
  let banReason = $state("");
  let newRole = $state<UserRole>("user");
  let sandboxToDelete = $state<Sandbox | null>(null);
  let actionLoading = $state(false);

  // Active tab
  let activeTab = $state("overview");

  // Back navigation
  function goBack() {
    goto("/admin/users");
  }

  // Load user data
  async function loadUser() {
    if (!userId) return;
    
    isLoading = true;
    error = null;

    try {
      const currentUserId = userId;
      const [userResponse, limitsResponse, sandboxesResponse, tiersResponse] = await Promise.all([
        getUser(currentUserId),
        getUserLimits(currentUserId),
        getUserSandboxes(currentUserId),
        listResourceTiers(),
      ]);

      user = userResponse.user;
      usage = userResponse.usage;
      limits = limitsResponse.limits;
      sandboxes = sandboxesResponse;
      resourceTiers = tiersResponse;

      // Initialize edit limits with current values
      editLimits = {
        maxSandboxes: limits.maxSandboxes,
        maxConcurrentRunning: limits.maxConcurrentRunning,
        maxTotalStorageGb: limits.maxTotalStorageGb,
        maxTotalCpuCores: limits.maxTotalCpuCores,
        maxTotalMemoryGb: limits.maxTotalMemoryGb,
        allowedTierIds: [...limits.allowedTierIds],
        maxTierId: limits.maxTierId,
        notes: limits.notes,
      };
    } catch (e) {
      const err = e as Error;
      error = err.message || "Failed to load user";
    } finally {
      isLoading = false;
    }
  }

  // Initial load
  onMount(() => {
    loadUser();
  });

  // Save limits
  async function saveLimits() {
    if (!limits || !userId) return;

    isSavingLimits = true;
    try {
      const currentUserId = userId;
      const updated = await updateUserLimits(currentUserId, editLimits);
      limits = updated;
      toast.success("Resource limits updated");
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to save limits", { description: err.message });
    } finally {
      isSavingLimits = false;
    }
  }

  // Ban user
  async function handleBan() {
    if (!user || !banReason.trim()) return;

    actionLoading = true;
    try {
      await banUser(user.id, banReason.trim());
      toast.success(`${user.email} has been banned`);
      showBanDialog = false;
      banReason = "";
      loadUser();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to ban user", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Unban user
  async function handleUnban() {
    if (!user) return;

    actionLoading = true;
    try {
      await unbanUser(user.id);
      toast.success(`${user.email} has been unbanned`);
      loadUser();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to unban user", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Change role
  async function handleRoleChange() {
    if (!user || newRole === user.role) return;

    actionLoading = true;
    try {
      await updateUserRole(user.id, newRole);
      toast.success(`${user.email} is now ${newRole}`);
      showRoleDialog = false;
      loadUser();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update role", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Force stop sandbox
  async function handleForceStop(sandbox: Sandbox) {
    actionLoading = true;
    try {
      await forceStopSandbox(sandbox.id);
      toast.success(`Sandbox "${sandbox.name}" has been stopped`);
      loadUser();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to stop sandbox", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Force delete sandbox
  function openDeleteSandboxDialog(sandbox: Sandbox) {
    sandboxToDelete = sandbox;
    showDeleteSandboxDialog = true;
  }

  async function handleForceDelete() {
    if (!sandboxToDelete) return;

    actionLoading = true;
    try {
      await forceDeleteSandbox(sandboxToDelete.id);
      toast.success(`Sandbox "${sandboxToDelete.name}" has been deleted`);
      showDeleteSandboxDialog = false;
      sandboxToDelete = null;
      loadUser();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to delete sandbox", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Format date
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Check if limits have changed
  function areArraysEqual(arr1: string[] | undefined, arr2: string[] | undefined): boolean {
    const a = arr1 || [];
    const b = arr2 || [];
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }

  let limitsChanged = $derived(
    limits &&
    (editLimits.maxSandboxes !== limits.maxSandboxes ||
      editLimits.maxConcurrentRunning !== limits.maxConcurrentRunning ||
      editLimits.maxTotalStorageGb !== limits.maxTotalStorageGb ||
      editLimits.maxTotalCpuCores !== limits.maxTotalCpuCores ||
      editLimits.maxTotalMemoryGb !== limits.maxTotalMemoryGb ||
      !areArraysEqual(editLimits.allowedTierIds, limits.allowedTierIds) ||
      editLimits.maxTierId !== limits.maxTierId ||
      editLimits.notes !== limits.notes)
  );
</script>

<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <!-- Header -->
  <PageHeader
    title={user?.name || user?.email || "User Details"}
    icon={UserIcon}
    subtitle={user?.email || "Loading..."}
    sticky={false}
    collapsible={true}
  >
    {#snippet leading()}
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onclick={() => goto("/")}
          class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
          title="Home"
        >
          <HomeIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onclick={goBack}
          class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
          title="Back to Users"
        >
          <ArrowLeftIcon class="h-4 w-4" />
        </Button>
      </div>
    {/snippet}
    {#snippet actions()}
      <ThemeToggle />
    {/snippet}
  </PageHeader>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-4xl space-y-6 animate-fade-in">
      {#if isLoading}
        <div class="flex items-center justify-center py-12">
          <div class="relative w-8 h-8">
            <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
            <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
          </div>
          <span class="ml-3 text-muted-foreground font-mono text-sm">Loading user...</span>
        </div>
      {:else if error}
        <div class="cyber-card corner-accent p-6 text-center">
          <p class="text-[var(--cyber-red)] font-mono text-sm">{error}</p>
          <Button
            variant="outline"
            onclick={loadUser}
            class="mt-4 font-mono text-xs uppercase tracking-wider"
          >
            Retry
          </Button>
        </div>
      {:else if user}
        <!-- User Header Card -->
        <div class="cyber-card corner-accent p-6">
          <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <!-- User Info -->
            <div class="flex items-center gap-4">
              {#if user.image}
                <img src={user.image} alt={user.name} class="w-16 h-16 rounded-full" />
              {:else}
                <div class="w-16 h-16 rounded-full bg-[var(--cyber-cyan)]/20 flex items-center justify-center text-[var(--cyber-cyan)] font-mono text-xl">
                  {user.name?.[0] || user.email[0]}
                </div>
              {/if}
              <div>
                <h2 class="font-mono text-lg">{user.name || "—"}</h2>
                <p class="font-mono text-sm text-muted-foreground">{user.email}</p>
                  <div class="flex items-center gap-2 mt-2">
                    <span
                      class="px-2 py-0.5 rounded font-mono text-xs uppercase tracking-wider
                             {user.role === 'admin'
                               ? 'bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30'
                               : 'bg-muted/20 text-muted-foreground border border-border/30'}"
                    >
                      {user.role}
                    </span>
                    {#if user.banned}
                      <span class="status-indicator status-error">
                        <span class="status-dot"></span>
                        Banned
                      </span>
                    {:else}
                      <span class="status-indicator status-running">
                        <span class="status-dot"></span>
                        Active
                      </span>
                    {/if}
                  </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onclick={() => {
                  newRole = user?.role || "user";
                  showRoleDialog = true;
                }}
                class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)]"
              >
                <ShieldIcon class="h-4 w-4 mr-2" />
                Change Role
              </Button>
              {#if user.banned}
                <Button
                  variant="outline"
                  onclick={handleUnban}
                  disabled={actionLoading}
                  class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-emerald)]/50 text-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/10"
                >
                  <CheckIcon class="h-4 w-4 mr-2" />
                  Unban
                </Button>
              {:else}
                <Button
                  variant="outline"
                  onclick={() => showBanDialog = true}
                  class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-red)]/50 text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                >
                  <BanIcon class="h-4 w-4 mr-2" />
                  Ban User
                </Button>
              {/if}
            </div>
          </div>

          {#if user.banned && user.bannedReason}
            <div class="mt-4 p-3 border border-[var(--cyber-red)]/30 rounded bg-[var(--cyber-red)]/10">
              <p class="font-mono text-xs text-[var(--cyber-red)] uppercase tracking-wider mb-1">Ban Reason</p>
              <p class="font-mono text-sm">{user.bannedReason}</p>
              {#if user.bannedAt}
                <p class="font-mono text-xs text-muted-foreground mt-1">Banned on {formatDate(user.bannedAt)}</p>
              {/if}
            </div>
          {/if}

          <!-- Meta Info -->
          <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">User ID</p>
              <p class="text-xs break-all">{user.id}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">Joined</p>
              <p>{formatDate(user.createdAt)}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">Email Verified</p>
              <p>{user.emailVerified ? "Yes" : "No"}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">Sandboxes</p>
              <p>{user.sandboxCount} ({user.runningSandboxCount} running)</p>
            </div>
          </div>
        </div>

        <!-- Tabs Card -->
        <div class="cyber-card corner-accent overflow-hidden">
          <!-- Tab Navigation -->
          <div class="border-b border-border/30 bg-background/30 backdrop-blur-sm">
            <div class="flex">
              <button
                onclick={() => activeTab = "overview"}
                class="flex-1 py-3 px-4 font-mono text-xs uppercase tracking-wider transition-all border-b-2
                       {activeTab === 'overview' 
                         ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                         : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
              >
                Resource Limits
              </button>
              <button
                onclick={() => activeTab = "sandboxes"}
                class="flex-1 py-3 px-4 font-mono text-xs uppercase tracking-wider transition-all border-b-2
                       {activeTab === 'sandboxes' 
                         ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                         : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
              >
                Sandboxes
                {#if sandboxes.length > 0}
                  <span class="ml-1.5 text-xs bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)] px-1.5 py-0.5 rounded-full">
                    {sandboxes.length}
                  </span>
                {/if}
              </button>
            </div>
          </div>

          <!-- Tab Content -->
          <div class="p-6">
            {#if activeTab === "overview"}
              <!-- Resource Limits Tab Content -->
              {#if limits && usage}
                <div class="space-y-6">
                  <!-- Current Usage -->
                  <div>
                    <h3 class="font-mono text-sm text-[var(--cyber-cyan)] uppercase tracking-wider mb-4">[current_usage]</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div class="p-3 border border-border/30 rounded bg-background/50 text-center">
                        <p class="text-xl font-bold font-mono">{usage.sandboxCount} / {limits.maxSandboxes}</p>
                        <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Sandboxes</p>
                      </div>
                      <div class="p-3 border border-border/30 rounded bg-background/50 text-center">
                        <p class="text-xl font-bold font-mono">{usage.runningSandboxCount} / {limits.maxConcurrentRunning}</p>
                        <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Running</p>
                      </div>
                      <div class="p-3 border border-border/30 rounded bg-background/50 text-center">
                        <p class="text-xl font-bold font-mono">{usage.totalCpuCores} / {limits.maxTotalCpuCores}</p>
                        <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">CPU Cores</p>
                      </div>
                      <div class="p-3 border border-border/30 rounded bg-background/50 text-center">
                        <p class="text-xl font-bold font-mono">{usage.totalMemoryGb} / {limits.maxTotalMemoryGb}</p>
                        <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Memory (GB)</p>
                      </div>
                    </div>
                  </div>

                  <!-- Edit Limits -->
                  <div>
                    <h3 class="font-mono text-sm text-[var(--cyber-cyan)] uppercase tracking-wider mb-4">[edit_limits]</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Sandboxes</Label>
                        <Input
                          type="number"
                          min="0"
                          bind:value={editLimits.maxSandboxes}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Concurrent Running</Label>
                        <Input
                          type="number"
                          min="0"
                          bind:value={editLimits.maxConcurrentRunning}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Total CPU Cores</Label>
                        <Input
                          type="number"
                          min="0"
                          bind:value={editLimits.maxTotalCpuCores}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Total Memory (GB)</Label>
                        <Input
                          type="number"
                          min="0"
                          bind:value={editLimits.maxTotalMemoryGb}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Total Storage (GB)</Label>
                        <Input
                          type="number"
                          min="0"
                          bind:value={editLimits.maxTotalStorageGb}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Max Tier ID</Label>
                        <Input
                          type="text"
                          bind:value={editLimits.maxTierId}
                          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
                        />
                      </div>
                      <div class="md:col-span-2">
                        <h3 class="font-mono text-xs text-[var(--cyber-cyan)] uppercase tracking-wider mb-2">[allowed_tiers]</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {#each resourceTiers as tier (tier.id)}
                            <label class="flex items-center gap-3 p-3 border border-border/30 rounded bg-background/50 hover:border-[var(--cyber-cyan)]/50 transition-colors cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={editLimits.allowedTierIds?.includes(tier.id)}
                                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                                  const checked = e.currentTarget.checked;
                                  if (checked) {
                                    editLimits.allowedTierIds = [...(editLimits.allowedTierIds || []), tier.id];
                                  } else {
                                    editLimits.allowedTierIds = (editLimits.allowedTierIds || []).filter(id => id !== tier.id);
                                  }
                                }}
                                class="w-4 h-4 rounded border-border/50 text-[var(--cyber-cyan)] focus:ring-[var(--cyber-cyan)] bg-background/50"
                              />
                              <div class="flex-1">
                                <span class="font-mono text-sm block">{tier.name}</span>
                                <p class="text-xs text-muted-foreground font-mono">
                                  {tier.resources.cpuCores} CPU, {tier.resources.memoryGb}GB RAM
                                </p>
                              </div>
                            </label>
                          {/each}
                        </div>
                      </div>
                      <div class="md:col-span-2 space-y-2">
                        <Label class="font-mono text-xs uppercase tracking-wider">Admin Notes</Label>
                        <textarea
                          bind:value={editLimits.notes}
                          placeholder="Internal notes about this user's limits..."
                          class="w-full h-20 p-3 text-sm font-mono border border-border/50 rounded bg-background/50 resize-none
                                 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <!-- Save Button -->
                  <div class="flex justify-end">
                    <Button
                      onclick={saveLimits}
                      disabled={isSavingLimits || !limitsChanged}
                      class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
                    >
                      {#if isSavingLimits}
                        <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                      {:else}
                        <SaveIcon class="h-4 w-4 mr-2" />
                      {/if}
                      {isSavingLimits ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              {/if}
            {:else if activeTab === "sandboxes"}
              <!-- Sandboxes Tab Content -->
              {#if sandboxes.length === 0}
                <div class="py-12 text-center">
                  <BoxIcon class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p class="text-muted-foreground font-mono">No sandboxes</p>
                </div>
              {:else}
                <div class="divide-y divide-border/20 -mx-6 -mb-6">
                  {#each sandboxes as sandbox}
                    <div class="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded bg-[var(--cyber-cyan)]/10 flex items-center justify-center">
                          <BoxIcon class="h-5 w-5 text-[var(--cyber-cyan)]" />
                        </div>
                        <div>
                          <p class="font-mono text-sm">{sandbox.name}</p>
                          <div class="flex items-center gap-2 mt-1">
                            <span class="status-indicator {sandbox.status === 'running' ? 'status-running' : 'status-stopped'}">
                              <span class="status-dot"></span>
                              {sandbox.status}
                            </span>
                            <span class="text-xs text-muted-foreground font-mono">{sandbox.flavorId}</span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        {#if sandbox.status === "running"}
                          <Button
                            variant="outline"
                            size="sm"
                            onclick={() => handleForceStop(sandbox)}
                            disabled={actionLoading}
                            class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-amber)]/50 text-[var(--cyber-amber)] hover:bg-[var(--cyber-amber)]/10"
                          >
                            <SquareIcon class="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        {/if}
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={() => openDeleteSandboxDialog(sandbox)}
                          disabled={actionLoading}
                          class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-red)]/50 text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                        >
                          <TrashIcon class="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>

<!-- Ban Dialog -->
<Dialog.Root bind:open={showBanDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-red)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-red)]">[ban_user]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Ban {user?.email}? They will be logged out and unable to access the platform.
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-red)]">
        Reason (required)
      </Label>
      <textarea
        bind:value={banReason}
        placeholder="Enter the reason for banning this user..."
        class="w-full h-24 p-3 text-sm font-mono border border-[var(--cyber-red)]/30 rounded bg-background/50 resize-none mt-2
               focus:border-[var(--cyber-red)] focus:ring-1 focus:ring-[var(--cyber-red)] focus:outline-none"
      ></textarea>
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => showBanDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleBan}
        disabled={actionLoading || !banReason.trim()}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/90 text-[var(--cyber-red-foreground)] disabled:opacity-50"
      >
        {#if actionLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {actionLoading ? "Banning..." : "Ban User"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Role Dialog -->
<Dialog.Root bind:open={showRoleDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-cyan)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-cyan)]">[change_role]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Change role for {user?.email}
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        New Role
      </Label>
      <Select.Root
        type="single"
        value={newRole}
        onValueChange={(v) => {
          if (v) newRole = v as UserRole;
        }}
      >
        <Select.Trigger class="w-full font-mono text-sm bg-background/50 border-border/50 mt-2">
          {newRole === "admin" ? "Admin" : "User"}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="user" label="User" />
          <Select.Item value="admin" label="Admin" />
        </Select.Content>
      </Select.Root>
      {#if newRole === "admin"}
        <p class="mt-2 text-xs text-[var(--cyber-amber)] font-mono">
          Warning: Admins have full access to manage all users and system settings.
        </p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => showRoleDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleRoleChange}
        disabled={actionLoading || newRole === user?.role}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
      >
        {#if actionLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {actionLoading ? "Updating..." : "Update Role"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete Sandbox Dialog -->
<Dialog.Root bind:open={showDeleteSandboxDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-red)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-red)]">[delete_sandbox]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Are you sure you want to delete "{sandboxToDelete?.name}"?
        This will permanently remove the container and all data.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => showDeleteSandboxDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleForceDelete}
        disabled={actionLoading}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/90 text-[var(--cyber-red-foreground)] disabled:opacity-50"
      >
        {#if actionLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {actionLoading ? "Deleting..." : "Delete Sandbox"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
