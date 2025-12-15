<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Component } from "svelte";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

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
    /** Page icon - shown in collapsed mode (Lucide component or emoji string) */
    icon?: Component | string;
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
    /** Whether header can collapse (manual toggle) */
    collapsible?: boolean;
    /** Actions slot - for buttons on the right side of the header */
    actions?: Snippet;
    /** Leading slot - for back button or other leading content */
    leading?: Snippet;
  }

  let {
    title,
    icon,
    subtitle,
    status,
    tabs = [],
    activeTab = "",
    onTabChange,
    sticky = true,
    collapsible = false,
    actions,
    leading,
  }: Props = $props();

  // =============================================================================
  // Collapse State
  // =============================================================================

  let isCollapsed = $state(false);
  let isMobile = $state(false);

  // Auto-collapse on mobile screens
  $effect(() => {
    if (typeof window === "undefined") return;

    function checkMobile() {
      const mobile = window.innerWidth < 640; // sm breakpoint
      isMobile = mobile;
      // Auto-collapse on mobile when collapsible is enabled
      if (collapsible && mobile && !isCollapsed) {
        isCollapsed = true;
      }
    }

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  });

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
  }

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
    <!-- Collapsible Title Section -->
    <div 
      class="overflow-hidden transition-all duration-300 ease-out"
      style="max-height: {collapsible && isCollapsed ? '0px' : '200px'}; opacity: {collapsible && isCollapsed ? '0' : '1'}"
    >
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
              <!-- Icon in expanded mode -->
              {#if icon}
                <div class="flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5 shrink-0">
                  {#if typeof icon === "string"}
                    <span class="text-xl">{icon}</span>
                  {:else}
                    {@const IconComponent = icon}
                    <IconComponent class="h-5 w-5 text-[var(--cyber-cyan)]" />
                  {/if}
                </div>
              {/if}
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
              <p class="text-xs font-mono text-muted-foreground truncate mt-0.5 {icon ? 'ml-[52px]' : ''}">
                {subtitle}
              </p>
            {/if}
          </div>
        </div>
        
        <!-- Actions (only in expanded state) -->
        {#if actions && !collapsible}
          <div class="flex items-center gap-2 shrink-0">
            {@render actions()}
          </div>
        {/if}
      </div>
    </div>
    
    <!-- Tab Navigation (always visible) -->
    {#if tabs.length > 0}
      <div class="flex items-center gap-2">
        <!-- Collapsed: Show icon (or compact title if no icon) -->
        {#if collapsible && isCollapsed}
          <div class="flex items-center gap-2 py-2 min-w-0">
            {#if leading}
              {@render leading()}
            {/if}
            <!-- Icon or fallback to title -->
            {#if icon}
              <div 
                class="flex items-center justify-center w-8 h-8 rounded border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5"
                title={title}
              >
                {#if typeof icon === "string"}
                  <span class="text-lg">{icon}</span>
                {:else}
                  {@const IconComponent = icon}
                  <IconComponent class="h-5 w-5 text-[var(--cyber-cyan)]" />
                {/if}
              </div>
            {:else}
              <span class="font-mono text-sm font-medium truncate text-[var(--cyber-cyan)] max-w-[120px]">{title}</span>
            {/if}
            {#if status}
              <div class="status-indicator {getStatusClass(status.variant)} shrink-0 text-xs">
                <span class="status-dot {status.animate ? 'animate-pulse-dot' : ''}"></span>
              </div>
            {/if}
          </div>
          <div class="h-4 w-px bg-border/30"></div>
        {/if}

        <!-- Tabs -->
        <nav class="flex gap-1 overflow-x-auto pb-px -mb-px scrollbar-none flex-1">
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

        <!-- Actions (in collapsed state, show them inline) -->
        {#if collapsible && actions}
          <div class="flex items-center gap-2 shrink-0">
            {@render actions()}
          </div>
        {/if}

        <!-- Collapse toggle button -->
        {#if collapsible}
          <button
            onclick={toggleCollapse}
            class="p-1.5 rounded border border-border/30 hover:border-[var(--cyber-cyan)]/50 
                   hover:bg-[var(--cyber-cyan)]/5 transition-colors shrink-0"
            title={isCollapsed ? "Expand header" : "Collapse header"}
          >
            {#if isCollapsed}
              <ChevronDownIcon class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronUpIcon class="h-4 w-4 text-muted-foreground" />
            {/if}
          </button>
        {/if}
      </div>
    {:else if collapsible}
      <!-- No tabs, but collapsible - show toggle in a minimal bar -->
      <div class="flex items-center justify-between py-2">
        {#if isCollapsed}
          <div class="flex items-center gap-2 min-w-0">
            {#if leading}
              {@render leading()}
            {/if}
            <!-- Icon or fallback to title -->
            {#if icon}
              <div 
                class="flex items-center justify-center w-8 h-8 rounded border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5"
                title={title}
              >
                {#if typeof icon === "string"}
                  <span class="text-lg">{icon}</span>
                {:else}
                  {@const IconComponent = icon}
                  <IconComponent class="h-5 w-5 text-[var(--cyber-cyan)]" />
                {/if}
              </div>
            {:else}
              <span class="font-mono text-sm font-medium truncate text-[var(--cyber-cyan)] max-w-[120px]">{title}</span>
            {/if}
            {#if status}
              <div class="status-indicator {getStatusClass(status.variant)} shrink-0 text-xs">
                <span class="status-dot {status.animate ? 'animate-pulse-dot' : ''}"></span>
              </div>
            {/if}
          </div>
        {:else}
          <div></div>
        {/if}
        
        <div class="flex items-center gap-2">
          {#if actions}
            {@render actions()}
          {/if}
          <button
            onclick={toggleCollapse}
            class="p-1.5 rounded border border-border/30 hover:border-[var(--cyber-cyan)]/50 
                   hover:bg-[var(--cyber-cyan)]/5 transition-colors"
            title={isCollapsed ? "Expand header" : "Collapse header"}
          >
            {#if isCollapsed}
              <ChevronDownIcon class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronUpIcon class="h-4 w-4 text-muted-foreground" />
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</header>
