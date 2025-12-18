<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { 
    listUsers, 
    getAdminStats, 
    banUser, 
    unbanUser, 
    updateUserRole,
    getSignupStatus,
    enableSignup,
    disableSignup,
    createUser,
    type ListUsersOptions,
    type CreateUserInput,
  } from "$lib/api/admin";
  import type { AdminUserView, AdminStats, UserRole } from "@agentpod/types";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import * as Dialog from "$lib/components/ui/dialog";
  import PageHeader from "$lib/components/page-header.svelte";
  import type { Tab } from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";

  // Icons
  import UsersIcon from "@lucide/svelte/icons/users";
  import HomeIcon from "@lucide/svelte/icons/home";
  import SearchIcon from "@lucide/svelte/icons/search";
  import RefreshIcon from "@lucide/svelte/icons/refresh-cw";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import BanIcon from "@lucide/svelte/icons/ban";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ToggleLeftIcon from "@lucide/svelte/icons/toggle-left";
  import ToggleRightIcon from "@lucide/svelte/icons/toggle-right";

  // State
  let isLoading = $state(true);
  let users = $state<AdminUserView[]>([]);
  let stats = $state<AdminStats | null>(null);
  let error = $state<string | null>(null);

  // Signup status
  let signupEnabled = $state(true);
  let signupLoading = $state(false);

  // Pagination
  let page = $state(1);
  let limit = $state(20);
  let total = $state(0);
  let totalPages = $derived(Math.ceil(total / limit));

  // Filters
  let searchQuery = $state("");
  let roleFilter = $state<UserRole | "all">("all");
  let bannedFilter = $state<"all" | "banned" | "active">("all");

  // Dialogs
  let showBanDialog = $state(false);
  let showRoleDialog = $state(false);
  let showCreateUserDialog = $state(false);
  let selectedUser = $state<AdminUserView | null>(null);
  let banReason = $state("");
  let newRole = $state<UserRole>("user");
  let actionLoading = $state(false);

  // Create user form
  let newUserEmail = $state("");
  let newUserPassword = $state("");
  let newUserName = $state("");
  let newUserRole = $state<UserRole>("user");
  let createUserLoading = $state(false);

  // Tabs
  const tabs: Tab[] = [
    { id: "users", label: "Users", icon: UsersIcon },
  ];
  let activeTab = $state("users");

  // Load data
  async function loadData() {
    isLoading = true;
    error = null;

    try {
      const options: ListUsersOptions = {
        limit,
        offset: (page - 1) * limit,
      };

      if (searchQuery.trim()) {
        options.search = searchQuery.trim();
      }

      if (roleFilter !== "all") {
        options.role = roleFilter;
      }

      if (bannedFilter !== "all") {
        options.banned = bannedFilter === "banned";
      }

      const [usersResponse, statsResponse, signupResponse] = await Promise.all([
        listUsers(options),
        getAdminStats(),
        getSignupStatus(),
      ]);

      users = usersResponse.users;
      total = usersResponse.total;
      stats = statsResponse;
      signupEnabled = signupResponse.enabled;
    } catch (e) {
      const err = e as Error;
      error = err.message || "Failed to load users";
    } finally {
      isLoading = false;
    }
  }

  // Initial load
  onMount(() => {
    loadData();
  });

  // Handle search
  function handleSearch() {
    page = 1;
    loadData();
  }

  // Handle pagination
  function goToPage(newPage: number) {
    if (newPage >= 1 && newPage <= totalPages) {
      page = newPage;
      loadData();
    }
  }

  // Handle ban
  function openBanDialog(user: AdminUserView) {
    selectedUser = user;
    banReason = "";
    showBanDialog = true;
  }

  async function handleBan() {
    if (!selectedUser || !banReason.trim()) return;

    actionLoading = true;
    try {
      await banUser(selectedUser.id, banReason.trim());
      toast.success(`${selectedUser.email} has been banned`);
      showBanDialog = false;
      selectedUser = null;
      banReason = "";
      loadData();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to ban user", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Handle unban
  async function handleUnban(user: AdminUserView) {
    actionLoading = true;
    try {
      await unbanUser(user.id);
      toast.success(`${user.email} has been unbanned`);
      loadData();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to unban user", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Handle role change
  function openRoleDialog(user: AdminUserView) {
    selectedUser = user;
    newRole = user.role;
    showRoleDialog = true;
  }

  async function handleRoleChange() {
    if (!selectedUser || newRole === selectedUser.role) return;

    actionLoading = true;
    try {
      await updateUserRole(selectedUser.id, newRole);
      toast.success(`${selectedUser.email} is now ${newRole}`);
      showRoleDialog = false;
      selectedUser = null;
      loadData();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update role", { description: err.message });
    } finally {
      actionLoading = false;
    }
  }

  // Handle signup toggle
  async function handleToggleSignup() {
    signupLoading = true;
    try {
      if (signupEnabled) {
        await disableSignup();
        signupEnabled = false;
        toast.success("Public signup disabled");
      } else {
        await enableSignup();
        signupEnabled = true;
        toast.success("Public signup enabled");
      }
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update signup settings", { description: err.message });
    } finally {
      signupLoading = false;
    }
  }

  // Handle create user
  function openCreateUserDialog() {
    newUserEmail = "";
    newUserPassword = "";
    newUserName = "";
    newUserRole = "user";
    showCreateUserDialog = true;
  }

  async function handleCreateUser() {
    if (!newUserEmail.trim() || !newUserPassword || !newUserName.trim()) return;

    createUserLoading = true;
    try {
      const input: CreateUserInput = {
        email: newUserEmail.trim(),
        password: newUserPassword,
        name: newUserName.trim(),
        role: newUserRole,
      };
      
      await createUser(input);
      toast.success(`User ${newUserEmail} created successfully`);
      showCreateUserDialog = false;
      loadData();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to create user", { description: err.message });
    } finally {
      createUserLoading = false;
    }
  }

  // Format date
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <!-- Header -->
  <PageHeader
    title="Admin Panel"
    icon={ShieldIcon}
    subtitle="Manage users, resource limits, and system settings"
    tabs={tabs}
    activeTab={activeTab}
    onTabChange={(tab) => activeTab = tab}
    sticky={false}
    collapsible={true}
  >
    {#snippet leading()}
      <Button 
        variant="ghost" 
        size="icon"
        onclick={() => goto("/")}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
        title="Home"
      >
        <HomeIcon class="h-4 w-4" />
      </Button>
    {/snippet}
    {#snippet actions()}
      <ThemeToggle />
    {/snippet}
  </PageHeader>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6 animate-fade-in">
      <!-- Stats Cards -->
      {#if stats}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="cyber-card corner-accent p-4 text-center">
            <p class="text-2xl font-bold font-mono">{stats.totalUsers}</p>
            <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Total Users</p>
          </div>
          <div class="cyber-card corner-accent p-4 text-center">
            <p class="text-2xl font-bold font-mono text-[var(--cyber-cyan)]">{stats.adminUsers}</p>
            <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Admins</p>
          </div>
          <div class="cyber-card corner-accent p-4 text-center">
            <p class="text-2xl font-bold font-mono text-[var(--cyber-red)]">{stats.bannedUsers}</p>
            <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Banned</p>
          </div>
          <div class="cyber-card corner-accent p-4 text-center">
            <p class="text-2xl font-bold font-mono text-[var(--cyber-emerald)]">{stats.usersThisWeek}</p>
            <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">This Week</p>
          </div>
        </div>
      {/if}

      <!-- Settings Bar -->
      <div class="cyber-card corner-accent p-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <!-- Signup Toggle -->
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Public Signup:</span>
            <Button
              variant="ghost"
              size="sm"
              onclick={handleToggleSignup}
              disabled={signupLoading}
              class="font-mono text-xs gap-2 {signupEnabled ? 'text-[var(--cyber-emerald)]' : 'text-[var(--cyber-red)]'}"
            >
              {#if signupLoading}
                <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              {:else if signupEnabled}
                <ToggleRightIcon class="h-5 w-5" />
              {:else}
                <ToggleLeftIcon class="h-5 w-5" />
              {/if}
              {signupEnabled ? "Enabled" : "Disabled"}
            </Button>
            <span class="text-xs text-muted-foreground font-mono">
              {signupEnabled ? "(anyone can register)" : "(admin invitation only)"}
            </span>
          </div>

          <!-- Create User Button -->
          <Button
            onclick={openCreateUserDialog}
            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
          >
            <PlusIcon class="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>
      </div>

      <!-- Filters -->
      <div class="cyber-card corner-accent p-4">
        <div class="flex flex-wrap items-center gap-4">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <div class="relative">
              <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by email or name..."
                bind:value={searchQuery}
                onkeydown={(e) => e.key === "Enter" && handleSearch()}
                class="pl-10 font-mono text-sm bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
              />
            </div>
          </div>

          <!-- Role Filter -->
          <Select.Root
            type="single"
            value={roleFilter}
            onValueChange={(v) => {
              if (v) {
                roleFilter = v as typeof roleFilter;
                page = 1;
                loadData();
              }
            }}
          >
            <Select.Trigger class="w-32 font-mono text-xs bg-background/50 border-border/50">
              {roleFilter === "all" ? "All Roles" : roleFilter === "admin" ? "Admin" : "User"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="All Roles" />
              <Select.Item value="admin" label="Admin" />
              <Select.Item value="user" label="User" />
            </Select.Content>
          </Select.Root>

          <!-- Banned Filter -->
          <Select.Root
            type="single"
            value={bannedFilter}
            onValueChange={(v) => {
              if (v) {
                bannedFilter = v as typeof bannedFilter;
                page = 1;
                loadData();
              }
            }}
          >
            <Select.Trigger class="w-32 font-mono text-xs bg-background/50 border-border/50">
              {bannedFilter === "all" ? "All Status" : bannedFilter === "banned" ? "Banned" : "Active"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="All Status" />
              <Select.Item value="active" label="Active" />
              <Select.Item value="banned" label="Banned" />
            </Select.Content>
          </Select.Root>

          <!-- Search Button -->
          <Button
            onclick={handleSearch}
            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
          >
            <SearchIcon class="h-4 w-4 mr-2" />
            Search
          </Button>

          <!-- Refresh -->
          <Button
            variant="outline"
            onclick={loadData}
            disabled={isLoading}
            class="font-mono text-xs uppercase tracking-wider border-border/50"
          >
            <RefreshIcon class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
          </Button>
        </div>
      </div>

      <!-- Users Table -->
      <div class="cyber-card corner-accent overflow-hidden">
        {#if isLoading}
          <div class="flex items-center justify-center py-12">
            <div class="relative w-8 h-8">
              <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
            </div>
            <span class="ml-3 text-muted-foreground font-mono text-sm">Loading users...</span>
          </div>
        {:else if error}
          <div class="p-6 text-center">
            <p class="text-[var(--cyber-red)] font-mono text-sm">{error}</p>
            <Button
              variant="outline"
              onclick={loadData}
              class="mt-4 font-mono text-xs uppercase tracking-wider"
            >
              Retry
            </Button>
          </div>
        {:else if users.length === 0}
          <div class="p-12 text-center">
            <UsersIcon class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p class="text-muted-foreground font-mono">No users found</p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-background/30 border-b border-border/30">
                <tr>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">User</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Sandboxes</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Joined</th>
                  <th class="text-right px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/20">
                {#each users as user}
                  <tr class="hover:bg-muted/20 transition-colors">
                    <!-- User Info -->
                    <td class="px-4 py-3">
                      <button
                        onclick={() => goto(`/admin/users/${user.id}`)}
                        class="flex items-center gap-3 text-left hover:text-[var(--cyber-cyan)] transition-colors"
                      >
                        {#if user.image}
                          <img src={user.image} alt={user.name} class="w-8 h-8 rounded-full" />
                        {:else}
                          <div class="w-8 h-8 rounded-full bg-[var(--cyber-cyan)]/20 flex items-center justify-center text-[var(--cyber-cyan)] font-mono text-xs">
                            {user.name?.[0] || user.email[0]}
                          </div>
                        {/if}
                        <div>
                          <p class="font-mono text-sm">{user.name || "—"}</p>
                          <p class="font-mono text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </button>
                    </td>

                    <!-- Role -->
                    <td class="px-4 py-3">
                      <button
                        onclick={() => openRoleDialog(user)}
                        class="px-2 py-1 rounded font-mono text-xs uppercase tracking-wider border transition-colors
                               {user.role === 'admin'
                                 ? 'bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border-[var(--cyber-cyan)]/30 hover:bg-[var(--cyber-cyan)]/20'
                                 : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/30'}"
                      >
                        {user.role}
                      </button>
                    </td>

                    <!-- Status -->
                    <td class="px-4 py-3">
                      <div class="flex flex-col gap-1">
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
                    </td>

                    <!-- Sandboxes -->
                    <td class="px-4 py-3 font-mono text-sm">
                      {user.sandboxCount}
                      {#if user.runningSandboxCount > 0}
                        <span class="text-[var(--cyber-emerald)]">({user.runningSandboxCount} running)</span>
                      {/if}
                    </td>

                    <!-- Joined -->
                    <td class="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>

                    <!-- Actions -->
                    <td class="px-4 py-3 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <!-- Ban/Unban actions -->
                        {#if user.banned}
                          <Button
                            variant="ghost"
                            size="sm"
                            onclick={() => handleUnban(user)}
                            disabled={actionLoading}
                            class="font-mono text-xs text-[var(--cyber-emerald)] hover:text-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/10"
                          >
                            <CheckIcon class="h-4 w-4 mr-1" />
                            Unban
                          </Button>
                        {:else}
                          <Button
                            variant="ghost"
                            size="sm"
                            onclick={() => openBanDialog(user)}
                            disabled={actionLoading}
                            class="font-mono text-xs text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                          >
                            <BanIcon class="h-4 w-4 mr-1" />
                            Ban
                          </Button>
                        {/if}
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={() => goto(`/admin/users/${user.id}`)}
                          class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)]"
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          {#if totalPages > 1}
            <div class="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-background/30">
              <p class="font-mono text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
              </p>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  class="font-mono text-xs"
                >
                  <ChevronLeftIcon class="h-4 w-4" />
                </Button>
                <span class="font-mono text-xs">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  class="font-mono text-xs"
                >
                  <ChevronRightIcon class="h-4 w-4" />
                </Button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</main>

<!-- Ban Dialog -->
<Dialog.Root bind:open={showBanDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-red)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-red)]">[ban_user]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Ban {selectedUser?.email}? They will be logged out and unable to access the platform.
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-red)] block mb-2">
        Reason (required)
      </label>
      <textarea
        bind:value={banReason}
        placeholder="Enter the reason for banning this user..."
        class="w-full h-24 p-3 text-sm font-mono border border-[var(--cyber-red)]/30 rounded bg-background/50 resize-none
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
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/90 text-white disabled:opacity-50"
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
        Change role for {selectedUser?.email}
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)] block mb-2">
        New Role
      </label>
      <Select.Root
        type="single"
        value={newRole}
        onValueChange={(v) => {
          if (v) newRole = v as UserRole;
        }}
      >
        <Select.Trigger class="w-full font-mono text-sm bg-background/50 border-border/50">
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
        disabled={actionLoading || newRole === selectedUser?.role}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black disabled:opacity-50"
      >
        {#if actionLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {actionLoading ? "Updating..." : "Update Role"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Create User Dialog -->
<Dialog.Root bind:open={showCreateUserDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-cyan)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-cyan)]">[create_user]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Create a new user account (bypasses signup restrictions)
      </Dialog.Description>
    </Dialog.Header>
    <form onsubmit={(e) => { e.preventDefault(); handleCreateUser(); }} class="space-y-4 py-4">
      <div class="space-y-2">
        <Label for="new-user-name" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Name
        </Label>
        <Input
          id="new-user-name"
          type="text"
          placeholder="John Doe"
          bind:value={newUserName}
          required
          class="font-mono text-sm bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
        />
      </div>
      <div class="space-y-2">
        <Label for="new-user-email" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Email
        </Label>
        <Input
          id="new-user-email"
          type="email"
          placeholder="user@example.com"
          bind:value={newUserEmail}
          required
          class="font-mono text-sm bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
        />
      </div>
      <div class="space-y-2">
        <Label for="new-user-password" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Password
        </Label>
        <Input
          id="new-user-password"
          type="password"
          placeholder="••••••••"
          bind:value={newUserPassword}
          required
          minlength={8}
          class="font-mono text-sm bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
        />
        <p class="text-xs text-muted-foreground font-mono">Minimum 8 characters</p>
      </div>
      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Role
        </Label>
        <Select.Root
          type="single"
          value={newUserRole}
          onValueChange={(v) => {
            if (v) newUserRole = v as UserRole;
          }}
        >
          <Select.Trigger class="w-full font-mono text-sm bg-background/50 border-border/50">
            {newUserRole === "admin" ? "Admin" : "User"}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="user" label="User" />
            <Select.Item value="admin" label="Admin" />
          </Select.Content>
        </Select.Root>
        {#if newUserRole === "admin"}
          <p class="text-xs text-[var(--cyber-amber)] font-mono">
            Warning: Admins have full access to manage all users and system settings.
          </p>
        {/if}
      </div>
    </form>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => showCreateUserDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button
        onclick={handleCreateUser}
        disabled={createUserLoading || !newUserEmail.trim() || !newUserPassword || !newUserName.trim()}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black disabled:opacity-50"
      >
        {#if createUserLoading}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {createUserLoading ? "Creating..." : "Create User"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
