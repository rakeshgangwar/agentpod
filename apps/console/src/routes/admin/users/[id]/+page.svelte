<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    getUser,
    banUser,
    unbanUser,
    updateUserRole,
  } from "$lib/api/admin";
  import type { AdminUserView, UserRole } from "@agentpod/types";
  import { Button } from "$lib/components/ui/button";
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

  // Route param
  let userId = $derived(page.params.id ?? "");

  // State
  let isLoading = $state(true);
  let user = $state<AdminUserView | null>(null);
  let error = $state<string | null>(null);

  // Action dialogs
  let showBanDialog = $state(false);
  let showRoleDialog = $state(false);
  let banReason = $state("");
  let newRole = $state<UserRole>("user");
  let actionLoading = $state(false);

  // Load user data
  async function loadUser() {
    if (!userId) return;

    isLoading = true;
    error = null;

    try {
      const response = await getUser(userId);
      user = response.user;
    } catch (e) {
      const err = e as Error;
      error = err.message || "Failed to load user";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadUser();
  });

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
          class="h-8 w-8 border border-border/30 hover:border-primary hover:text-primary"
          title="Home"
        >
          <HomeIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onclick={() => goto("/admin")}
          class="h-8 w-8 border border-border/30 hover:border-primary hover:text-primary"
          title="Back to Admin"
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
    <div class="container mx-auto px-4 py-6 max-w-3xl space-y-6 animate-fade-in">
      {#if isLoading}
        <div class="flex items-center justify-center py-12">
          <div class="relative w-8 h-8">
            <div class="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--primary)] animate-spin"></div>
          </div>
          <span class="ml-3 text-muted-foreground font-mono text-sm">Loading user...</span>
        </div>
      {:else if error}
        <div class="cyber-card corner-accent p-6 text-center">
          <p class="text-destructive font-mono text-sm">{error}</p>
          <Button
            variant="outline"
            onclick={loadUser}
            class="mt-4 font-mono text-xs uppercase tracking-wider"
          >
            Retry
          </Button>
        </div>
      {:else if user}
        <!-- User Info Card -->
        <div class="cyber-card corner-accent p-6">
          <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <!-- Identity -->
            <div class="flex items-center gap-4">
              {#if user.image}
                <img src={user.image} alt={user.name} class="w-14 h-14 rounded-full" />
              {:else}
                <div class="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary font-mono text-xl">
                  {user.name?.[0] || user.email[0]}
                </div>
              {/if}
              <div>
                <h2 class="font-mono text-base">{user.name || "—"}</h2>
                <p class="font-mono text-sm text-muted-foreground">{user.email}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span
                    class="px-2 py-0.5 rounded font-mono text-xs uppercase tracking-wider
                           {user.role === 'admin'
                             ? 'bg-primary/10 text-primary border border-primary/30'
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
                  newRole = user?.role ?? "user";
                  showRoleDialog = true;
                }}
                data-testid="change-role"
                class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-primary"
              >
                <ShieldIcon class="h-4 w-4 mr-2" />
                Change Role
              </Button>
              {#if user.banned}
                <Button
                  variant="outline"
                  onclick={handleUnban}
                  disabled={actionLoading}
                  class="font-mono text-xs uppercase tracking-wider border-chart-2/50 text-chart-2 hover:bg-chart-2/10"
                >
                  <CheckIcon class="h-4 w-4 mr-2" />
                  Unban
                </Button>
              {:else}
                <Button
                  variant="outline"
                  onclick={() => (showBanDialog = true)}
                  data-testid="ban-user"
                  class="font-mono text-xs uppercase tracking-wider border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <BanIcon class="h-4 w-4 mr-2" />
                  Ban User
                </Button>
              {/if}
            </div>
          </div>

          {#if user.banned && user.bannedReason}
            <div class="mt-4 p-3 border border-destructive/30 rounded bg-destructive/10">
              <p class="font-mono text-xs text-destructive uppercase tracking-wider mb-1">Ban Reason</p>
              <p class="font-mono text-sm">{user.bannedReason}</p>
              {#if user.bannedAt}
                <p class="font-mono text-xs text-muted-foreground mt-1">Banned on {formatDate(user.bannedAt)}</p>
              {/if}
            </div>
          {/if}

          <!-- Meta Info -->
          <div class="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-mono border-t border-border/20 pt-4">
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">User ID</p>
              <p class="text-xs break-all">{user.id}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">Joined</p>
              <p class="text-xs">{formatDate(user.createdAt)}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider">Email Verified</p>
              <p class="text-xs">{user.emailVerified ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>

<!-- Ban Dialog -->
<Dialog.Root bind:open={showBanDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-destructive/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-destructive">[ban_user]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Ban {user?.email}? They will be logged out and unable to access the platform.
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <Label class="font-mono text-xs uppercase tracking-wider text-destructive">
        Reason (required)
      </Label>
      <textarea
        bind:value={banReason}
        placeholder="Enter the reason for banning this user..."
        class="w-full h-24 p-3 text-sm font-mono border border-destructive/30 rounded bg-background/50 resize-none mt-2
               focus:border-destructive focus:ring-1 focus:ring-destructive focus:outline-none"
      ></textarea>
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => (showBanDialog = false)}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleBan}
        disabled={actionLoading || !banReason.trim()}
        class="font-mono text-xs uppercase tracking-wider bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
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
  <Dialog.Content class="sm:max-w-md cyber-card border-primary/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-primary">[change_role]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Change role for {user?.email}
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <Label class="font-mono text-xs uppercase tracking-wider text-primary">
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
        <p class="mt-2 text-xs text-chart-4 font-mono">
          Warning: Admins have full access to manage all users and system settings.
        </p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => (showRoleDialog = false)}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleRoleChange}
        disabled={actionLoading || newRole === user?.role}
        class="font-mono text-xs uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
      >
        {#if actionLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {actionLoading ? "Updating..." : "Update Role"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
