<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { 
    getAgentById, 
    updateAgentCatalogItem,
    type AgentFullDetails,
    type AgentStatus,
    type AgentSquad,
    type AgentTier,
    type UpdateAgentInput,
  } from "$lib/api/admin";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import PageHeader from "$lib/components/page-header.svelte";
  import type { Tab } from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";

  import BotIcon from "@lucide/svelte/icons/bot";
  import UsersIcon from "@lucide/svelte/icons/users";
  import HomeIcon from "@lucide/svelte/icons/home";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SaveIcon from "@lucide/svelte/icons/save";
  import ShieldIcon from "@lucide/svelte/icons/shield";

  let isLoading = $state(true);
  let isSaving = $state(false);
  let agent = $state<AgentFullDetails | null>(null);
  let error = $state<string | null>(null);

  let formData = $state({
    name: "",
    role: "",
    emoji: "",
    description: "",
    squad: "development" as AgentSquad,
    tier: "foundation" as AgentTier | null,
    status: "active" as AgentStatus,
    isDefault: false,
    isPremium: false,
    tags: "",
    category: "",
    opencodeContent: "",
  });

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

  async function loadAgent() {
    const agentId = $page.params.id;
    
    if (!agentId) {
      error = "No agent ID provided";
      isLoading = false;
      return;
    }

    isLoading = true;
    error = null;

    try {
      const response = await getAgentById(agentId);
      agent = response.agent;
      
      formData = {
        name: agent.name,
        role: agent.role,
        emoji: agent.emoji || "",
        description: agent.description || "",
        squad: agent.squad,
        tier: agent.tier,
        status: agent.status,
        isDefault: agent.isDefault,
        isPremium: agent.isPremium,
        tags: agent.tags?.join(", ") || "",
        category: agent.category || "",
        opencodeContent: agent.opencodeContent || "",
      };
    } catch (e) {
      const err = e as Error;
      error = err.message || "Failed to load agent";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadAgent();
  });

  async function handleSave() {
    if (!agent) return;

    isSaving = true;

    try {
      const updates: UpdateAgentInput = {
        name: formData.name,
        role: formData.role,
        emoji: formData.emoji || undefined,
        description: formData.description || undefined,
        squad: formData.squad,
        tier: formData.tier || undefined,
        status: formData.status,
        isDefault: formData.isDefault,
        isPremium: formData.isPremium,
        tags: formData.tags ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        category: formData.category || undefined,
        opencodeContent: formData.opencodeContent,
      };

      const result = await updateAgentCatalogItem(agent.id, updates);
      agent = result.agent;
      
      toast.success("Agent updated successfully");
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to update agent", { description: err.message });
    } finally {
      isSaving = false;
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
    title="Agent Details"
    icon={ShieldIcon}
    subtitle={agent ? `Editing ${agent.name}` : "Loading..."}
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
        onclick={() => goto("/admin/agents")}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
        title="Back to Agents"
      >
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>
    {/snippet}
    {#snippet actions()}
      <Button 
        variant="ghost" 
        size="icon"
        onclick={() => goto("/")}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
        title="Home"
      >
        <HomeIcon class="h-4 w-4" />
      </Button>
      <ThemeToggle />
    {/snippet}
  </PageHeader>

  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-7xl space-y-6 animate-fade-in">
      {#if isLoading}
        <div class="flex items-center justify-center py-12">
          <div class="relative w-8 h-8">
            <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
            <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
          </div>
          <span class="ml-3 text-muted-foreground font-mono text-sm">Loading agent...</span>
        </div>
      {:else if error}
        <div class="cyber-card corner-accent p-6 text-center">
          <p class="text-[var(--cyber-red)] font-mono text-sm">{error}</p>
          <Button
            variant="outline"
            onclick={() => goto("/admin/agents")}
            class="mt-4 font-mono text-xs uppercase tracking-wider"
          >
            Back to Agents
          </Button>
        </div>
      {:else if agent}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="cyber-card corner-accent p-6 space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-border/30">
              {#if agent.emoji}
                <span class="text-3xl">{agent.emoji}</span>
              {:else}
                <div class="w-10 h-10 rounded-full bg-[var(--cyber-cyan)]/20 flex items-center justify-center text-[var(--cyber-cyan)] font-mono text-lg">
                  {agent.name[0]}
                </div>
              {/if}
              <div>
                <h2 class="text-lg font-bold font-mono">Basic Information</h2>
                <p class="text-xs font-mono text-muted-foreground">Agent identity and metadata</p>
              </div>
            </div>

            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="name" class="font-mono text-xs uppercase tracking-wider">Name</Label>
                <Input
                  id="name"
                  type="text"
                  bind:value={formData.name}
                  class="font-mono text-sm"
                  placeholder="Agent name"
                />
              </div>

              <div class="space-y-2">
                <Label for="role" class="font-mono text-xs uppercase tracking-wider">Role</Label>
                <Input
                  id="role"
                  type="text"
                  bind:value={formData.role}
                  class="font-mono text-sm"
                  placeholder="Agent role description"
                />
              </div>

              <div class="space-y-2">
                <Label for="emoji" class="font-mono text-xs uppercase tracking-wider">Emoji</Label>
                <Input
                  id="emoji"
                  type="text"
                  bind:value={formData.emoji}
                  class="font-mono text-sm"
                  placeholder="🤖"
                />
              </div>

              <div class="space-y-2">
                <Label for="description" class="font-mono text-xs uppercase tracking-wider">Description</Label>
                <Input
                  id="description"
                  type="text"
                  bind:value={formData.description}
                  class="font-mono text-sm"
                  placeholder="Brief description"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="squad" class="font-mono text-xs uppercase tracking-wider">Squad</Label>
                  <Select.Root
                    type="single"
                    value={formData.squad}
                    onValueChange={(v) => {
                      if (v) {
                        formData.squad = v as AgentSquad;
                      }
                    }}
                  >
                    <Select.Trigger id="squad" class="w-full font-mono text-xs">
                      <span style="color: {getSquadColor(formData.squad)}">{formData.squad}</span>
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="orchestration" label="orchestration" />
                      <Select.Item value="development" label="development" />
                      <Select.Item value="product" label="product" />
                      <Select.Item value="operations" label="operations" />
                      <Select.Item value="security" label="security" />
                      <Select.Item value="data" label="data" />
                    </Select.Content>
                  </Select.Root>
                </div>

                <div class="space-y-2">
                  <Label for="tier" class="font-mono text-xs uppercase tracking-wider">Tier</Label>
                  <Select.Root
                    type="single"
                    value={formData.tier || "foundation"}
                    onValueChange={(v) => {
                      if (v) {
                        formData.tier = v as AgentTier;
                      }
                    }}
                  >
                    <Select.Trigger id="tier" class="w-full font-mono text-xs">
                      {formData.tier || "foundation"}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="central" label="central" />
                      <Select.Item value="foundation" label="foundation" />
                      <Select.Item value="specialized" label="specialized" />
                      <Select.Item value="premium" label="premium" />
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>

              <div class="space-y-2">
                <Label for="status" class="font-mono text-xs uppercase tracking-wider">Status</Label>
                <Select.Root
                  type="single"
                  value={formData.status}
                  onValueChange={(v) => {
                    if (v) {
                      formData.status = v as AgentStatus;
                    }
                  }}
                >
                  <Select.Trigger id="status" class="w-full font-mono text-xs">
                    {formData.status}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="active" label="active" />
                    <Select.Item value="deprecated" label="deprecated" />
                    <Select.Item value="hidden" label="hidden" />
                    <Select.Item value="pending_review" label="pending_review" />
                  </Select.Content>
                </Select.Root>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="flex items-center space-x-2">
                  <input
                    id="isDefault"
                    type="checkbox"
                    bind:checked={formData.isDefault}
                    class="h-4 w-4 rounded border-border/50 bg-background/50"
                  />
                  <Label for="isDefault" class="font-mono text-xs uppercase tracking-wider cursor-pointer">
                    Default
                  </Label>
                </div>

                <div class="flex items-center space-x-2">
                  <input
                    id="isPremium"
                    type="checkbox"
                    bind:checked={formData.isPremium}
                    class="h-4 w-4 rounded border-border/50 bg-background/50"
                  />
                  <Label for="isPremium" class="font-mono text-xs uppercase tracking-wider cursor-pointer">
                    Premium
                  </Label>
                </div>
              </div>

              <div class="space-y-2">
                <Label for="tags" class="font-mono text-xs uppercase tracking-wider">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  type="text"
                  bind:value={formData.tags}
                  class="font-mono text-sm"
                  placeholder="coding, debug, review"
                />
              </div>

              <div class="space-y-2">
                <Label for="category" class="font-mono text-xs uppercase tracking-wider">Category</Label>
                <Input
                  id="category"
                  type="text"
                  bind:value={formData.category}
                  class="font-mono text-sm"
                  placeholder="Category"
                />
              </div>
            </div>
          </div>

          <div class="cyber-card corner-accent p-6 space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-border/30">
              <div class="w-10 h-10 rounded-full bg-[var(--cyber-emerald)]/20 flex items-center justify-center">
                <BotIcon class="h-5 w-5 text-[var(--cyber-emerald)]" />
              </div>
              <div>
                <h2 class="text-lg font-bold font-mono">Agent Definition</h2>
                <p class="text-xs font-mono text-muted-foreground">Markdown content that defines agent behavior</p>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="opencodeContent" class="font-mono text-xs uppercase tracking-wider">
                OpenCode Content (Markdown)
              </Label>
              <textarea
                id="opencodeContent"
                bind:value={formData.opencodeContent}
                rows="20"
                class="border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground shadow-xs flex w-full min-w-0 rounded-md border px-3 py-2 text-sm outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive font-mono resize-y"
                placeholder="# Agent Name&#10;&#10;Description...&#10;&#10;## Capabilities&#10;- ...&#10;&#10;## Tools&#10;- ..."
              ></textarea>
            </div>
          </div>
        </div>

        {#if agent.config && Object.keys(agent.config).length > 0}
          <div class="cyber-card corner-accent p-6 space-y-4">
            <div class="flex items-center gap-3 pb-4 border-b border-border/30">
              <div class="w-10 h-10 rounded-full bg-[var(--cyber-amber)]/20 flex items-center justify-center text-[var(--cyber-amber)] font-mono text-xs">
                &#123;&#125;
              </div>
              <div>
                <h2 class="text-lg font-bold font-mono">Configuration</h2>
                <p class="text-xs font-mono text-muted-foreground">Agent config JSON (read-only)</p>
              </div>
            </div>

            <div class="bg-background/50 border border-border/30 rounded-md p-4 overflow-x-auto">
              <pre class="font-mono text-xs text-muted-foreground">{JSON.stringify(agent.config, null, 2)}</pre>
            </div>
          </div>
        {/if}

        <div class="cyber-card corner-accent p-6">
          <div class="flex items-center justify-between gap-4">
            <div class="text-xs font-mono text-muted-foreground space-y-1">
              <p>Agent ID: <span class="text-foreground">{agent.id}</span></p>
              <p>Slug: <span class="text-foreground">{agent.slug}</span></p>
              <p>Installs: <span class="text-foreground">{agent.installCount}</span></p>
              {#if agent.ratingAvg !== null}
                <p>Rating: <span class="text-[var(--cyber-amber)]">⭐ {agent.ratingAvg.toFixed(1)} ({agent.ratingCount} reviews)</span></p>
              {/if}
              {#if agent.publisherName}
                <p>Publisher: <span class="text-foreground">{agent.publisherName}</span></p>
              {/if}
              <p>Created: <span class="text-foreground">{new Date(agent.createdAt).toLocaleString()}</span></p>
              <p>Updated: <span class="text-foreground">{new Date(agent.updatedAt).toLocaleString()}</span></p>
            </div>

            <Button
              onclick={handleSave}
              disabled={isSaving}
              class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] px-6"
            >
              {#if isSaving}
                <span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                Saving...
              {:else}
                <SaveIcon class="h-4 w-4 mr-2" />
                Save Changes
              {/if}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>
