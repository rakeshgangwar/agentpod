<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Component } from "svelte";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";

  // =============================================================================
  // Types
  // =============================================================================

  export interface Tab {
    id: string;
    label: string;
    icon?: Component | string;
  }

  /** Icon can be a static component, emoji string, or animated lottie path */
  export type PageIcon = 
    | Component  // Lucide icon component
    | string     // Emoji string
    | { type: "animated"; path: string };  // Lottie animation

  // =============================================================================
  // Props
  // =============================================================================

  interface Props {
    /** Page title */
    title: string;
    /** Page icon - shown in collapsed mode (Lucide component, emoji string, or animated icon) */
    icon?: PageIcon;
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
    /** Actions slot - for buttons on the right side of the header (desktop) */
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
  // Icon Type Detection
  // =============================================================================
  
  function isAnimatedIcon(ic: PageIcon | undefined): ic is { type: "animated"; path: string } {
    return ic !== undefined && typeof ic === "object" && "type" in ic && ic.type === "animated";
  }

  function isComponentIcon(ic: PageIcon | undefined): ic is Component {
    return ic !== undefined && typeof ic === "function";
  }

  function isEmojiIcon(ic: PageIcon | undefined): ic is string {
    return ic !== undefined && typeof ic === "string";
  }

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
    <!-- Collapsible Title Section (hidden on mobile when collapsed) -->
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
          <div class="min-w-0 flex-1 flex items-center gap-3">
            <!-- Icon in expanded mode -->
            {#if icon}
              <div class="flex items-center justify-center shrink-0 text-[var(--cyber-cyan)]">
                {#if isAnimatedIcon(icon)}
                  <LottieIcon src={icon.path} size={24} loop autoplay />
                {:else if isEmojiIcon(icon)}
                  <span class="text-2xl">{icon}</span>
                {:else if isComponentIcon(icon)}
                  {@const IconComponent = icon}
                  <IconComponent class="h-6 w-6" />
                {/if}
              </div>
            {/if}
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
        </div>
        
        <!-- Actions (only in expanded state on non-collapsible headers) -->
        {#if actions && !collapsible}
          <div class="flex items-center gap-2 shrink-0">
            {@render actions()}
          </div>
        {/if}
      </div>
    </div>
    
    <!-- Tab Navigation Bar (always visible) -->
    {#if tabs.length > 0}
      <div class="flex items-center gap-1 sm:gap-2 py-1 sm:py-0">
        <!-- LEFT: Back button + Icon (only when collapsed) -->
        {#if collapsible && isCollapsed}
          <div class="flex items-center gap-1.5 shrink-0">
            {#if leading}
              {@render leading()}
            {/if}
          </div>
        {/if}

        <!-- CENTER: Tabs - take remaining space, centered on mobile -->
        <nav class="flex-1 flex justify-center sm:justify-start gap-0.5 sm:gap-1 overflow-x-auto pb-px -mb-px scrollbar-hide">
          {#each tabs as tab}
            <Tooltip.Root>
              <Tooltip.Trigger>
                <button
                  type="button"
                  class="px-2.5 sm:px-4 py-2 sm:py-2.5 font-mono text-xs uppercase tracking-wider whitespace-nowrap
                         border-b-2 transition-colors flex items-center justify-center gap-2 touch-manipulation
                         {activeTab === tab.id 
                           ? 'border-primary text-primary' 
                           : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/50'}"
                  onclick={() => handleTabClick(tab.id)}
                >
                  {#if tab.icon}
                    {#if typeof tab.icon === "string"}
                      <span class="text-sm">{tab.icon}</span>
                    {:else}
                      {@const IconComponent = tab.icon}
                      <IconComponent class="h-4 w-4" />
                    {/if}
                  {/if}
                  <!-- Label hidden on mobile, shown on sm+ -->
                  <span class="hidden sm:inline">{tab.label}</span>
                </button>
              </Tooltip.Trigger>
              <!-- Tooltip only shown on mobile where label is hidden -->
              <Tooltip.Content class="sm:hidden">
                <p>{tab.label}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          {/each}
        </nav>

        <!-- RIGHT: Status badge + Actions + Collapse toggle -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <!-- Status badge (only when collapsed) -->
          {#if collapsible && isCollapsed && status}
            <div class="status-indicator {getStatusClass(status.variant)} shrink-0 text-xs py-0.5 px-1.5">
              <span class="status-dot {status.animate ? 'animate-pulse-dot' : ''}"></span>
              <span class="hidden sm:inline">{status.label}</span>
            </div>
          {/if}

          <!-- Actions - hidden on mobile, shown on sm+ -->
          {#if collapsible && actions}
            <div class="hidden sm:flex items-center gap-2">
              {@render actions()}
            </div>
          {/if}

          <!-- Collapse toggle button - hidden on mobile -->
          {#if collapsible}
            <button
              onclick={toggleCollapse}
              class="hidden sm:block p-1.5 rounded border border-border/30 hover:border-[var(--cyber-cyan)]/50 
                     hover:bg-[var(--cyber-cyan)]/5 transition-colors"
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
                {#if isAnimatedIcon(icon)}
                  <LottieIcon src={icon.path} size={20} loop autoplay />
                {:else if isEmojiIcon(icon)}
                  <span class="text-lg">{icon}</span>
                {:else if isComponentIcon(icon)}
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
