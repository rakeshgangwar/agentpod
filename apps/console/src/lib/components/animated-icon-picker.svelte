<script lang="ts">
  /**
   * Animated Icon Picker
   * 
   * A component for selecting animated Lottie icons for projects.
   * Icons animate on hover, providing a delightful interactive experience.
   */
  
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
    /** Currently selected icon ID */
    value?: string;
    /** Callback when icon is selected */
    onSelect?: (iconId: string) => void;
    /** Whether the picker is disabled */
    disabled?: boolean;
    /** Size variant */
    size?: "sm" | "md" | "lg";
  }
  
  let {
    value = "robot-thinking",
    onSelect,
    disabled = false,
    size = "md",
  }: Props = $props();
  
  // =============================================================================
  // State
  // =============================================================================
  
  // Get the currently selected icon
  const selectedIcon = $derived(getAnimatedIcon(value) ?? animatedIcons[0]);
  
  // Size configurations
  const sizeConfig = {
    sm: { button: "h-8 w-8", iconSize: 24, gridIcon: "h-10 w-10", gridIconSize: 32 },
    md: { button: "h-10 w-10", iconSize: 32, gridIcon: "h-12 w-12", gridIconSize: 40 },
    lg: { button: "h-12 w-12", iconSize: 40, gridIcon: "h-14 w-14", gridIconSize: 48 },
  };
  
  const config = $derived(sizeConfig[size]);
  
  // =============================================================================
  // Handlers
  // =============================================================================
  
  function handleSelect(iconId: string) {
    onSelect?.(iconId);
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {disabled}>
    {#snippet child({ props })}
      <Button
        variant="outline"
        {...props}
        class="{config.button} p-0 border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5"
      >
        <LottieIcon 
          src={selectedIcon.path} 
          size={config.iconSize}
          hover
          loop={false}
        />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  
  <DropdownMenu.Content class="w-80 p-0 cyber-card border-[var(--cyber-cyan)]/30" align="start">
    <div class="p-3 border-b border-border/30">
      <h4 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [select_icon]
      </h4>
      <p class="text-xs text-muted-foreground font-mono mt-1">
        Hover to preview animation
      </p>
    </div>
    
    <div class="p-3 max-h-[400px] overflow-y-auto">
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
                  onclick={() => handleSelect(icon.id)}
                  class="{config.gridIcon} flex flex-col items-center justify-center rounded border transition-colors p-1
                         {value === icon.id 
                           ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
                           : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}"
                  title={icon.name}
                >
                  <LottieIcon 
                    src={icon.path} 
                    size={config.gridIconSize}
                    hover
                    loop={false}
                  />
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>
