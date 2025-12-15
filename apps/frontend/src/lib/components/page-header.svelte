<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Component } from "svelte";

  // =============================================================================
  // Types
  // =============================================================================

  export interface Tab {
    id: string;
    label: string;
    icon?: Component | string;
  }

  // =============================================================================
  // Props
  // =============================================================================

  interface Props {
    /** Page title */
    title: string;
    /** Optional subtitle/description */
    subtitle?: string;
    /** Optional status indicator */
    status?: {
      label: string;
      variant: "running" | "starting" | "stopped" | "error";
      animate?: boolean;
    };
    /** Tabs configuration */
    tabs?: Tab[];
    /** Currently active tab ID */
    activeTab?: string;
    /** Callback when tab changes */
    onTabChange?: (tabId: string) => void;
    /** Whether the header is sticky */
    sticky?: boolean;
    /** Actions slot - for buttons on the right side of the header */
    actions?: Snippet;
    /** Leading slot - for back button or other leading content */
    leading?: Snippet;
  }

  let {
    title,
    subtitle,
    status,
    tabs = [],
    activeTab = "",
    onTabChange,
    sticky = true,
    actions,
    leading,
  }: Props = $props();

  // =============================================================================
  // Handlers
  // =============================================================================

  function handleTabClick(tabId: string) {
    onTabChange?.(tabId);
  }

  function getStatusClass(variant: string): string {
    switch (variant) {
      case "running": return "status-running";
      case "starting": return "status-starting";
      case "stopped": return "status-stopped";
      case "error": return "status-error";
      default: return "status-stopped";
    }
  }
</script>

<header 
  class="z-40 border-b border-border/30 bg-background/80 backdrop-blur-md {sticky ? 'sticky top-0' : ''}"
>
  <div class="container mx-auto px-4 sm:px-6 max-w-7xl">
    <!-- Top section: Title, status, actions -->
    <div class="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div class="flex items-center gap-4 min-w-0">
        <!-- Leading content (back button, etc.) -->
        {#if leading}
          {@render leading()}
          <div class="h-6 w-px bg-border/50 hidden sm:block"></div>
        {/if}
        
        <!-- Title and status -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-3 overflow-hidden">
            <h1 class="text-xl sm:text-2xl font-bold truncate glitch-hover">
              {title}
            </h1>
            {#if status}
              <div class="status-indicator {getStatusClass(status.variant)} shrink-0">
                <span class="status-dot {status.animate ? 'animate-pulse-dot' : ''}"></span>
                <span>{status.label}</span>
              </div>
            {/if}
          </div>
          {#if subtitle}
            <p class="text-xs font-mono text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          {/if}
        </div>
      </div>
      
      <!-- Actions -->
      {#if actions}
        <div class="flex items-center gap-2 shrink-0">
          {@render actions()}
        </div>
      {/if}
    </div>
    
    <!-- Tab Navigation -->
    {#if tabs.length > 0}
      <nav class="flex gap-1 overflow-x-auto pb-px -mb-px scrollbar-none">
        {#each tabs as tab}
          <button
            onclick={() => handleTabClick(tab.id)}
            class="px-4 py-2.5 font-mono text-xs uppercase tracking-wider whitespace-nowrap
                   border-b-2 transition-colors flex items-center gap-2
                   {activeTab === tab.id 
                     ? 'border-[var(--cyber-cyan)] text-[var(--cyber-cyan)]' 
                     : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/50'}"
          >
            {#if tab.icon}
              {#if typeof tab.icon === "string"}
                <span class="text-sm">{tab.icon}</span>
              {:else}
                {@const IconComponent = tab.icon}
                <IconComponent class="h-4 w-4" />
              {/if}
            {/if}
            {tab.label}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
</header>
