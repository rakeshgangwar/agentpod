<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { 
    getAgentCatalog, 
    updateAgentCatalogItem,
    type AgentCatalogItem,
    type AgentStatus,
    type AgentSquad,
    type UpdateAgentInput,
  } from "$lib/api/admin";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import PageHeader from "$lib/components/page-header.svelte";
  import type { Tab } from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";

  import BotIcon from "@lucide/svelte/icons/bot";
  import UsersIcon from "@lucide/svelte/icons/users";
  import HomeIcon from "@lucide/svelte/icons/home";
  import SearchIcon from "@lucide/svelte/icons/search";
  import RefreshIcon from "@lucide/svelte/icons/refresh-cw";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import ToggleLeftIcon from "@lucide/svelte/icons/toggle-left";
  import ToggleRightIcon from "@lucide/svelte/icons/toggle-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import EditIcon from "@lucide/svelte/icons/pencil";

  let isLoading = $state(true);
  let agents = $state<AgentCatalogItem[]>([]);
  let error = $state<string | null>(null);
  let actionLoading = $state<Record<string, boolean>>({});

  let searchQuery = $state("");
  let squadFilter = $state<AgentSquad | "all">("all");

  let filteredAgents = $derived(
    agents.filter(agent => {
      const matchesSearch = !searchQuery.trim() || 
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.role.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSquad = squadFilter === "all" || agent.squad === squadFilter;
      
      return matchesSearch && matchesSquad;
    })
  );

  let totalAgents = $derived(agents.length);
  let activeAgents = $derived(agents.filter(a => a.status === "active").length);
  let defaultAgents = $derived(agents.filter(a => a.isDefault).length);
  let uniqueSquads = $derived(new Set(agents.map(a => a.squad)).size);

  const tabs: Tab[] = [
    { id: "users", label: "Users", icon: UsersIcon },
    { id: "agents", label: "Agents", icon: BotIcon },
  ];
  let activeTab = $state("agents");

  function handleTabChange(tab: string) {
    if (tab === "users") {
      goto("/admin/users");
    }
    activeTab = tab;
  }

  async function loadData() {
    isLoading = true;
    error = null;

    try {
      const response = await getAgentCatalog();
      agents = response.agents;
    } catch (e) {
      const err = e as Error;
      error = err.message || "Failed to load agents";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  function handleSearch() {
    searchQuery = searchQuery.trim();
  }

  async function toggleStatus(agent: AgentCatalogItem) {
    const agentKey = agent.id;
    actionLoading[agentKey] = true;

    try {
      const newStatus: AgentStatus = agent.status === "active" ? "hidden" : "active";
      const updates: UpdateAgentInput = { status: newStatus };
      
      const result = await updateAgentCatalogItem(agent.id, updates);
      
      const index = agents.findIndex(a => a.id === agent.id);
      if (index !== -1) {
        agents[index] = result.agent;
      }
      
      toast.success(`${agent.name} is now ${newStatus}`);
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update status", { description: err.message });
    } finally {
      actionLoading[agentKey] = false;
    }
  }

  async function toggleDefault(agent: AgentCatalogItem) {
    const agentKey = `${agent.id}-default`;
    actionLoading[agentKey] = true;

    try {
      const newDefault = !agent.isDefault;
      const updates: UpdateAgentInput = { isDefault: newDefault };
      
      const result = await updateAgentCatalogItem(agent.id, updates);
      
      const index = agents.findIndex(a => a.id === agent.id);
      if (index !== -1) {
        agents[index] = result.agent;
      }
      
      toast.success(`${agent.name} ${newDefault ? "is now default" : "removed from defaults"}`);
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update default status", { description: err.message });
    } finally {
      actionLoading[agentKey] = false;
    }
  }

  function getSquadColor(squad: AgentSquad): string {
    switch (squad) {
      case "orchestration": return "var(--cyber-cyan)";
      case "development": return "var(--cyber-emerald)";
      case "product": return "var(--cyber-amber)";
      case "operations": return "var(--cyber-red)";
      case "security": return "var(--cyber-red)";
      case "data": return "var(--cyber-cyan)";
      default: return "var(--cyber-cyan)";
    }
  }
</script>

<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <PageHeader
    title="Admin Panel"
    icon={ShieldIcon}
    subtitle="Manage agent catalog, status, and defaults"
    tabs={tabs}
    activeTab={activeTab}
    onTabChange={handleTabChange}
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

  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6 animate-fade-in">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="cyber-card corner-accent p-4 text-center">
          <p class="text-2xl font-bold font-mono">{totalAgents}</p>
          <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Total Agents</p>
        </div>
        <div class="cyber-card corner-accent p-4 text-center">
          <p class="text-2xl font-bold font-mono text-[var(--cyber-emerald)]">{activeAgents}</p>
          <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Active</p>
        </div>
        <div class="cyber-card corner-accent p-4 text-center">
          <p class="text-2xl font-bold font-mono text-[var(--cyber-cyan)]">{defaultAgents}</p>
          <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Default</p>
        </div>
        <div class="cyber-card corner-accent p-4 text-center">
          <p class="text-2xl font-bold font-mono text-[var(--cyber-amber)]">{uniqueSquads}</p>
          <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Squads</p>
        </div>
      </div>

      <div class="cyber-card corner-accent p-4">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex-1 min-w-[200px]">
            <div class="relative">
              <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name or role..."
                bind:value={searchQuery}
                onkeydown={(e) => e.key === "Enter" && handleSearch()}
                class="pl-10 font-mono text-sm bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)]"
              />
            </div>
          </div>

          <Select.Root
            type="single"
            value={squadFilter}
            onValueChange={(v) => {
              if (v) {
                squadFilter = v as typeof squadFilter;
              }
            }}
          >
            <Select.Trigger class="w-40 font-mono text-xs bg-background/50 border-border/50">
              <FilterIcon class="h-3 w-3 mr-1" />
              {squadFilter === "all" ? "All Squads" : squadFilter}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="All Squads" />
              <Select.Item value="orchestration" label="orchestration" />
              <Select.Item value="development" label="development" />
              <Select.Item value="product" label="product" />
              <Select.Item value="operations" label="operations" />
              <Select.Item value="security" label="security" />
              <Select.Item value="data" label="data" />
            </Select.Content>
          </Select.Root>

          <Button
            onclick={handleSearch}
            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]"
          >
            <SearchIcon class="h-4 w-4 mr-2" />
            Search
          </Button>

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

      <div class="cyber-card corner-accent overflow-hidden">
        {#if isLoading}
          <div class="flex items-center justify-center py-12">
            <div class="relative w-8 h-8">
              <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
            </div>
            <span class="ml-3 text-muted-foreground font-mono text-sm">Loading agents...</span>
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
        {:else if filteredAgents.length === 0}
          <div class="p-12 text-center">
            <BotIcon class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p class="text-muted-foreground font-mono">No agents found</p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-background/30 border-b border-border/30">
                <tr>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Agent</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Squad</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th class="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Default</th>
                  <th class="text-right px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/20">
                {#each filteredAgents as agent}
                  <tr class="hover:bg-muted/20 transition-colors">
                    <td class="px-4 py-3">
                      <button
                        onclick={() => goto(`/admin/agents/${agent.id}`)}
                        class="flex items-center gap-3 text-left hover:text-[var(--cyber-cyan)] transition-colors"
                      >
                        {#if agent.emoji}
                          <span class="text-2xl">{agent.emoji}</span>
                        {:else}
                          <div class="w-8 h-8 rounded-full bg-[var(--cyber-cyan)]/20 flex items-center justify-center text-[var(--cyber-cyan)] font-mono text-xs">
                            {agent.name[0]}
                          </div>
                        {/if}
                        <div>
                          <p class="font-mono text-sm font-medium">{agent.name}</p>
                          <p class="font-mono text-xs text-muted-foreground">{agent.slug}</p>
                        </div>
                      </button>
                    </td>

                    <td class="px-4 py-3">
                      <p class="font-mono text-sm text-muted-foreground max-w-xs truncate">{agent.role}</p>
                    </td>

                    <td class="px-4 py-3">
                      <span 
                        class="px-2 py-1 rounded font-mono text-xs uppercase tracking-wider border"
                        style="color: {getSquadColor(agent.squad)}; border-color: {getSquadColor(agent.squad)}30; background-color: {getSquadColor(agent.squad)}10;"
                      >
                        {agent.squad}
                      </span>
                    </td>

                    <td class="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => toggleStatus(agent)}
                        disabled={actionLoading[agent.id]}
                        class="font-mono text-xs gap-2 {agent.status === 'active' ? 'text-[var(--cyber-emerald)]' : 'text-[var(--cyber-red)]'}"
                      >
                        {#if actionLoading[agent.id]}
                          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        {:else if agent.status === "active"}
                          <ToggleRightIcon class="h-5 w-5" />
                        {:else}
                          <ToggleLeftIcon class="h-5 w-5" />
                        {/if}
                        {agent.status === "active" ? "Active" : "Hidden"}
                      </Button>
                    </td>

                    <td class="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => toggleDefault(agent)}
                        disabled={actionLoading[`${agent.id}-default`]}
                        class="font-mono text-xs gap-2 {agent.isDefault ? 'text-[var(--cyber-cyan)]' : 'text-muted-foreground'}"
                      >
                        {#if actionLoading[`${agent.id}-default`]}
                          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        {:else if agent.isDefault}
                          <ToggleRightIcon class="h-5 w-5" />
                        {:else}
                          <ToggleLeftIcon class="h-5 w-5" />
                        {/if}
                        {agent.isDefault ? "Default" : "Not Default"}
                      </Button>
                    </td>

                    <td class="px-4 py-3 text-right">
                      <div class="flex items-center justify-end gap-3">
                        <div class="flex flex-col items-end gap-1">
                          <span class="font-mono text-xs text-muted-foreground">
                            {agent.installCount} installs
                          </span>
                          {#if agent.ratingAvg !== null}
                            <span class="font-mono text-xs text-[var(--cyber-amber)]">
                              ⭐ {agent.ratingAvg.toFixed(1)}
                            </span>
                          {/if}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={() => goto(`/admin/agents/${agent.id}`)}
                          class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
                        >
                          <EditIcon class="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  </div>
</main>
