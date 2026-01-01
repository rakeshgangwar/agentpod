<script lang="ts">
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Settings, PlusCircle } from "@lucide/svelte";
  import { 
    isPermissionGranted, 
    requestPermission, 
    sendNotification 
  } from "@tauri-apps/plugin-notification";
  import { connection, disconnect, testConnection } from "$lib/stores/connection.svelte";
  import { auth } from "$lib/stores/auth.svelte";
  import { sandboxes, fetchSandboxes } from "$lib/stores/sandboxes.svelte";
  import { 
    settings, 
    initSettings, 
    loadProviders,
    setAutoRefreshInterval,
    setInAppNotifications,
    setSystemNotifications,
    exportSettingsJson,
    importSettingsJson,
    resetSettings 
  } from "$lib/stores/settings.svelte";
  import { checkIsAdmin } from "$lib/api/admin";
  import type { 
    PermissionLevel, 
    PermissionSettings, 
    UserOpencodeSettings,
    UserOpencodeFile 
  } from "$lib/api/tauri";
  import { 
    getUserOpencodeConfig, 
    updateUserOpencodeSettings,
    updateUserAgentsMd,
    upsertUserOpencodeFile,
    deleteUserOpencodeFile
  } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import * as Select from "$lib/components/ui/select";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Dialog from "$lib/components/ui/dialog";
  import { InlineTabs, type InlineTab } from "$lib/components/ui/inline-tabs";
  import LlmProvidersSettings from "$lib/components/llm-providers-settings.svelte";
  import ThemeSettings from "$lib/components/theme-settings.svelte";
  import VoiceSettings from "$lib/components/voice-settings.svelte";
  import McpSettings from "$lib/components/mcp-settings.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import type { Tab } from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  
  // Icons
  import PlugIcon from "@lucide/svelte/icons/plug";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import BrainIcon from "@lucide/svelte/icons/brain";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import MicIcon from "@lucide/svelte/icons/mic";
  import InfoIcon from "@lucide/svelte/icons/info";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import ServerIcon from "@lucide/svelte/icons/server";

  // Back navigation helper - uses browser history for proper back behavior
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/");
    }
  }

  // Initialization flags to prevent duplicate effect executions
  let settingsInitialized = $state(false);
  let opencodeConfigInitialized = $state(false);
  
  // Admin status
  let isAdmin = $state(false);
  let adminCheckDone = $state(false);

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Initialize settings, providers, sandboxes, and check admin status (runs once)
  $effect(() => {
    if (connection.isConnected && !settingsInitialized) {
      settingsInitialized = true;
      initSettings();
      loadProviders();
      if (sandboxes.list.length === 0) {
        fetchSandboxes();
      }
      // Check admin status
      checkIsAdmin().then(result => {
        isAdmin = result;
        adminCheckDone = true;
      }).catch(() => {
        isAdmin = false;
        adminCheckDone = true;
      });
    }
  });

  // Active tab state
  let activeTab = $state("connection");
  
  // OpenCode sub-tab state
  let opencodeSubTab = $state<"permissions" | "instructions" | "custom">("permissions");

  // Settings state
  let isTesting = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let importInput = $state("");
  let showImportDialog = $state(false);

  // OpenCode Config state
  let opencodeConfigLoading = $state(false);
  let opencodeConfigSaving = $state(false);
  let opencodeConfigError = $state<string | null>(null);
  let permissionSettings = $state<PermissionSettings>({});
  
  // AGENTS.md state
  let agentsMd = $state("");
  let agentsMdOriginal = $state("");
  let agentsMdSaving = $state(false);
  
  // Config files state
  let configFiles = $state<UserOpencodeFile[]>([]);
  let selectedFileType = $state<"agent" | "command" | "tool" | "plugin">("agent");
  let selectedFile = $state<UserOpencodeFile | null>(null);
  let editingFileContent = $state("");
  let fileSaving = $state(false);
  
  // New file dialog state
  let showNewFileDialog = $state(false);
  let newFileName = $state("");
  let newFileType = $state<"agent" | "command" | "tool" | "plugin">("agent");
  let newFileExtension = $state<"md" | "ts" | "js">("md");
  let newFileContent = $state("");
  let newFileCreating = $state(false);
  
  // Delete confirmation state
  let showDeleteDialog = $state(false);
  let fileToDelete = $state<UserOpencodeFile | null>(null);
  let fileDeleting = $state(false);
  
  // Load OpenCode config on mount (runs once)
  $effect(() => {
    if (connection.isConnected && auth.user && !opencodeConfigInitialized) {
      opencodeConfigInitialized = true;
      loadOpencodeConfig();
    }
  });

  async function loadOpencodeConfig() {
    if (!auth.user) return;
    opencodeConfigLoading = true;
    opencodeConfigError = null;
    try {
      const config = await getUserOpencodeConfig(auth.user.id);
      permissionSettings = config.settings.permission || {};
      agentsMd = config.agents_md || "";
      agentsMdOriginal = agentsMd;
      configFiles = config.files || [];
    } catch (e) {
      const error = e as Error;
      opencodeConfigError = error.message || "Failed to load OpenCode configuration";
      console.error("Failed to load OpenCode config:", e);
    } finally {
      opencodeConfigLoading = false;
    }
  }
  
  // AGENTS.md handlers
  async function handleSaveAgentsMd() {
    if (!auth.user) return;
    agentsMdSaving = true;
    try {
      await updateUserAgentsMd(auth.user.id, agentsMd);
      agentsMdOriginal = agentsMd;
      toast.success("AGENTS.md saved successfully");
    } catch (e) {
      const error = e as Error;
      toast.error("Failed to save AGENTS.md", { description: error.message });
    } finally {
      agentsMdSaving = false;
    }
  }
  
  function handleResetAgentsMd() {
    agentsMd = agentsMdOriginal;
  }
  
  function handleSelectFile(file: UserOpencodeFile) {
    selectedFile = file;
    editingFileContent = file.content;
  }
  
  async function handleSaveFile() {
    if (!selectedFile || !auth.user) return;
    fileSaving = true;
    try {
      await upsertUserOpencodeFile(
        auth.user.id,
        selectedFile.type as "agent" | "command" | "tool" | "plugin",
        selectedFile.name,
        editingFileContent,
        selectedFile.extension
      );
      // Update local state
      selectedFile = { ...selectedFile, content: editingFileContent };
      configFiles = configFiles.map(f => 
        f.name === selectedFile!.name && f.type === selectedFile!.type 
          ? { ...f, content: editingFileContent }
          : f
      );
      toast.success(`${selectedFile.name}.${selectedFile.extension} saved`);
    } catch (e) {
      const error = e as Error;
      toast.error("Failed to save file", { description: error.message });
    } finally {
      fileSaving = false;
    }
  }
  
  function handleCloseFile() {
    selectedFile = null;
    editingFileContent = "";
  }
  
  // New file handlers
  function handleOpenNewFileDialog() {
    newFileName = "";
    newFileType = selectedFileType;
    newFileExtension = selectedFileType === "agent" || selectedFileType === "command" ? "md" : "ts";
    newFileContent = getDefaultFileContent(newFileType);
    showNewFileDialog = true;
  }
  
  function getDefaultFileContent(type: "agent" | "command" | "tool" | "plugin"): string {
    switch (type) {
      case "agent":
        return `---
description: My custom agent
mode: subagent
model: anthropic/claude-sonnet-4-5
temperature: 0.7
---

You are a helpful assistant.

## Guidelines
- Be concise and helpful
- Focus on the task at hand
`;
      case "command":
        return `---
description: My custom command
---

# Instructions

This command does the following:

1. First step
2. Second step
`;
      case "tool":
      case "plugin":
        return `// ${type === "tool" ? "Custom tool" : "Custom plugin"} implementation
export default {
  name: "my-${type}",
  description: "A custom ${type}",
  
  async execute(args: unknown) {
    // Implementation here
    return { success: true };
  }
};
`;
      default:
        return "";
    }
  }
  
  async function handleCreateFile() {
    if (!newFileName.trim()) {
      toast.error("File name is required");
      return;
    }
    
    // Validate filename (alphanumeric, dashes, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(newFileName)) {
      toast.error("Invalid file name", { 
        description: "Use only letters, numbers, dashes, and underscores" 
      });
      return;
    }
    
    if (!auth.user) return;
    newFileCreating = true;
    try {
      const file = await upsertUserOpencodeFile(
        auth.user.id,
        newFileType,
        newFileName,
        newFileContent,
        newFileExtension
      );
      configFiles = [...configFiles, file];
      showNewFileDialog = false;
      toast.success(`${newFileName}.${newFileExtension} created`);
      // Select the new file
      handleSelectFile(file);
    } catch (e) {
      const error = e as Error;
      toast.error("Failed to create file", { description: error.message });
    } finally {
      newFileCreating = false;
    }
  }
  
  // Delete handlers
  function handleDeleteFile(file: UserOpencodeFile) {
    fileToDelete = file;
    showDeleteDialog = true;
  }
  
  async function handleConfirmDelete() {
    if (!fileToDelete || !auth.user) return;
    fileDeleting = true;
    try {
      await deleteUserOpencodeFile(auth.user.id, fileToDelete.type as "agent" | "command" | "tool" | "plugin", fileToDelete.name);
      configFiles = configFiles.filter(f => 
        !(f.name === fileToDelete!.name && f.type === fileToDelete!.type)
      );
      if (selectedFile?.name === fileToDelete.name && selectedFile?.type === fileToDelete.type) {
        selectedFile = null;
        editingFileContent = "";
      }
      toast.success(`${fileToDelete.name}.${fileToDelete.extension} deleted`);
      showDeleteDialog = false;
      fileToDelete = null;
    } catch (e) {
      const error = e as Error;
      toast.error("Failed to delete file", { description: error.message });
    } finally {
      fileDeleting = false;
    }
  }
  
  // Filter files by type
  function getFilteredFiles(type: "agent" | "command" | "tool" | "plugin"): UserOpencodeFile[] {
    return configFiles.filter(f => f.type === type);
  }
  
  // File type tabs config
  const fileTypeTabsConfig = [
    { value: "agent", label: "Agents", description: "Custom AI agent definitions" },
    { value: "command", label: "Commands", description: "Custom slash commands" },
    { value: "tool", label: "Tools", description: "Custom tool implementations" },
    { value: "plugin", label: "Plugins", description: "Custom plugins" },
  ] as const;

  // Convert to InlineTab format with dynamic counts
  const fileTypeTabs = $derived<InlineTab[]>(
    fileTypeTabsConfig.map((tab) => ({
      value: tab.value,
      label: tab.label,
      count: getFilteredFiles(tab.value).length,
    }))
  );

  // Get tab description helper
  function getFileTypeDescription(value: string): string {
    return fileTypeTabsConfig.find(t => t.value === value)?.description ?? "";
  }

  async function handlePermissionChange(tool: keyof PermissionSettings, value: PermissionLevel) {
    if (!auth.user) return;
    opencodeConfigSaving = true;
    opencodeConfigError = null;
    
    // Update local state immediately for responsive UI
    const previousValue = permissionSettings[tool];
    permissionSettings = { ...permissionSettings, [tool]: value };
    
    try {
      const updatedSettings: UserOpencodeSettings = {
        permission: permissionSettings
      };
      await updateUserOpencodeSettings(auth.user.id, updatedSettings);
      toast.success(`${tool} permission updated to "${value}"`);
    } catch (e) {
      // Revert on error
      permissionSettings = { ...permissionSettings, [tool]: previousValue };
      const error = e as Error;
      opencodeConfigError = error.message || "Failed to save permission settings";
      toast.error("Failed to save permission settings", {
        description: opencodeConfigError
      });
      console.error("Failed to save permission settings:", e);
    } finally {
      opencodeConfigSaving = false;
    }
  }

  // Permission tool descriptions
  const permissionTools = [
    { key: "bash" as const, name: "Bash", description: "Execute shell commands" },
    { key: "write" as const, name: "Write", description: "Create new files" },
    { key: "edit" as const, name: "Edit", description: "Modify existing files" },
    { key: "webfetch" as const, name: "Web Fetch", description: "Fetch content from URLs" },
    { key: "mcp" as const, name: "MCP", description: "Use MCP server tools" },
  ];

  const permissionLevels: { value: PermissionLevel; label: string }[] = [
    { value: "allow", label: "Allow" },
    { value: "ask", label: "Ask" },
    { value: "deny", label: "Deny" },
  ];

  function getPermissionLabel(level: PermissionLevel | undefined): string {
    if (!level) return "Ask";
    return permissionLevels.find(p => p.value === level)?.label ?? "Ask";
  }

  async function handleDisconnect() {
    // Navigate first to avoid flash of initializing screen
    goto("/setup");
    await disconnect();
  }

  async function handleTestConnection() {
    isTesting = true;
    testResult = null;
    
    const success = await testConnection();
    
    testResult = {
      success,
      message: success ? "Connection successful!" : (connection.error || "Connection failed"),
    };
    
    isTesting = false;
  }

  async function handleExport() {
    const json = await exportSettingsJson();
    if (json) {
      try {
        // Create and trigger download
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "agentpod-settings.json";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        toast.success("Settings exported successfully");
      } catch (e) {
        toast.error("Failed to export settings");
        console.error("Export error:", e);
      }
    }
  }

  async function handleImport() {
    if (!importInput.trim()) return;
    
    const success = await importSettingsJson(importInput);
    if (success) {
      showImportDialog = false;
      importInput = "";
      toast.success("Settings imported successfully");
    } else {
      toast.error("Failed to import settings", {
        description: settings.error || "Invalid settings file",
      });
    }
  }
  
  async function handleReset() {
    const success = await resetSettings();
    if (success) {
      toast.success("Settings reset to defaults");
    }
  }

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      importInput = e.target?.result as string || "";
    };
    reader.readAsText(file);
  }

  // Main settings tabs configuration
  const settingsTabs: Tab[] = [
    { id: "connection", label: "Connection", icon: PlugIcon },
    { id: "appearance", label: "Appearance", icon: PaletteIcon },
    { id: "ai-models", label: "AI Models", icon: BrainIcon },
    { id: "voice", label: "Voice", icon: MicIcon },
    { id: "opencode", label: "OpenCode", icon: TerminalIcon },
    { id: "mcp", label: "MCP Servers", icon: ServerIcon },
    { id: "about", label: "About", icon: InfoIcon },
  ];
</script>

<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <!-- Header (fixed at top) -->
  <PageHeader
    title="Settings"
    icon={SettingsIcon}
    subtitle="Manage your connection, preferences, and AI configuration"
    tabs={settingsTabs}
    activeTab={activeTab}
    onTabChange={(tab) => activeTab = tab}
    sticky={false}
    collapsible={true}
  >
    {#snippet leading()}
      <Button 
        variant="ghost" 
        size="icon"
        onclick={goBack}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
      >
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>
    {/snippet}
    {#snippet actions()}
      <ThemeToggle />
    {/snippet}
  </PageHeader>

  <!-- Scrollable content area -->
  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6 animate-fade-in">
    <!-- Tab Content -->
    {#if activeTab === "connection"}
        <div class="grid gap-6 md:grid-cols-2">
          <!-- Connection Status -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [connection_status]
              </h3>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-xs text-muted-foreground font-mono">
                Your current API connection details
              </p>
              <div class="space-y-1">
                <span class="text-[var(--cyber-cyan)] text-xs font-mono">API_URL:</span>
                <p class="font-mono text-sm break-all bg-background/50 p-2 rounded border border-border/30">{connection.apiUrl}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[var(--cyber-cyan)] text-xs font-mono">STATUS:</span>
                <div class="flex items-center gap-2">
                  <span class="status-indicator status-running">
                    <span class="status-dot animate-pulse-dot"></span>
                    Connected
                  </span>
                </div>
              </div>
              {#if testResult}
                <div class="text-sm p-3 rounded font-mono border {testResult.success ? 'bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border-[var(--cyber-emerald)]/30' : 'bg-[var(--cyber-red)]/10 text-[var(--cyber-red)] border-[var(--cyber-red)]/30'}">
                  {testResult.message}
                </div>
              {/if}
            </div>
            <div class="px-4 pb-4 flex gap-2">
              <Button 
                variant="outline" 
                onclick={handleTestConnection}
                disabled={isTesting}
                class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                {#if isTesting}
                  <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                {/if}
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button 
                variant="outline"
                onclick={handleDisconnect}
                class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-red)]/50 text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
              >
                Disconnect
              </Button>
            </div>
          </div>

          <!-- Connection Info -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-2">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [connection_details]
              </h3>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-xs text-muted-foreground font-mono">
                Information about your management API
              </p>
              <div class="p-4 bg-background/50 rounded border border-border/30 space-y-3 font-mono text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Protocol</span>
                  <span class="px-2 py-0.5 rounded text-xs text-[var(--cyber-emerald)] bg-[color-mix(in_oklch,var(--cyber-emerald)_10%,transparent)] border border-[color-mix(in_oklch,var(--cyber-emerald)_30%,transparent)]">
                    {connection.apiUrl?.startsWith("https") ? "HTTPS" : "HTTP"}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Authentication</span>
                  <span class="text-foreground">Bearer Token</span>
                </div>
              </div>
              <p class="text-xs text-muted-foreground font-mono">
                Credentials stored securely on this device. Disconnect to change API.
              </p>
            </div>
          </div>
          
          <!-- Admin Panel Link (only visible to admins) -->
          {#if adminCheckDone && isAdmin}
            <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-3 md:col-span-2">
              <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
                <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-magenta)]">
                  [admin_panel]
                </h3>
              </div>
              <div class="p-4">
                <div class="flex items-center justify-between">
                  <div class="space-y-1">
                    <p class="text-sm font-mono">Administration</p>
                    <p class="text-xs text-muted-foreground font-mono">
                      Manage users, view audit logs, and configure system settings
                    </p>
                  </div>
                  <Button 
                    onclick={() => goto("/admin")}
                    class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-magenta)] hover:bg-[var(--cyber-magenta)]/90 text-[var(--cyber-magenta-foreground)]"
                  >
                    <ShieldIcon class="h-4 w-4 mr-2" />
                    Open Admin Panel
                  </Button>
                </div>
              </div>
            </div>
          {/if}
        </div>
    {:else if activeTab === "appearance"}
      <!-- Appearance Tab -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [theme_appearance]
          </h3>
        </div>
        <div class="p-4 space-y-4">
          <p class="text-xs text-muted-foreground font-mono">
            Customize the look and feel of CodeOpen with theme presets
          </p>
          <ThemeSettings />
        </div>
      </div>
    {:else if activeTab === "ai-models"}
      <!-- AI Models Tab -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [ai_model_providers]
          </h3>
        </div>
        <div class="p-4 space-y-4">
          <LlmProvidersSettings />
        </div>
      </div>
    {:else if activeTab === "voice"}
      <!-- Voice Tab -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [voice_input]
          </h3>
        </div>
        <div class="p-4">
          <VoiceSettings />
        </div>
      </div>
    {:else if activeTab === "opencode"}
      <!-- OpenCode Tab with Sub-tabs -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up">
        <!-- Sub-tabs Navigation -->
        <div class="border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <div class="flex">
            <button
              onclick={() => opencodeSubTab = "permissions"}
              class="flex-1 py-3 px-4 font-mono text-xs uppercase tracking-wider transition-all border-b-2
                     {opencodeSubTab === 'permissions' 
                       ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                       : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
            >
              Permissions
            </button>
            <button
              onclick={() => opencodeSubTab = "instructions"}
              class="flex-1 py-3 px-4 font-mono text-xs uppercase tracking-wider transition-all border-b-2
                     {opencodeSubTab === 'instructions' 
                       ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                       : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
            >
              Instructions
              {#if agentsMd !== agentsMdOriginal}
                <span class="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--cyber-amber)] inline-block"></span>
              {/if}
            </button>
            <button
              onclick={() => opencodeSubTab = "custom"}
              class="flex-1 py-3 px-4 font-mono text-xs uppercase tracking-wider transition-all border-b-2
                     {opencodeSubTab === 'custom' 
                       ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                       : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
            >
              Custom
              {#if configFiles.length > 0}
                <span class="ml-1.5 text-xs bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)] px-1.5 py-0.5 rounded-full">
                  {configFiles.length}
                </span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Sub-tab Content -->
        <div class="p-4">
          {#if opencodeSubTab === "permissions"}
            <!-- Permissions Content -->
            <div class="space-y-4">
              <div>
                <h3 class="font-mono text-sm font-medium text-[var(--cyber-cyan)] mb-1">[tool_permissions]</h3>
                <p class="text-xs text-muted-foreground font-mono">
                  Control what actions OpenCode can perform without asking for permission.
                  These settings apply to all your sandboxes.
                </p>
              </div>
              {#if opencodeConfigLoading}
                <div class="flex items-center justify-center py-8">
                  <div class="relative w-6 h-6">
                    <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                    <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                  </div>
                  <span class="ml-3 text-muted-foreground font-mono text-sm">Loading configuration...</span>
                </div>
              {:else if opencodeConfigError}
                <div class="p-4 rounded border bg-[var(--cyber-red)]/10 border-[var(--cyber-red)]/30 text-[var(--cyber-red)]">
                  <p class="font-mono text-sm font-medium">Failed to load configuration</p>
                  <p class="text-xs font-mono mt-1">{opencodeConfigError}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onclick={loadOpencodeConfig}
                    class="mt-3 font-mono text-xs uppercase tracking-wider"
                  >
                    Retry
                  </Button>
                </div>
              {:else}
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {#each permissionTools as tool}
                    <div class="flex items-center justify-between gap-3 p-3 border border-border/30 rounded bg-background/50 hover:border-[var(--cyber-cyan)]/30 transition-colors">
                      <div class="space-y-0.5 min-w-0 flex-1">
                        <Label class="font-mono text-sm">{tool.name}</Label>
                        <p class="text-xs text-muted-foreground font-mono truncate">{tool.description}</p>
                      </div>
                      <Select.Root 
                        type="single"
                        value={permissionSettings[tool.key] || "ask"}
                        onValueChange={(v) => {
                          if (v) handlePermissionChange(tool.key, v as PermissionLevel);
                        }}
                        disabled={opencodeConfigSaving}
                      >
                        <Select.Trigger class="w-20 shrink-0 font-mono text-xs bg-background/50 border-border/50 [&>span]:truncate">
                          {getPermissionLabel(permissionSettings[tool.key])}
                        </Select.Trigger>
                        <Select.Content align="end">
                          {#each permissionLevels as level}
                            <Select.Item value={level.value} label={level.label} />
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </div>
                  {/each}
                </div>
                
                <div class="p-3 bg-background/50 rounded border border-border/30 font-mono text-xs">
                  <span class="text-[var(--cyber-emerald)]">Allow:</span> Execute automatically · 
                  <span class="text-[var(--cyber-amber)]">Ask:</span> Request permission · 
                  <span class="text-[var(--cyber-red)]">Deny:</span> Never allow
                </div>
              {/if}
            </div>

          {:else if opencodeSubTab === "instructions"}
            <!-- AGENTS.md Instructions Content -->
            <div class="space-y-4">
              <div>
                <h3 class="font-mono text-sm font-medium text-[var(--cyber-cyan)] mb-1">[global_instructions] AGENTS.md</h3>
                <p class="text-xs text-muted-foreground font-mono">
                  Define global instructions and context for OpenCode that apply to all your sandboxes.
                </p>
              </div>
              {#if opencodeConfigLoading}
                <div class="flex items-center justify-center py-8">
                  <div class="relative w-6 h-6">
                    <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                    <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                  </div>
                  <span class="ml-3 text-muted-foreground font-mono text-sm">Loading...</span>
                </div>
              {:else}
                <textarea 
                  bind:value={agentsMd}
                  placeholder="# My Global Instructions&#10;&#10;Add your personal coding preferences, guidelines, and context here..."
                  class="w-full h-64 p-3 text-sm font-mono border border-border/50 rounded bg-background/50 resize-y
                         focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
                ></textarea>
                <p class="text-xs text-muted-foreground font-mono">
                  Use Markdown formatting. These instructions will be included in all your OpenCode sessions.
                </p>
                <div class="flex gap-2 pt-2">
                  <Button 
                    onclick={handleSaveAgentsMd}
                    disabled={agentsMdSaving || agentsMd === agentsMdOriginal}
                    class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
                  >
                    {#if agentsMdSaving}
                      <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                    {/if}
                    {agentsMdSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button 
                    variant="outline"
                    onclick={handleResetAgentsMd}
                    disabled={agentsMd === agentsMdOriginal}
                    class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-amber)] hover:text-[var(--cyber-amber)]"
                  >
                    Discard Changes
                  </Button>
                </div>
              {/if}
            </div>

          {:else if opencodeSubTab === "custom"}
            <!-- Custom Agents/Commands/Tools/Plugins Content -->
            <div class="space-y-4">
              <!-- Header -->
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-mono text-sm font-medium text-[var(--cyber-cyan)] mb-1">[custom_extensions]</h3>
                  <p class="text-xs text-muted-foreground font-mono">
                    Create and manage custom agents, commands, tools, and plugins.
                  </p>
                </div>
                <Button 
                  onclick={handleOpenNewFileDialog} 
                  size="sm"
                  class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]"
                >
                  + New File
                </Button>
              </div>
              
              {#if opencodeConfigLoading}
                <div class="flex items-center justify-center py-8">
                  <div class="relative w-6 h-6">
                    <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                    <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                  </div>
                  <span class="ml-3 text-muted-foreground font-mono text-sm">Loading files...</span>
                </div>
              {:else}
                <!-- Split Panel Layout -->
                <div class="flex flex-col md:flex-row gap-4" style="height: calc(100vh - 380px); min-height: 400px;">
                  <!-- Left Panel: File List with Tabs -->
                  <div class="w-full md:w-2/5 flex flex-col min-h-0 border border-border/30 rounded bg-background/30 overflow-hidden">
                    <!-- Tabs inside left panel -->
                    <div class="p-2 border-b border-border/30 bg-background/50 shrink-0">
                      <InlineTabs 
                        tabs={fileTypeTabs} 
                        bind:value={selectedFileType}
                      />
                    </div>
                    
                    <!-- File list content -->
                    {#each fileTypeTabsConfig as tab}
                      {#if selectedFileType === tab.value}
                        <div class="px-3 py-2 border-b border-border/30 shrink-0">
                          <p class="text-xs text-muted-foreground font-mono">{tab.description}</p>
                        </div>
                        <div class="flex-1 overflow-y-auto p-3">
                            {#if getFilteredFiles(tab.value).length === 0}
                              <div class="text-center py-8 border-2 border-dashed border-border/30 rounded bg-background/30">
                                <p class="text-muted-foreground font-mono text-sm">No {tab.label.toLowerCase()} yet</p>
                                <Button 
                                  variant="link" 
                                  onclick={() => {
                                    newFileType = tab.value;
                                    handleOpenNewFileDialog();
                                  }}
                                  class="text-[var(--cyber-cyan)] font-mono text-sm"
                                >
                                  Create your first {tab.value}
                                </Button>
                              </div>
                            {:else}
                              <div class="space-y-2">
                                {#each getFilteredFiles(tab.value) as file}
                                  <div 
                                    class="flex items-center justify-between p-3 border border-border/30 rounded bg-background/50 
                                           hover:border-[var(--cyber-cyan)]/30 cursor-pointer transition-colors
                                           {selectedFile?.name === file.name && selectedFile?.type === file.type ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' : ''}"
                                    onclick={() => handleSelectFile(file)}
                                    onkeydown={(e) => e.key === 'Enter' && handleSelectFile(file)}
                                    tabindex="0"
                                    role="button"
                                  >
                                    <div class="flex items-center gap-3">
                                      <span class="text-lg font-mono">
                                        {#if file.type === "agent"}
                                          <span class="text-[var(--cyber-cyan)]">λ</span>
                                        {:else if file.type === "command"}
                                          <span class="text-[var(--cyber-magenta)]">/</span>
                                        {:else if file.type === "tool"}
                                          <Settings class="h-4 w-4 text-[var(--cyber-amber)]" />
                                        {:else}
                                          <PlusCircle class="h-4 w-4 text-[var(--cyber-emerald)]" />
                                        {/if}
                                      </span>
                                      <div>
                                        <p class="font-mono text-sm">{file.name}</p>
                                        <p class="text-xs text-muted-foreground font-mono">{file.name}.{file.extension}</p>
                                      </div>
                                    </div>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onclick={(e: MouseEvent) => {
                                        e.stopPropagation();
                                        handleDeleteFile(file);
                                      }}
                                      class="font-mono text-xs text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      {/each}
                    </div>
                    
                    <!-- Right Panel: Editor -->
                    <div class="w-full md:w-3/5 flex flex-col min-h-0 border border-border/30 rounded overflow-hidden {selectedFile ? 'border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5' : 'bg-background/30'}">
                      {#if selectedFile}
                        <div class="p-3 border-b border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/10 flex items-center justify-between shrink-0">
                          <h4 class="font-mono text-sm text-[var(--cyber-cyan)]">
                            {selectedFile.name}.{selectedFile.extension}
                          </h4>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onclick={handleCloseFile}
                            class="font-mono text-xs hover:text-[var(--cyber-cyan)] h-7"
                          >
                            Close
                          </Button>
                        </div>
                        <div class="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
                          <textarea 
                            bind:value={editingFileContent}
                            class="w-full flex-1 min-h-0 p-3 text-sm font-mono border border-border/50 rounded bg-background/50 resize-none
                                   focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
                          ></textarea>
                        </div>
                        <div class="p-3 border-t border-[var(--cyber-cyan)]/30 flex gap-2 shrink-0">
                          <Button 
                            onclick={handleSaveFile}
                            disabled={fileSaving || editingFileContent === selectedFile.content}
                            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
                          >
                            {#if fileSaving}
                              <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                            {/if}
                            {fileSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button 
                            variant="outline"
                            onclick={() => editingFileContent = selectedFile?.content || ""}
                            disabled={editingFileContent === selectedFile.content}
                            class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-amber)] hover:text-[var(--cyber-amber)]"
                          >
                            Reset
                          </Button>
                        </div>
                      {:else}
                        <div class="flex-1 flex items-center justify-center text-center p-6">
                          <div class="space-y-3">
                            <div class="mx-auto w-12 h-12 rounded-full bg-muted/50 border border-border/30 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </div>
                            <div>
                              <p class="font-mono text-sm text-muted-foreground">Select a file to edit</p>
                              <p class="text-xs text-muted-foreground/70 font-mono mt-1">Click on any item in the list</p>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                
                <p class="text-xs text-muted-foreground font-mono pt-3 border-t border-border/30">
                  Changes require container restart to take effect.
                </p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {:else if activeTab === "mcp"}
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [mcp_configuration]
          </h3>
        </div>
        <div class="p-4">
          <McpSettings />
        </div>
      </div>
    {:else if activeTab === "about"}
      <!-- About Tab -->
      <div class="grid gap-6 md:grid-cols-2">
          <!-- Preferences -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [preferences]
              </h3>
            </div>
            <div class="p-4 space-y-6">
              <p class="text-xs text-muted-foreground font-mono">
                General application settings
              </p>
              <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                  <Label for="in-app-notifications" class="font-mono text-sm">In-App Notifications</Label>
                  <p class="text-xs text-muted-foreground font-mono">Show toast notifications</p>
                </div>
                <Switch 
                  id="in-app-notifications"
                  checked={settings.inAppNotifications}
                  onCheckedChange={async (checked) => {
                    await setInAppNotifications(checked);
                    if (checked) {
                      toast.success("In-app notifications enabled");
                    }
                  }}
                />
              </div>

              <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                  <Label for="system-notifications" class="font-mono text-sm">System Notifications</Label>
                  <p class="text-xs text-muted-foreground font-mono">OS notifications when in background</p>
                </div>
                <Switch 
                  id="system-notifications"
                  checked={settings.systemNotifications}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      let permissionGranted = await isPermissionGranted();
                      if (!permissionGranted) {
                        const permission = await requestPermission();
                        permissionGranted = permission === "granted";
                      }
                      
                      if (permissionGranted) {
                        await setSystemNotifications(true);
                        sendNotification({
                          title: "CodeOpen",
                          body: "System notifications enabled!",
                        });
                      } else {
                        toast.error("Permission denied", {
                          description: "Please enable notifications in system settings",
                        });
                      }
                    } else {
                      await setSystemNotifications(false);
                      toast.info("System notifications disabled");
                    }
                  }}
                />
              </div>

              <div class="space-y-2">
                <Label for="refresh-interval" class="font-mono text-sm">Auto-refresh Interval</Label>
                <div class="flex items-center gap-2">
                  <Input 
                    id="refresh-interval"
                    type="number" 
                    min="0" 
                    max="300"
                    value={settings.autoRefreshInterval}
                    onchange={(e: Event) => {
                      const target = e.target as HTMLInputElement;
                      setAutoRefreshInterval(parseInt(target.value) || 0);
                    }}
                    class="w-24 font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
                  />
                  <span class="text-xs text-muted-foreground font-mono">seconds (0 = disabled)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Statistics -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-2">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [statistics]
              </h3>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-xs text-muted-foreground font-mono">
                Overview of your sandboxes
              </p>
              <div class="grid grid-cols-2 gap-3">
                <div class="text-center p-3 bg-background/50 rounded border border-border/30">
                  <p class="text-2xl font-bold font-mono">{sandboxes.count}</p>
                  <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Total</p>
                </div>
                <div class="text-center p-3 rounded border text-[var(--cyber-emerald)] bg-[color-mix(in_oklch,var(--cyber-emerald)_10%,transparent)] border-[color-mix(in_oklch,var(--cyber-emerald)_30%,transparent)]">
                  <p class="text-2xl font-bold font-mono">{sandboxes.running.length}</p>
                  <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Running</p>
                </div>
                <div class="text-center p-3 bg-background/50 rounded border border-border/30">
                  <p class="text-2xl font-bold font-mono">{sandboxes.stopped.length}</p>
                  <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Stopped</p>
                </div>
                <div class="text-center p-3 rounded border text-[var(--cyber-amber)] bg-[color-mix(in_oklch,var(--cyber-amber)_10%,transparent)] border-[color-mix(in_oklch,var(--cyber-amber)_30%,transparent)]">
                  <p class="text-2xl font-bold font-mono">{sandboxes.starting.length + sandboxes.stopping.length}</p>
                  <p class="text-xs text-muted-foreground font-mono uppercase tracking-wider">Transitioning</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Backup & Restore -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-3">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [backup_restore]
              </h3>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-xs text-muted-foreground font-mono">
                Export or import your settings for backup or transfer to another device.
              </p>
              
              {#if showImportDialog}
                <div class="space-y-3 p-3 border border-[var(--cyber-cyan)]/30 rounded bg-[var(--cyber-cyan)]/5">
                  <Label class="font-mono text-sm text-[var(--cyber-cyan)]">Import Settings</Label>
                  <input 
                    type="file" 
                    accept=".json"
                    onchange={handleFileUpload}
                    class="block w-full text-sm font-mono file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 
                           file:text-xs file:font-mono file:uppercase file:tracking-wider
                           file:bg-[var(--cyber-cyan)] file:text-[var(--cyber-cyan-foreground)] hover:file:bg-[var(--cyber-cyan)]/90"
                  />
                  <p class="text-xs text-muted-foreground font-mono">Or paste JSON:</p>
                  <textarea 
                    bind:value={importInput}
                    placeholder="Paste settings JSON here..."
                    class="w-full h-20 p-2 text-xs font-mono border border-border/50 rounded bg-background/50
                           focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
                  ></textarea>
                  <div class="flex gap-2">
                    <Button 
                      size="sm" 
                      onclick={handleImport} 
                      disabled={!importInput.trim()}
                      class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]"
                    >
                      Import
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onclick={() => { showImportDialog = false; importInput = ""; }}
                      class="font-mono text-xs uppercase tracking-wider border-border/50"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              {/if}
              
              {#if settings.error}
                <div class="text-sm p-3 rounded font-mono border bg-[var(--cyber-red)]/10 text-[var(--cyber-red)] border-[var(--cyber-red)]/30">
                  {settings.error}
                </div>
              {/if}
            </div>
            <div class="px-4 pb-4 flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                onclick={handleExport}
                class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                Export
              </Button>
              {#if !showImportDialog}
                <Button 
                  variant="outline" 
                  onclick={() => showImportDialog = true}
                  class="font-mono text-xs uppercase tracking-wider border-border/50 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
                >
                  Import
                </Button>
              {/if}
              <Button 
                variant="ghost" 
                onclick={handleReset}
                class="font-mono text-xs uppercase tracking-wider hover:text-[var(--cyber-amber)]"
              >
                Reset
              </Button>
            </div>
          </div>

          <!-- App Info -->
          <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-4">
            <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
              <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
                [about_agentpod]
              </h3>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-xs text-muted-foreground font-mono">
                Application information
              </p>
              <div class="space-y-3 font-mono text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Version</span>
                  <span class="px-2 py-0.5 rounded text-xs text-[var(--cyber-cyan)] bg-[color-mix(in_oklch,var(--cyber-cyan)_10%,transparent)] border border-[color-mix(in_oklch,var(--cyber-cyan)_30%,transparent)]">
                    0.1.0
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Platform</span>
                  <span>Desktop</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Built with</span>
                  <span>Tauri + Svelte</span>
                </div>
              </div>
              <p class="text-xs text-muted-foreground font-mono pt-3 border-t border-border/30">
                Portable Command Center for OpenCode - manage your AI-powered development environments from anywhere.
              </p>
            </div>
          </div>
        </div>
    {/if}
    </div>
  </div>
</main>

<!-- New File Dialog -->
<Dialog.Root bind:open={showNewFileDialog}>
  <Dialog.Content class="sm:max-w-lg cyber-card border-[var(--cyber-cyan)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-cyan)]">[create_new_file]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Create a new {newFileType} file that will be available in all your sandboxes.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4 py-4">
      <div class="space-y-2">
        <Label for="new-file-type" class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Type</Label>
        <Select.Root 
          type="single"
          value={newFileType}
          onValueChange={(v) => {
            if (v) {
              newFileType = v as typeof newFileType;
              newFileExtension = v === "agent" || v === "command" ? "md" : "ts";
              newFileContent = getDefaultFileContent(v as typeof newFileType);
            }
          }}
        >
          <Select.Trigger class="w-full font-mono text-sm bg-background/50 border-border/50">
            {fileTypeTabsConfig.find(t => t.value === newFileType)?.label ?? "Agent"}
          </Select.Trigger>
          <Select.Content>
            {#each fileTypeTabsConfig as tab}
              <Select.Item value={tab.value} label={tab.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      
      <div class="space-y-2">
        <Label for="new-file-name" class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Name</Label>
        <div class="flex items-center gap-2">
          <Input 
            id="new-file-name"
            bind:value={newFileName}
            placeholder="my-{newFileType}"
            class="flex-1 font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
          />
          <span class="text-muted-foreground font-mono text-sm">.{newFileExtension}</span>
        </div>
        <p class="text-xs text-muted-foreground font-mono">
          Use lowercase letters, numbers, dashes, and underscores only.
        </p>
      </div>
      
      {#if newFileType === "tool" || newFileType === "plugin"}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Extension</Label>
          <Select.Root 
            type="single"
            value={newFileExtension}
            onValueChange={(v) => {
              if (v) newFileExtension = v as typeof newFileExtension;
            }}
          >
            <Select.Trigger class="w-24 font-mono text-sm bg-background/50 border-border/50">
              .{newFileExtension}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="ts" label=".ts" />
              <Select.Item value="js" label=".js" />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      
      <div class="space-y-2">
        <Label class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Content</Label>
        <textarea 
          bind:value={newFileContent}
          class="w-full h-48 p-3 text-sm font-mono border border-border/50 rounded bg-background/50 resize-y
                 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] focus:outline-none"
        ></textarea>
      </div>
    </div>
    <Dialog.Footer>
      <Button 
        variant="outline" 
        onclick={() => showNewFileDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button 
        onclick={handleCreateFile}
        disabled={newFileCreating || !newFileName.trim()}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)] disabled:opacity-50"
      >
        {#if newFileCreating}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {newFileCreating ? "Creating..." : "Create"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={showDeleteDialog}>
  <Dialog.Content class="sm:max-w-md cyber-card border-[var(--cyber-red)]/30">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-red)]">[delete_file]</Dialog.Title>
      <Dialog.Description class="font-mono text-xs">
        Are you sure you want to delete "{fileToDelete?.name}.{fileToDelete?.extension}"?
        This action cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button 
        variant="outline" 
        onclick={() => showDeleteDialog = false}
        class="font-mono text-xs uppercase tracking-wider border-border/50"
      >
        Cancel
      </Button>
      <Button 
        onclick={handleConfirmDelete}
        disabled={fileDeleting}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/90 text-[var(--cyber-red-foreground)] disabled:opacity-50"
      >
        {#if fileDeleting}
          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
        {/if}
        {fileDeleting ? "Deleting..." : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
