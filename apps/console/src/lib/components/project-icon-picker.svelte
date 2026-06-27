<script lang="ts">
  /**
   * Project Icon Picker
   * 
   * A component for selecting project icons, supporting both:
   * - Static Lucide icons (organized by category)
   * - Animated Lottie icons
   * 
   * Icon IDs are prefixed to distinguish types:
   * - Static icons: "code", "terminal", etc.
   * - Animated icons: "animated:robot-thinking", "animated:music", etc.
   */
  
  import { 
    getIconCategories, 
    getProjectIcon,
    projectIcons,
  } from "$lib/utils/project-icons";
  import {
    getAnimatedIconCategories,
    getAnimatedIcon,
    animatedIcons,
  } from "$lib/utils/animated-icons";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  
  // =============================================================================
  // Props
  // =============================================================================
  
  interface Props {
    /** Currently selected icon ID (use "animated:" prefix for animated icons) */
    value?: string;
    /** Callback when icon is selected */
    onSelect?: (iconId: string) => void;
    /** Whether the picker is disabled */
    disabled?: boolean;
    /** Size variant */
    size?: "sm" | "md" | "lg";
  }
  
  let {
    value = "code",
    onSelect,
    disabled = false,
    size = "md",
  }: Props = $props();
  
  // =============================================================================
  // State
  // =============================================================================
  
  // Tab state: "static" or "animated"
  let activeTab = $state<"static" | "animated">("static");
  
  // Parse icon type from value
  const isAnimatedIcon = $derived(value.startsWith("animated:"));
  const iconId = $derived(isAnimatedIcon ? value.replace("animated:", "") : value);
  
  // Get the currently selected icon
  const selectedStaticIcon = $derived(getProjectIcon(iconId) ?? projectIcons[0]);
  const selectedAnimatedIcon = $derived(getAnimatedIcon(iconId) ?? animatedIcons[0]);
  
  // Size classes
  const sizeClasses = {
    sm: { button: "h-8 w-8", icon: "h-4 w-4", gridIcon: "h-7 w-7", lottieSize: 20, lottieTriggerSize: 28 },
    md: { button: "h-10 w-10", icon: "h-5 w-5", gridIcon: "h-8 w-8", lottieSize: 24, lottieTriggerSize: 32 },
    lg: { button: "h-12 w-12", icon: "h-6 w-6", gridIcon: "h-10 w-10", lottieSize: 32, lottieTriggerSize: 40 },
  };
  
  const classes = $derived(sizeClasses[size]);
  
  // =============================================================================
  // Handlers
  // =============================================================================
  
  function handleSelectStatic(iconId: string) {
    onSelect?.(iconId);
  }
  
  function handleSelectAnimated(iconId: string) {
    onSelect?.(`animated:${iconId}`);
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {disabled}>
    {#snippet child({ props })}
      <Button
        variant="outline"
        {...props}
        class="{classes.button} p-0 border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5"
      >
        {#if isAnimatedIcon}
          <LottieIcon 
            src={selectedAnimatedIcon.path} 
            size={classes.lottieSize}
            loop
            autoplay
          />
        {:else}
          {@const IconComponent = selectedStaticIcon.component}
          <IconComponent class="{classes.icon} text-[var(--cyber-cyan)]" />
        {/if}
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  
  <DropdownMenu.Content class="w-80 p-0 cyber-card border-[var(--cyber-cyan)]/30" align="start">
    <!-- Header -->
    <div class="p-3 border-b border-border/30">
      <h4 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [select_icon]
      </h4>
      <p class="text-xs text-muted-foreground font-mono mt-1">
        Choose an icon for your project
      </p>
    </div>
    
    <!-- Tabs -->
    <div class="flex border-b border-border/30">
      <button
        type="button"
        onclick={() => activeTab = "static"}
        class="flex-1 px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors
               {activeTab === 'static' 
                 ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                 : 'text-muted-foreground hover:text-foreground'}"
      >
        Static
      </button>
      <button
        type="button"
        onclick={() => activeTab = "animated"}
        class="flex-1 px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors
               {activeTab === 'animated' 
                 ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                 : 'text-muted-foreground hover:text-foreground'}"
      >
        Animated
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-3 max-h-[300px] overflow-y-auto">
      {#if activeTab === "static"}
        <!-- Static Icons -->
        {#each getIconCategories() as { label, icons }}
          <div class="mb-4 last:mb-0">
            <h5 class="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
              {label}
            </h5>
            <div class="grid grid-cols-6 gap-1.5">
              {#each icons as icon (icon.id)}
                {@const IconComponent = icon.component}
                <button
                  type="button"
                  onclick={() => handleSelectStatic(icon.id)}
                  class="{classes.gridIcon} flex items-center justify-center rounded border transition-colors
                         {value === icon.id 
                           ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]' 
                           : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5 text-muted-foreground hover:text-foreground'}"
                  title={icon.name}
                >
                  <IconComponent class="h-4 w-4" />
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <!-- Animated Icons -->
        {#each getAnimatedIconCategories() as { label, icons }}
          {#if icons.length > 0}
            <div class="mb-4 last:mb-0">
              <h5 class="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                {label}
              </h5>
              <div class="grid grid-cols-4 gap-2">
                {#each icons as icon (icon.id)}
                  <button
                    type="button"
                    onclick={() => handleSelectAnimated(icon.id)}
                    class="flex flex-col items-center justify-center rounded border transition-colors p-2 h-16
                           {value === `animated:${icon.id}` 
                             ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
                             : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}"
                    title={icon.name}
                  >
                    <LottieIcon 
                      src={icon.path} 
                      size={classes.lottieTriggerSize}
                      hover
                      loop={false}
                    />
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
        
        {#if animatedIcons.length === 0}
          <p class="text-xs text-muted-foreground text-center py-4">
            No animated icons available
          </p>
        {/if}
      {/if}
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>
