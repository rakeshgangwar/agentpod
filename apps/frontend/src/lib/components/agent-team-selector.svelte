<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronDown, ChevronRight, Users, Lock, Shield } from "@lucide/svelte";
  import { 
    Collapsible, 
    CollapsibleContent, 
    CollapsibleTrigger 
  } from "$lib/components/ui/collapsible";
  import { 
    listAgentCatalog, 
    type AgentsBySquad,
    type AgentCatalogResponse,
  } from "$lib/api/tauri";
  
  let {
    selectedAgentSlugs = $bindable<string[]>([]),
    disabled = false,
  }: {
    selectedAgentSlugs?: string[];
    disabled?: boolean;
  } = $props();
  
  let bySquad = $state<AgentsBySquad | null>(null);
  let mandatoryAgentSlugs = $state<string[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  const squadLabels: Record<keyof AgentsBySquad, string> = {
    orchestration: "Orchestration",
    development: "Development",
    product: "Product",
    operations: "Operations",
    security: "Security",
    research: "Research",
    communication: "Communication",
    data: "Data",
  };
  
  const squadOrder: Array<keyof AgentsBySquad> = [
    "orchestration",
    "development",
    "product",
    "operations",
    "security",
    "research",
    "communication",
    "data",
  ];
  
  let squadOpenState = $state<Record<string, boolean>>({
    orchestration: true,
    development: true,
    product: false,
    operations: false,
    security: false,
    research: false,
    communication: false,
    data: false,
  });
  
  const selectedAgentCount = $derived(selectedAgentSlugs.length);
  const mandatoryCount = $derived(mandatoryAgentSlugs.length);
  const optionalCount = $derived(selectedAgentSlugs.filter(s => !mandatoryAgentSlugs.includes(s)).length);
  
  onMount(() => {
    loadData();
  });
  
  async function loadData() {
    loading = true;
    error = null;
    
    try {
      const data: AgentCatalogResponse = await listAgentCatalog();
      bySquad = data.bySquad;
      mandatoryAgentSlugs = data.mandatoryAgentSlugs || [];
      
      if (selectedAgentSlugs.length === 0) {
        selectedAgentSlugs = [...mandatoryAgentSlugs];
      } else {
        const missing = mandatoryAgentSlugs.filter(s => !selectedAgentSlugs.includes(s));
        if (missing.length > 0) {
          selectedAgentSlugs = [...selectedAgentSlugs, ...missing];
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load agent catalog";
    } finally {
      loading = false;
    }
  }
  
  function toggleAgent(agentSlug: string) {
    if (disabled) return;
    if (mandatoryAgentSlugs.includes(agentSlug)) return;
    
    if (selectedAgentSlugs.includes(agentSlug)) {
      selectedAgentSlugs = selectedAgentSlugs.filter(s => s !== agentSlug);
    } else {
      selectedAgentSlugs = [...selectedAgentSlugs, agentSlug];
    }
  }
  
  function isAgentSelected(agentSlug: string): boolean {
    return selectedAgentSlugs.includes(agentSlug);
  }
  
  function findAgentBySlug(slug: string) {
    if (!bySquad) return null;
    for (const squad of squadOrder) {
      const agent = bySquad[squad].find(a => a.slug === slug);
      if (agent) return agent;
    }
    return null;
  }
  
  function getSelectedCountInSquad(squad: keyof AgentsBySquad): number {
    if (!bySquad) return 0;
    const squadAgents = bySquad[squad];
    return squadAgents.filter(a => 
      !mandatoryAgentSlugs.includes(a.slug) && selectedAgentSlugs.includes(a.slug)
    ).length;
  }
</script>

<div class="space-y-4">
  <div>
    <h3 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">[agent_team]</h3>
    <p class="text-xs text-muted-foreground font-mono">
      Select AI agents for your project. Core agents are always included.
    </p>
  </div>
  
  {#if loading}
    <div class="space-y-2">
      {#each Array(3) as _}
        <div class="h-16 rounded border border-[var(--cyber-cyan)]/20 bg-[var(--cyber-cyan)]/5 animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <div class="text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-3 rounded flex items-start gap-2">
      <Shield class="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        {error}
        <button 
          type="button" 
          class="ml-2 underline hover:no-underline text-[var(--cyber-cyan)]"
          onclick={loadData}
        >
          Retry
        </button>
      </div>
    </div>
  {:else if bySquad}
    {#if mandatoryAgentSlugs.length > 0}
      <div class="p-3 rounded border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5">
        <div class="flex items-center gap-2 mb-2">
          <Lock class="w-3.5 h-3.5 text-[var(--cyber-cyan)]" />
          <span class="text-xs font-mono text-[var(--cyber-cyan)]">Core Team (Always Included)</span>
        </div>
        <div class="flex flex-wrap gap-2">
          {#each mandatoryAgentSlugs as slug}
            {#if findAgentBySlug(slug)}
              {@const agent = findAgentBySlug(slug)}
              <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30 text-xs font-mono">
                {#if agent?.emoji}
                  <span>{agent.emoji}</span>
                {/if}
                <span class="text-[var(--cyber-cyan)]">{agent?.name}</span>
                <Lock class="w-3 h-3 text-[var(--cyber-cyan)]/50" />
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
    
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <Users class="w-3.5 h-3.5 text-[var(--cyber-magenta)]" />
        <h4 class="text-xs font-mono text-[var(--cyber-magenta)]">Additional Agents</h4>
      </div>
      
      {#each squadOrder as squad}
        {@const squadAgents = bySquad[squad]}
        {@const nonMandatoryAgents = squadAgents.filter(a => !mandatoryAgentSlugs.includes(a.slug))}
        {#if nonMandatoryAgents.length > 0}
          <Collapsible bind:open={squadOpenState[squad]}>
            <CollapsibleTrigger class="w-full">
              <div
                class="w-full flex items-center justify-between px-3 py-2 rounded border transition-all font-mono
                  border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5
                  {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
              >
                <div class="flex items-center gap-2">
                  <div class="text-[var(--cyber-cyan)]">
                    {#if squadOpenState[squad]}
                      <ChevronDown class="w-4 h-4" />
                    {:else}
                      <ChevronRight class="w-4 h-4" />
                    {/if}
                  </div>
                  <span class="text-sm">{squadLabels[squad]}</span>
                  <span class="text-[10px] text-muted-foreground">
                    ({nonMandatoryAgents.length})
                  </span>
                </div>
                {#if getSelectedCountInSquad(squad) > 0}
                  <span class="text-xs text-[var(--cyber-cyan)]">
                    {getSelectedCountInSquad(squad)} selected
                  </span>
                {/if}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div class="mt-2 ml-6 space-y-1">
                {#each nonMandatoryAgents as agent (agent.id)}
                  {@const isSelected = isAgentSelected(agent.slug)}
                  <button
                    type="button"
                    class="w-full text-left p-2 rounded border transition-all font-mono
                      {isSelected 
                        ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
                        : 'border-border/20 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}
                      {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
                    onclick={() => toggleAgent(agent.slug)}
                    {disabled}
                  >
                    <div class="flex items-center gap-2">
                      <div class="flex-shrink-0">
                        <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                          {isSelected ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)] shadow-[0_0_6px_var(--cyber-cyan)]' : 'border-muted-foreground/30'}">
                          {#if isSelected}
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          {/if}
                        </div>
                      </div>
                      
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          {#if agent.emoji}
                            <span class="text-base">{agent.emoji}</span>
                          {/if}
                          <span class="text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : ''} truncate">
                            {agent.name}
                          </span>
                          {#if agent.mode === "primary"}
                            <span class="text-[9px] px-1 py-0.5 rounded bg-[var(--cyber-magenta)]/20 text-[var(--cyber-magenta)] border border-[var(--cyber-magenta)]/30">
                              PRIMARY
                            </span>
                          {/if}
                        </div>
                        <p class="text-xs text-muted-foreground truncate">
                          {agent.role}
                        </p>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            </CollapsibleContent>
          </Collapsible>
        {/if}
      {/each}
    </div>
    
    {#if selectedAgentCount > 0}
      <div class="text-xs text-muted-foreground font-mono pt-2 border-t border-border/30">
        <div class="flex items-center gap-2">
          <span class="text-[var(--cyber-cyan)]">Team:</span>
          <span class="text-[var(--cyber-cyan)]">{mandatoryCount}</span>
          <span>core</span>
          {#if optionalCount > 0}
            <span class="text-muted-foreground/50">+</span>
            <span class="text-[var(--cyber-magenta)]">{optionalCount}</span>
            <span>optional</span>
          {/if}
          <span class="text-muted-foreground/50">=</span>
          <span>{selectedAgentCount} total</span>
        </div>
      </div>
    {/if}
  {:else}
    <div class="text-xs text-muted-foreground font-mono text-center p-4 border border-dashed border-border/30 rounded">
      No agents available
    </div>
  {/if}
</div>
