<script lang="ts">
  import { themeStore, type ThemeMode } from "$lib/themes/store.svelte";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import MonitorIcon from "@lucide/svelte/icons/monitor";

  // Mode options
  const modeOptions: { value: ThemeMode; icon: typeof SunIcon; title: string }[] = [
    { value: "light", icon: SunIcon, title: "Light mode" },
    { value: "system", icon: MonitorIcon, title: "System preference" },
    { value: "dark", icon: MoonIcon, title: "Dark mode" },
  ];

  function handleModeChange(mode: ThemeMode) {
    themeStore.setMode(mode);
  }

  // Get the index of the current mode for indicator positioning
  const activeIndex = $derived(modeOptions.findIndex(o => o.value === themeStore.mode));
</script>

<div class="theme-toggle">
  <!-- Sliding indicator -->
  <div 
    class="theme-toggle-indicator"
    style="--active-index: {activeIndex}"
  ></div>
  
  {#each modeOptions as option}
    <button
      type="button"
      onclick={() => handleModeChange(option.value)}
      title={option.title}
      class="theme-toggle-button {themeStore.mode === option.value ? 'active' : ''}"
    >
      <option.icon class="h-4 w-4" />
    </button>
  {/each}
</div>

<style>
  .theme-toggle {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 8px;
    border: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--background) / 0.5);
  }

  .theme-toggle-indicator {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 28px;
    height: calc(100% - 6px);
    background: var(--cyber-cyan);
    opacity: 0.2;
    border-radius: 6px;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    /* Calculate position: each button is 28px wide + 2px gap */
    transform: translateX(calc(var(--active-index) * (28px + 2px)));
  }

  .theme-toggle-button {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    transition: color 0.2s ease, transform 0.15s ease;
  }

  .theme-toggle-button:hover {
    color: hsl(var(--foreground));
  }

  .theme-toggle-button:active {
    transform: scale(0.92);
  }

  .theme-toggle-button.active {
    color: var(--cyber-cyan);
  }

  /* Add glow effect on active - only in dark mode where it's visible */
  :global(.dark) .theme-toggle-button.active :global(svg) {
    filter: drop-shadow(0 0 4px var(--cyber-cyan));
  }
</style>
