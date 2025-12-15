<script lang="ts">
  import { goto } from "$app/navigation";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth, logout } from "$lib/stores/auth.svelte";
  import { 
    sandboxes, 
    fetchSandboxes, 
    startSandbox, 
    stopSandbox, 
    deleteSandbox,
    checkDockerHealth 
  } from "$lib/stores/sandboxes.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  async function handleLogout() {
    await logout();
    goto("/login");
  }

  // Check Docker health and load sandboxes when connected
  $effect(() => {
    if (connection.isConnected) {
      checkDockerHealth();
      fetchSandboxes();
    }
  });

  function getStatusClass(status: string): string {
    switch (status) {
      case "running": return "status-running";
      case "starting":
      case "stopping": return "status-starting";
      case "created":
      case "stopped": return "status-stopped";
      case "error":
      case "unknown": return "status-error";
      default: return "status-stopped";
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case "created": return "ready";
      default: return status;
    }
  }

  function handleSandboxClick(e: MouseEvent, sandboxId: string) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    goto(`/projects/${sandboxId}`);
  }

  function getSandboxDisplayName(sandbox: { name: string; labels?: Record<string, string> }): string {
    return sandbox.labels?.["agentpod.sandbox.name"] || sandbox.name;
  }

  function getSandboxSlug(sandbox: { slug?: string; labels?: Record<string, string> }): string {
    return sandbox.slug || sandbox.labels?.["agentpod.sandbox.slug"] || "";
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return "---";
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateStr));
  }

  function getImageShortName(image?: string): string {
    if (!image) return "---";
    // Extract just the image name without registry and tag
    const parts = image.split('/');
    const name = parts[parts.length - 1];
    return name.split(':')[0];
  }
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="min-h-screen grid-bg mesh-gradient">
  <div class="container mx-auto px-6 py-8 max-w-7xl relative">
    
    <!-- Header Section -->
    <header class="mb-12 animate-fade-in-up">
      <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        
        <!-- Title Area -->
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono text-muted-foreground tracking-widest uppercase">
              // sandbox_controller
            </span>
          </div>
          
          <h1 class="text-5xl lg:text-6xl font-bold tracking-tight glitch-hover" 
              style="font-family: 'Space Grotesk', sans-serif;">
            <span class="text-foreground">Projects</span>
            <span class="typing-cursor"></span>
          </h1>
          
          <div class="flex flex-wrap items-center gap-4 text-sm font-mono">
            <!-- Connection Status -->
            <div class="flex items-center gap-2 text-muted-foreground">
              <span class="text-[var(--cyber-cyan)]">@</span>
              <span class="truncate max-w-[200px]">{connection.apiUrl}</span>
            </div>
            
            <!-- Docker Health -->
            {#if sandboxes.dockerHealthy !== null}
              <div class="health-indicator {sandboxes.dockerHealthy ? 'healthy' : 'unhealthy'}">
                <span class="status-dot {sandboxes.dockerHealthy ? 'animate-pulse-dot' : ''}" 
                      style="background: currentColor;"></span>
                <span>docker: {sandboxes.dockerHealthy ? 'online' : 'offline'}</span>
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Actions Area -->
        <div class="flex items-center gap-3">
          <Button 
            onclick={() => goto("/projects/new")}
            class="cyber-btn-primary px-6 h-10 font-mono text-xs uppercase tracking-wider"
          >
            <span class="mr-2">+</span> New Project
          </Button>
          
          <Button 
            variant="ghost" 
            onclick={() => goto("/settings")}
            class="font-mono text-xs uppercase tracking-wider h-10"
          >
            Settings
          </Button>
          
          <!-- User Menu -->
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="ghost" size="icon" class="rounded-sm h-10 w-10 border border-border/50">
                <Avatar class="h-7 w-7">
                  <AvatarFallback class="text-xs font-mono bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]">
                    {auth.initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-56 font-mono">
              <DropdownMenu.Label>
                <div class="flex flex-col space-y-1">
                  <p class="text-sm font-medium leading-none">{auth.displayName}</p>
                  {#if auth.user?.email}
                    <p class="text-xs leading-none text-muted-foreground">{auth.user.email}</p>
                  {/if}
                </div>
              </DropdownMenu.Label>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onclick={() => goto("/settings")}>
                <span class="text-[var(--cyber-cyan)] mr-2">&gt;</span> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onclick={handleLogout} class="text-destructive focus:text-destructive">
                <span class="mr-2">&gt;</span> Disconnect
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>

    <!-- Error Display -->
    {#if sandboxes.error}
      <div class="mb-8 animate-fade-in-up stagger-1 cyber-card p-4 border-[var(--cyber-red)]/50">
        <div class="flex items-center gap-3 text-[var(--cyber-red)]">
          <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
          <span class="text-sm">{sandboxes.error}</span>
        </div>
      </div>
    {/if}

    <!-- Docker Health Warning -->
    {#if sandboxes.dockerHealthy === false}
      <div class="mb-8 animate-fade-in-up stagger-1 cyber-card p-4 border-[var(--cyber-amber)]/50">
        <div class="flex items-center gap-3 text-[var(--cyber-amber)]">
          <span class="font-mono text-xs uppercase tracking-wider">[warning]</span>
          <span class="text-sm">Docker daemon is not accessible. Please ensure Docker is running.</span>
        </div>
      </div>
    {/if}

    <!-- Stats Bar -->
    {#if sandboxes.list.length > 0}
      <div class="mb-8 flex flex-wrap gap-6 text-sm font-mono animate-fade-in-up stagger-2">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">total:</span>
          <span class="text-foreground font-semibold">{sandboxes.list.length}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">running:</span>
          <span class="text-[var(--cyber-emerald)] font-semibold">
            {sandboxes.list.filter(s => s.status === 'running').length}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">stopped:</span>
          <span class="text-muted-foreground font-semibold">
            {sandboxes.list.filter(s => s.status === 'stopped' || s.status === 'created').length}
          </span>
        </div>
      </div>
    {/if}

    <!-- Projects Grid -->
    {#if sandboxes.isLoading && sandboxes.list.length === 0}
      <!-- Loading State -->
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each [1, 2, 3] as i}
          <div class="cyber-card p-6 animate-fade-in-up stagger-{i}">
            <div class="space-y-4">
              <div class="h-6 bg-muted/50 rounded w-3/4 animate-pulse"></div>
              <div class="h-4 bg-muted/30 rounded w-1/2 animate-pulse"></div>
              <div class="h-4 bg-muted/20 rounded w-full animate-pulse"></div>
              <div class="flex gap-2 pt-2">
                <div class="h-8 bg-muted/30 rounded w-16 animate-pulse"></div>
                <div class="h-8 bg-muted/30 rounded w-16 animate-pulse"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if sandboxes.list.length === 0}
      <!-- Empty State -->
      <div class="cyber-card corner-accent p-12 text-center animate-fade-in-up stagger-1">
        <div class="max-w-md mx-auto space-y-6">
          <div class="font-mono text-6xl text-[var(--cyber-cyan)]/20">[ ]</div>
          <div class="space-y-2">
            <h2 class="text-xl font-semibold" style="font-family: 'Space Grotesk', sans-serif;">
              No sandboxes initialized
            </h2>
            <p class="text-muted-foreground text-sm font-mono">
              Create your first AI coding environment to get started.
            </p>
          </div>
          <Button 
            onclick={() => goto("/projects/new")}
            class="cyber-btn-primary px-8 h-11 font-mono text-xs uppercase tracking-wider"
          >
            <span class="mr-2">+</span> Initialize Project
          </Button>
        </div>
      </div>
    {:else}
      <!-- Projects List -->
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each sandboxes.list as sandbox, i (sandbox.id)}
          <div 
            class="cyber-card corner-accent cursor-pointer group animate-fade-in-up stagger-{Math.min(i + 1, 8)}"
            onclick={(e: MouseEvent) => handleSandboxClick(e, sandbox.id)}
            role="button"
            tabindex="0"
            onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && goto(`/projects/${sandbox.id}`)}
          >
            <!-- Card Header -->
            <div class="p-5 pb-4 border-b border-border/30">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h3 class="font-semibold text-lg truncate group-hover:text-[var(--cyber-cyan)] transition-colors"
                      style="font-family: 'Space Grotesk', sans-serif;">
                    {getSandboxDisplayName(sandbox)}
                  </h3>
                  <p class="text-xs font-mono text-muted-foreground truncate mt-1">
                    {getSandboxSlug(sandbox) || '---'}
                  </p>
                </div>
                
                <!-- Status Indicator -->
                <div class="status-indicator {getStatusClass(sandbox.status)}">
                  <span class="status-dot {sandbox.status === 'running' ? 'animate-pulse-dot' : ''}"></span>
                  <span>{getStatusLabel(sandbox.status)}</span>
                </div>
              </div>
            </div>
            
            <!-- Card Body -->
            <div class="p-5 pt-4 space-y-4">
              <!-- Metadata -->
              <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span class="text-muted-foreground block mb-1">image</span>
                  <span class="text-foreground truncate block" title={sandbox.image}>
                    {getImageShortName(sandbox.image)}
                  </span>
                </div>
                <div>
                  <span class="text-muted-foreground block mb-1">created</span>
                  <span class="text-foreground">
                    {formatDate(sandbox.createdAt)}
                  </span>
                </div>
              </div>
              
              <!-- Actions -->
              <div class="flex items-center gap-2 pt-2">
                {#if sandbox.status === "stopped" || sandbox.status === "created"}
                  <Button 
                    size="sm" 
                    onclick={(e: MouseEvent) => { e.stopPropagation(); startSandbox(sandbox.id); }}
                    disabled={sandboxes.isLoading}
                    class="font-mono text-xs uppercase tracking-wider h-8 px-4 bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
                  >
                    Start
                  </Button>
                {:else if sandbox.status === "running"}
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); stopSandbox(sandbox.id); }}
                    disabled={sandboxes.isLoading}
                    class="font-mono text-xs uppercase tracking-wider h-8 px-4"
                  >
                    Stop
                  </Button>
                {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
                  <Button 
                    size="sm" 
                    disabled={true}
                    class="font-mono text-xs uppercase tracking-wider h-8 px-4"
                  >
                    {sandbox.status === "starting" ? "Starting..." : "Stopping..."}
                  </Button>
                {/if}
                
                <Button 
                  size="sm" 
                  variant="ghost"
                  onclick={async (e: MouseEvent) => {
                    e.stopPropagation();
                    const displayName = getSandboxDisplayName(sandbox);
                    const shouldDelete = await confirm(`Delete project "${displayName}"?`, {
                      title: "Confirm Delete",
                      kind: "warning",
                    });
                    if (shouldDelete) {
                      deleteSandbox(sandbox.id);
                    }
                  }}
                  disabled={sandboxes.isLoading}
                  class="font-mono text-xs uppercase tracking-wider h-8 px-4 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                >
                  Delete
                </Button>
                
                <div class="flex-1"></div>
                
                <!-- Quick open indicator -->
                <span class="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                  open &rarr;
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
    
    <!-- Footer -->
    <footer class="mt-16 pt-8 border-t border-border/30 animate-fade-in-up" style="animation-delay: 0.5s; opacity: 0;">
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
        <div class="flex items-center gap-4">
          <span>CodeOpen v1.0</span>
          <span class="text-border">|</span>
          <span>AI Sandbox Environment</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[var(--cyber-emerald)] animate-pulse-dot"></span>
          <span>System operational</span>
        </div>
      </div>
    </footer>
  </div>
</main>
