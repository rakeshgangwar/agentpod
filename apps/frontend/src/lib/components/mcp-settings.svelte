<script lang="ts">
  import { toast } from "svelte-sonner";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import * as Select from "$lib/components/ui/select";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    listMcpServers,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
    testMcpServer,
    getMcpStatus,
    discoverMcpOAuth,
    initiateMcpOAuth,
    getMcpOAuthStatus,
    revokeMcpOAuth,
    type McpServer,
    type McpServerType,
    type McpAuthType,
    type CreateMcpServerInput,
    type McpOAuthStatusResponse,
    type McpOAuthStatus,
  } from "$lib/api/mcp";

  import ServerIcon from "@lucide/svelte/icons/server";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import EditIcon from "@lucide/svelte/icons/pencil";
  import PlayIcon from "@lucide/svelte/icons/play";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import KeyIcon from "@lucide/svelte/icons/key";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import LogOutIcon from "@lucide/svelte/icons/log-out";

  let servers = $state<McpServer[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mcpStatus = $state<{ enabled: boolean; status: string } | null>(null);

  let showAddDialog = $state(false);
  let showDeleteDialog = $state(false);
  let serverToDelete = $state<McpServer | null>(null);
  let editingServer = $state<McpServer | null>(null);
  let saving = $state(false);
  let testing = $state<string | null>(null);

  let oauthStatuses = $state<Record<string, McpOAuthStatusResponse>>({});
  let oauthLoading = $state<Record<string, boolean>>({});
  let oauthPolling = $state<Record<string, number>>({});

  let formName = $state("");
  let formDescription = $state("");
  let formType = $state<McpServerType>("STDIO");
  let formCommand = $state("");
  let formArgs = $state("");
  let formUrl = $state("");
  let formAuthType = $state<McpAuthType>("none");
  let formApiKey = $state("");
  let formBearerToken = $state("");
  let formEnvVars = $state("");

  $effect(() => {
    loadData();
  });

  async function loadData() {
    loading = true;
    error = null;
    try {
      const [serversData, statusData] = await Promise.all([
        listMcpServers(),
        getMcpStatus(),
      ]);
      servers = serversData;
      mcpStatus = statusData;

      for (const server of serversData) {
        if (server.type !== "STDIO" && server.url) {
          loadOAuthStatus(server.id);
        }
      }
    } catch (e) {
      const err = e as Error;
      error = err.message;
      console.error("Failed to load MCP data:", e);
    } finally {
      loading = false;
    }
  }

  async function loadOAuthStatus(serverId: string) {
    oauthLoading[serverId] = true;
    try {
      const status = await getMcpOAuthStatus(serverId);
      oauthStatuses[serverId] = status;
    } catch (e) {
      console.error(`Failed to load OAuth status for ${serverId}:`, e);
    } finally {
      oauthLoading[serverId] = false;
    }
  }

  async function handleOAuthAuthorize(server: McpServer) {
    oauthLoading[server.id] = true;
    try {
      const result = await initiateMcpOAuth(server.id);
      
      await openUrl(result.authorizationUrl);
      
      toast.info("Authorization started", {
        description: "Complete the authorization in your browser, then return here.",
      });

      startOAuthPolling(server.id);

    } catch (e) {
      const err = e as Error;
      toast.error("Failed to start authorization", { description: err.message });
      oauthLoading[server.id] = false;
    }
  }

  function startOAuthPolling(serverId: string) {
    if (oauthPolling[serverId]) return;
    
    oauthPolling[serverId] = window.setInterval(async () => {
      try {
        const status = await getMcpOAuthStatus(serverId);
        oauthStatuses[serverId] = status;
        
        if (status.session?.status === "authorized") {
          stopOAuthPolling(serverId);
          oauthLoading[serverId] = false;
          toast.success("Authorization complete");
        } else if (status.session?.status === "error") {
          stopOAuthPolling(serverId);
          oauthLoading[serverId] = false;
          toast.error("Authorization failed", { 
            description: status.session.errorMessage 
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }

  function stopOAuthPolling(serverId: string) {
    if (oauthPolling[serverId]) {
      clearInterval(oauthPolling[serverId]);
      delete oauthPolling[serverId];
    }
  }

  async function handleOAuthRevoke(server: McpServer) {
    oauthLoading[server.id] = true;
    try {
      await revokeMcpOAuth(server.id);
      toast.success("Authorization revoked");
      await loadOAuthStatus(server.id);
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to revoke authorization", { description: err.message });
    } finally {
      oauthLoading[server.id] = false;
    }
  }

  function getOAuthStatusColor(status?: McpOAuthStatus): string {
    switch (status) {
      case "authorized":
        return "text-[var(--cyber-emerald)]";
      case "pending":
        return "text-[var(--cyber-yellow)]";
      case "expired":
      case "error":
        return "text-[var(--cyber-red)]";
      default:
        return "text-muted-foreground";
    }
  }

  function getOAuthStatusLabel(status?: McpOAuthStatus): string {
    switch (status) {
      case "authorized":
        return "Authorized";
      case "pending":
        return "Pending";
      case "expired":
        return "Expired";
      case "error":
        return "Error";
      default:
        return "Not connected";
    }
  }

  function resetForm() {
    formName = "";
    formDescription = "";
    formType = "STDIO";
    formCommand = "";
    formArgs = "";
    formUrl = "";
    formAuthType = "none";
    formApiKey = "";
    formBearerToken = "";
    formEnvVars = "";
    editingServer = null;
  }

  function openAddDialog() {
    resetForm();
    showAddDialog = true;
  }

  function openEditDialog(server: McpServer) {
    editingServer = server;
    formName = server.name;
    formDescription = server.description || "";
    formType = server.type;
    formCommand = server.command || "";
    formArgs = server.args?.join(" ") || "";
    formUrl = server.url || "";
    formAuthType = server.authType;
    formApiKey = "";
    formBearerToken = "";
    formEnvVars = server.environment 
      ? Object.entries(server.environment).map(([k, v]) => `${k}=${v}`).join("\n")
      : "";
    showAddDialog = true;
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }

    saving = true;
    try {
      const input: CreateMcpServerInput = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        type: formType,
        command: formType === "STDIO" ? formCommand.trim() || undefined : undefined,
        args: formType === "STDIO" && formArgs.trim() 
          ? formArgs.split(/\s+/).filter(Boolean) 
          : undefined,
        url: formType !== "STDIO" ? formUrl.trim() || undefined : undefined,
        auth: buildAuthConfig(),
        environment: parseEnvVars(),
      };

      if (editingServer) {
        await updateMcpServer(editingServer.id, input);
        toast.success("Server updated");
      } else {
        await createMcpServer(input);
        toast.success("Server created");
      }

      showAddDialog = false;
      resetForm();
      await loadData();
    } catch (e) {
      const err = e as Error;
      toast.error(editingServer ? "Failed to update server" : "Failed to create server", {
        description: err.message,
      });
    } finally {
      saving = false;
    }
  }

  function buildAuthConfig() {
    switch (formAuthType) {
      case "api_key":
        return formApiKey ? { type: "api_key" as const, apiKey: formApiKey } : undefined;
      case "bearer_token":
        return formBearerToken ? { type: "bearer_token" as const, bearerToken: formBearerToken } : undefined;
      case "env_vars":
        return { type: "env_vars" as const };
      default:
        return { type: "none" as const };
    }
  }

  function parseEnvVars(): Record<string, string> | undefined {
    if (!formEnvVars.trim()) return undefined;
    const vars: Record<string, string> = {};
    for (const line of formEnvVars.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        vars[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      }
    }
    return Object.keys(vars).length > 0 ? vars : undefined;
  }

  async function handleDelete() {
    if (!serverToDelete) return;
    try {
      await deleteMcpServer(serverToDelete.id);
      toast.success("Server deleted");
      showDeleteDialog = false;
      serverToDelete = null;
      await loadData();
    } catch (e) {
      const err = e as Error;
      toast.error("Failed to delete server", { description: err.message });
    }
  }

  async function handleTest(server: McpServer) {
    testing = server.id;
    try {
      const result = await testMcpServer(server.id);
      if (result.success) {
        toast.success("Connection successful", { description: result.message });
      } else {
        toast.error("Connection failed", { description: result.message });
      }
    } catch (e) {
      const err = e as Error;
      toast.error("Test failed", { description: err.message });
    } finally {
      testing = null;
    }
  }

  const serverTypes: { value: McpServerType; label: string }[] = [
    { value: "STDIO", label: "STDIO (Local)" },
    { value: "SSE", label: "SSE (Server-Sent Events)" },
    { value: "STREAMABLE_HTTP", label: "Streamable HTTP" },
  ];

  const authTypes: { value: McpAuthType; label: string }[] = [
    { value: "none", label: "None" },
    { value: "api_key", label: "API Key" },
    { value: "bearer_token", label: "Bearer Token" },
    { value: "env_vars", label: "Environment Variables" },
  ];
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="font-mono text-sm font-medium text-[var(--cyber-cyan)] mb-1">[mcp_servers]</h3>
      <p class="text-xs text-muted-foreground font-mono">
        Configure Model Context Protocol servers for AI tool access.
      </p>
    </div>
    <div class="flex gap-2">
      <Button 
        variant="outline" 
        size="sm"
        onclick={loadData}
        disabled={loading}
        class="font-mono text-xs"
      >
        <RefreshCwIcon class="h-3 w-3 mr-1 {loading ? 'animate-spin' : ''}" />
        Refresh
      </Button>
      <Button 
        size="sm"
        onclick={openAddDialog}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]"
      >
        <PlusIcon class="h-3 w-3 mr-1" />
        Add Server
      </Button>
    </div>
  </div>

  {#if mcpStatus}
    <div class="p-3 rounded border font-mono text-xs flex items-center justify-between
      {mcpStatus.status === 'connected' 
        ? 'bg-[var(--cyber-emerald)]/10 border-[var(--cyber-emerald)]/30 text-[var(--cyber-emerald)]' 
        : mcpStatus.status === 'disabled'
          ? 'bg-muted/50 border-border/30 text-muted-foreground'
          : 'bg-[var(--cyber-red)]/10 border-[var(--cyber-red)]/30 text-[var(--cyber-red)]'}">
      <span>
        MetaMCP: {mcpStatus.status}
        {#if !mcpStatus.enabled}
          (disabled in configuration)
        {/if}
      </span>
      {#if mcpStatus.status === 'connected'}
        <a 
          href="http://metamcp.localhost" 
          target="_blank" 
          rel="noopener noreferrer"
          class="flex items-center gap-1 text-[var(--cyber-cyan)] hover:underline"
        >
          Open MetaMCP
          <ExternalLinkIcon class="h-3 w-3" />
        </a>
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-8">
      <div class="relative w-6 h-6">
        <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
      </div>
      <span class="ml-3 text-muted-foreground font-mono text-sm">Loading servers...</span>
    </div>
  {:else if error}
    <div class="p-4 rounded border bg-[var(--cyber-red)]/10 border-[var(--cyber-red)]/30 text-[var(--cyber-red)]">
      <p class="font-mono text-sm font-medium">Failed to load servers</p>
      <p class="text-xs font-mono mt-1">{error}</p>
      <Button 
        variant="outline" 
        size="sm" 
        onclick={loadData}
        class="mt-3 font-mono text-xs"
      >
        Retry
      </Button>
    </div>
  {:else if servers.length === 0}
    <div class="text-center py-8 border-2 border-dashed border-border/30 rounded bg-background/30">
      <ServerIcon class="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p class="text-muted-foreground font-mono text-sm">No MCP servers configured</p>
      <Button 
        variant="link" 
        onclick={openAddDialog}
        class="text-[var(--cyber-cyan)] font-mono text-sm"
      >
        Add your first server
      </Button>
    </div>
  {:else}
    <div class="space-y-2">
      {#each servers as server}
        {@const oauthStatus = oauthStatuses[server.id]}
        {@const isOAuthLoading = oauthLoading[server.id]}
        {@const requiresOAuth = oauthStatus?.discovery?.requiresOAuth}
        {@const sessionStatus = oauthStatus?.session?.status}
        <div class="flex items-center justify-between p-3 border border-border/30 rounded bg-background/50 hover:border-[var(--cyber-cyan)]/30 transition-colors">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="shrink-0">
              {#if server.enabled}
                <CheckCircleIcon class="h-4 w-4 text-[var(--cyber-emerald)]" />
              {:else}
                <XCircleIcon class="h-4 w-4 text-muted-foreground" />
              {/if}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-mono text-sm truncate">{server.name}</p>
                {#if requiresOAuth}
                  <span class="flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded {getOAuthStatusColor(sessionStatus)} bg-current/10">
                    {#if sessionStatus === "authorized"}
                      <ShieldCheckIcon class="h-3 w-3" />
                    {:else if sessionStatus === "error" || sessionStatus === "expired"}
                      <ShieldAlertIcon class="h-3 w-3" />
                    {:else}
                      <KeyIcon class="h-3 w-3" />
                    {/if}
                    {getOAuthStatusLabel(sessionStatus)}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground font-mono">
                {server.type} · {server.authType}
                {#if server.type === "STDIO" && server.command}
                  · {server.command}
                {:else if server.url}
                  · {server.url}
                {/if}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            {#if requiresOAuth && sessionStatus !== "authorized"}
              <Button 
                variant="outline" 
                size="sm"
                onclick={() => handleOAuthAuthorize(server)}
                disabled={isOAuthLoading}
                class="h-7 px-2 font-mono text-xs text-[var(--cyber-cyan)] border-[var(--cyber-cyan)]/30 hover:bg-[var(--cyber-cyan)]/10"
                title="Authorize with OAuth"
              >
                {#if isOAuthLoading}
                  <RefreshCwIcon class="h-3 w-3 animate-spin mr-1" />
                {:else}
                  <KeyIcon class="h-3 w-3 mr-1" />
                {/if}
                Authorize
              </Button>
            {:else if sessionStatus === "authorized"}
              <Button 
                variant="ghost" 
                size="sm"
                onclick={() => handleOAuthRevoke(server)}
                disabled={isOAuthLoading}
                class="h-7 w-7 p-0 text-muted-foreground hover:text-[var(--cyber-red)]"
                title="Revoke authorization"
              >
                {#if isOAuthLoading}
                  <RefreshCwIcon class="h-3 w-3 animate-spin" />
                {:else}
                  <LogOutIcon class="h-3 w-3" />
                {/if}
              </Button>
            {/if}
            <Button 
              variant="ghost" 
              size="sm"
              onclick={() => handleTest(server)}
              disabled={testing === server.id || !mcpStatus?.enabled}
              class="h-7 w-7 p-0"
              title="Test connection"
            >
              {#if testing === server.id}
                <RefreshCwIcon class="h-3 w-3 animate-spin" />
              {:else}
                <PlayIcon class="h-3 w-3" />
              {/if}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onclick={() => openEditDialog(server)}
              class="h-7 w-7 p-0"
              title="Edit"
            >
              <EditIcon class="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onclick={() => { serverToDelete = server; showDeleteDialog = true; }}
              class="h-7 w-7 p-0 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
              title="Delete"
            >
              <TrashIcon class="h-3 w-3" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Dialog.Root bind:open={showAddDialog}>
  <Dialog.Content class="sm:max-w-lg cyber-card border-[var(--cyber-cyan)]/30 max-h-[85vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-cyan)]">
        {editingServer ? "[edit_server]" : "[add_server]"}
      </Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Configure an MCP server for AI tool access.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4 py-4">
      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Name *</Label>
        <Input 
          bind:value={formName}
          placeholder="my-mcp-server"
          class="font-mono bg-background/50 border-border/50"
        />
      </div>

      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Description</Label>
        <Input 
          bind:value={formDescription}
          placeholder="What this server does..."
          class="font-mono bg-background/50 border-border/50"
        />
      </div>

      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Type</Label>
        <Select.Root 
          type="single"
          value={formType}
          onValueChange={(v) => { if (v) formType = v as McpServerType; }}
        >
          <Select.Trigger class="font-mono text-sm bg-background/50 border-border/50">
            {serverTypes.find(t => t.value === formType)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each serverTypes as type}
              <Select.Item value={type.value} label={type.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      {#if formType === "STDIO"}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Command</Label>
          <Input 
            bind:value={formCommand}
            placeholder="npx, uvx, node, etc."
            class="font-mono bg-background/50 border-border/50"
          />
        </div>
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Arguments</Label>
          <Input 
            bind:value={formArgs}
            placeholder="-y @anthropic/mcp-server-exa"
            class="font-mono bg-background/50 border-border/50"
          />
          <p class="text-xs text-muted-foreground font-mono">Space-separated arguments</p>
        </div>
      {:else}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">URL</Label>
          <Input 
            bind:value={formUrl}
            placeholder="https://api.example.com/mcp"
            class="font-mono bg-background/50 border-border/50"
          />
        </div>
      {/if}

      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Authentication</Label>
        <Select.Root 
          type="single"
          value={formAuthType}
          onValueChange={(v) => { if (v) formAuthType = v as McpAuthType; }}
        >
          <Select.Trigger class="font-mono text-sm bg-background/50 border-border/50">
            {authTypes.find(t => t.value === formAuthType)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each authTypes as type}
              <Select.Item value={type.value} label={type.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      {#if formAuthType === "api_key"}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">API Key</Label>
          <Input 
            type="password"
            bind:value={formApiKey}
            placeholder="sk-..."
            class="font-mono bg-background/50 border-border/50"
          />
        </div>
      {:else if formAuthType === "bearer_token"}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Bearer Token</Label>
          <Input 
            type="password"
            bind:value={formBearerToken}
            placeholder="your-token"
            class="font-mono bg-background/50 border-border/50"
          />
        </div>
      {/if}

      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Environment Variables</Label>
        <textarea 
          bind:value={formEnvVars}
          placeholder="KEY=value&#10;ANOTHER_KEY=another_value"
          class="w-full h-24 p-3 text-sm font-mono border border-border/50 rounded bg-background/50 resize-y
                 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
        ></textarea>
        <p class="text-xs text-muted-foreground font-mono">One per line: KEY=value</p>
      </div>
    </div>
    <Dialog.Footer>
      <Button 
        variant="outline" 
        onclick={() => { showAddDialog = false; resetForm(); }}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button 
        onclick={handleSave}
        disabled={saving || !formName.trim()}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
      >
        {#if saving}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {saving ? "Saving..." : editingServer ? "Update" : "Create"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={showDeleteDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-red)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-red)]">[delete_server]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Are you sure you want to delete "{serverToDelete?.name}"? This action cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button 
        variant="outline" 
        onclick={() => { showDeleteDialog = false; serverToDelete = null; }}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button 
        onclick={handleDelete}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/90 text-[var(--cyber-red-foreground)]"
      >
        Delete
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
