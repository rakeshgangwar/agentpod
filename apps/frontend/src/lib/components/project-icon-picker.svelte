<script lang="ts">
  /**
   * Project Icon Picker
   * 
   * A component for selecting project icons, organized by category.
   * Can be used in project creation and settings forms.
   */
  
  import { 
    getIconCategories, 
    getProjectIcon,
    projectIcons,
  } from "$lib/utils/project-icons";
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
    value = "code",
    onSelect,
    disabled = false,
    size = "md",
  }: Props = $props();
  
  // =============================================================================
  // State
  // =============================================================================
  
  // Get the currently selected icon
  const selectedIcon = $derived(getProjectIcon(value) ?? projectIcons[0]);
  
  // Size classes
  const sizeClasses = {
    sm: { button: "h-8 w-8", icon: "h-4 w-4", gridIcon: "h-7 w-7" },
    md: { button: "h-10 w-10", icon: "h-5 w-5", gridIcon: "h-8 w-8" },
    lg: { button: "h-12 w-12", icon: "h-6 w-6", gridIcon: "h-10 w-10" },
  };
  
  const classes = $derived(sizeClasses[size]);
  
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
        class="{classes.button} p-0 border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5"
      >
        {@const IconComponent = selectedIcon.component}
        <IconComponent class="{classes.icon} text-[var(--cyber-cyan)]" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  
  <DropdownMenu.Content class="w-80 p-0 cyber-card border-[var(--cyber-cyan)]/30" align="start">
    <div class="p-3 border-b border-border/30">
      <h4 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [select_icon]
      </h4>
      <p class="text-xs text-muted-foreground font-mono mt-1">
        Choose an icon for your project
      </p>
    </div>
    
    <div class="p-3 max-h-[300px] overflow-y-auto">
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
                onclick={() => handleSelect(icon.id)}
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
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>
