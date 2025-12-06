<script lang="ts">
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { 
    isPermissionGranted, 
    requestPermission, 
    sendNotification 
  } from "@tauri-apps/plugin-notification";
  import { connection, disconnect, testConnection } from "$lib/stores/connection.svelte";
  import { projects, fetchProjects } from "$lib/stores/projects.svelte";
  import { 
    settings, 
    initSettings, 
    loadProviders, 
    setTheme, 
    setDefaultProvider,
    setAutoRefreshInterval,
    setInAppNotifications,
    setSystemNotifications,
    exportSettingsJson,
    importSettingsJson,
    resetSettings 
  } from "$lib/stores/settings.svelte";
  import type { Theme } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import * as Card from "$lib/components/ui/card";
  import * as Select from "$lib/components/ui/select";

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Load projects for stats
  $effect(() => {
    if (connection.isConnected && projects.list.length === 0) {
      fetchProjects();
    }
  });

  // Initialize settings and load providers
  $effect(() => {
    if (connection.isConnected) {
      initSettings();
      loadProviders();
    }
  });

  // Settings state
  let isTesting = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let exportData = $state<string | null>(null);
  let importInput = $state("");
  let showImportDialog = $state(false);

  async function handleDisconnect() {
    await disconnect();
    goto("/setup");
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

  async function handleThemeChange(value: string | undefined) {
    if (value) {
      await setTheme(value as Theme);
    }
  }

  async function handleProviderChange(value: string | undefined) {
    await setDefaultProvider(value ?? null);
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
        a.download = "codeopen-settings.json";
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

  // Theme options for select
  const themeOptions = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  // Get current theme label
  function getThemeLabel(theme: Theme): string {
    return themeOptions.find(t => t.value === theme)?.label ?? "System";
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Settings</h1>
        <p class="text-muted-foreground text-sm">
          Manage your connection and preferences
        </p>
      </div>
      <Button variant="ghost" onclick={() => goto("/projects")}>
        Back to Projects
      </Button>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- Connection Info -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Connection</Card.Title>
          <Card.Description>
            Manage your API connection
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-1">
            <Label class="text-muted-foreground text-xs">API URL</Label>
            <p class="font-mono text-sm break-all">{connection.apiUrl}</p>
          </div>
          <div class="space-y-1">
            <Label class="text-muted-foreground text-xs">Status</Label>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-green-500"></span>
              <span class="text-sm">Connected</span>
            </div>
          </div>
          {#if testResult}
            <div class="text-sm p-3 rounded-md {testResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}">
              {testResult.message}
            </div>
          {/if}
        </Card.Content>
        <Card.Footer class="flex gap-2">
          <Button 
            variant="outline" 
            onclick={handleTestConnection}
            disabled={isTesting}
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button 
            variant="destructive" 
            onclick={handleDisconnect}
          >
            Disconnect
          </Button>
        </Card.Footer>
      </Card.Root>

      <!-- Appearance Settings -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Appearance</Card.Title>
          <Card.Description>
            Customize how CodeOpen looks
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label for="theme">Theme</Label>
            <Select.Root 
              type="single"
              value={settings.theme}
              onValueChange={(v) => handleThemeChange(v)}
            >
              <Select.Trigger class="w-full">
                {getThemeLabel(settings.theme)}
              </Select.Trigger>
              <Select.Content>
                {#each themeOptions as option}
                  <Select.Item value={option.value} label={option.label} />
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-xs text-muted-foreground">
              Choose between light, dark, or follow your system preference
            </p>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- LLM Providers -->
      <Card.Root>
        <Card.Header>
          <Card.Title>LLM Providers</Card.Title>
          <Card.Description>
            Configure AI model providers
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if settings.providers.length > 0}
            <div class="space-y-2">
              <Label for="default-provider">Default Provider</Label>
              <Select.Root 
                type="single"
                value={settings.defaultProviderId ?? ""}
                onValueChange={(v) => handleProviderChange(v || undefined)}
              >
                <Select.Trigger class="w-full">
                  {settings.defaultProvider?.name ?? "Select a provider..."}
                </Select.Trigger>
                <Select.Content>
                  {#each settings.configuredProviders as provider}
                    <Select.Item value={provider.id} label={provider.isDefault ? `${provider.name} (API default)` : provider.name} />
                  {/each}
                </Select.Content>
              </Select.Root>
              <p class="text-xs text-muted-foreground">
                Used when creating new projects
              </p>
            </div>

            <div class="space-y-2">
              <Label class="text-muted-foreground text-xs">Available Providers</Label>
              <div class="space-y-2">
                {#each settings.providers as provider}
                  <div class="flex items-center justify-between p-2 border rounded-md text-sm">
                    <div class="flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full {provider.isConfigured ? 'bg-green-500' : 'bg-muted'}"></span>
                      <span>{provider.name}</span>
                    </div>
                    <span class="text-xs text-muted-foreground">
                      {provider.isConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {:else if settings.isLoading}
            <p class="text-sm text-muted-foreground">Loading providers...</p>
          {:else}
            <p class="text-sm text-muted-foreground">No providers available. Configure providers in the Management API.</p>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Preferences -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Preferences</Card.Title>
          <Card.Description>
            General application settings
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-6">
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="in-app-notifications">In-App Notifications</Label>
              <p class="text-xs text-muted-foreground">Show toast notifications inside the app</p>
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
              <Label for="system-notifications">System Notifications</Label>
              <p class="text-xs text-muted-foreground">Show OS notifications when app is in background</p>
            </div>
            <Switch 
              id="system-notifications"
              checked={settings.systemNotifications}
              onCheckedChange={async (checked) => {
                if (checked) {
                  // Request permission if enabling
                  let permissionGranted = await isPermissionGranted();
                  if (!permissionGranted) {
                    const permission = await requestPermission();
                    permissionGranted = permission === "granted";
                  }
                  
                  if (permissionGranted) {
                    await setSystemNotifications(true);
                    // Send test notification
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
            <Label for="refresh-interval">Auto-refresh Interval</Label>
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
                class="w-24"
              />
              <span class="text-sm text-muted-foreground">seconds (0 = disabled)</span>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Export/Import -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Backup & Restore</Card.Title>
          <Card.Description>
            Export or import your settings
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Export your settings to a file for backup or transfer to another device.
          </p>
          
          {#if showImportDialog}
            <div class="space-y-3 p-3 border rounded-md">
              <Label>Import Settings</Label>
              <input 
                type="file" 
                accept=".json"
                onchange={handleFileUpload}
                class="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p class="text-xs text-muted-foreground">Or paste JSON directly:</p>
              <textarea 
                bind:value={importInput}
                placeholder="Paste settings JSON here..."
                class="w-full h-24 p-2 text-xs font-mono border rounded-md bg-muted"
              ></textarea>
              <div class="flex gap-2">
                <Button size="sm" onclick={handleImport} disabled={!importInput.trim()}>
                  Import
                </Button>
                <Button size="sm" variant="outline" onclick={() => { showImportDialog = false; importInput = ""; }}>
                  Cancel
                </Button>
              </div>
            </div>
          {/if}
          
          {#if settings.error}
            <div class="text-sm p-3 rounded-md bg-destructive/10 text-destructive">
              {settings.error}
            </div>
          {/if}
        </Card.Content>
        <Card.Footer class="flex gap-2">
          <Button variant="outline" onclick={handleExport}>
            Export Settings
          </Button>
          {#if !showImportDialog}
            <Button variant="outline" onclick={() => showImportDialog = true}>
              Import Settings
            </Button>
          {/if}
          <Button variant="ghost" onclick={handleReset}>
            Reset to Defaults
          </Button>
        </Card.Footer>
      </Card.Root>

      <!-- App Info -->
      <Card.Root>
        <Card.Header>
          <Card.Title>About</Card.Title>
          <Card.Description>
            Application information
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-1">
            <Label class="text-muted-foreground text-xs">Application</Label>
            <p class="text-sm font-medium">CodeOpen</p>
          </div>
          <div class="space-y-1">
            <Label class="text-muted-foreground text-xs">Version</Label>
            <p class="text-sm font-mono">0.1.0</p>
          </div>
          <div class="space-y-1">
            <Label class="text-muted-foreground text-xs">Description</Label>
            <p class="text-sm text-muted-foreground">
              Portable Command Center for OpenCode - manage your AI-powered development environments from anywhere.
            </p>
          </div>
        </Card.Content>
        <Card.Footer>
          <p class="text-xs text-muted-foreground">
            Built with Tauri, Svelte, and Rust
          </p>
        </Card.Footer>
      </Card.Root>

      <!-- Statistics -->
      <Card.Root class="md:col-span-2">
        <Card.Header>
          <Card.Title>Statistics</Card.Title>
          <Card.Description>
            Overview of your projects
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="text-center p-4 bg-muted rounded-lg">
              <p class="text-3xl font-bold">{projects.count}</p>
              <p class="text-sm text-muted-foreground">Total Projects</p>
            </div>
            <div class="text-center p-4 bg-green-500/10 rounded-lg">
              <p class="text-3xl font-bold text-green-600 dark:text-green-400">{projects.running.length}</p>
              <p class="text-sm text-muted-foreground">Running</p>
            </div>
            <div class="text-center p-4 bg-muted rounded-lg">
              <p class="text-3xl font-bold">{projects.stopped.length}</p>
              <p class="text-sm text-muted-foreground">Stopped</p>
            </div>
            <div class="text-center p-4 bg-destructive/10 rounded-lg">
              <p class="text-3xl font-bold text-destructive">{projects.errored.length}</p>
              <p class="text-sm text-muted-foreground">Errors</p>
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</main>
