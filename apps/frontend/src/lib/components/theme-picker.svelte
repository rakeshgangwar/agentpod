<script lang="ts">
  import { themeStore, type ThemeMode } from "$lib/themes/store.svelte";
  import { themePresets, themeCategories, type ThemeCategory } from "$lib/themes/presets";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import CheckIcon from "@lucide/svelte/icons/check";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import MonitorIcon from "@lucide/svelte/icons/monitor";

  // Local state for category filter
  let selectedCategory = $state<ThemeCategory | "all">("all");

  // Filter presets by category
  const filteredPresets = $derived(
    selectedCategory === "all"
      ? themePresets
      : themePresets.filter((p) => p.category === selectedCategory)
  );

  // Mode options
  const modeOptions: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ];

  function handleModeChange(mode: ThemeMode) {
    themeStore.setMode(mode);
  }

  function handlePresetChange(presetId: string) {
    themeStore.setPreset(presetId);
  }

  // Get category label
  function getCategoryLabel(category: string): string {
    return themeCategories.find((c) => c.id === category)?.label ?? category;
  }
</script>

<div class="space-y-6">
  <!-- Mode Selector -->
  <div class="space-y-3">
    <Label class="text-sm font-medium">Color Mode</Label>
    <div class="grid grid-cols-3 gap-2">
      {#each modeOptions as option}
        <button
          type="button"
          onclick={() => handleModeChange(option.value)}
          class="flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
            {themeStore.mode === option.value
              ? 'border-primary bg-primary/5'
              : 'border-transparent bg-muted/50 hover:bg-muted'}"
        >
          <option.icon class="h-5 w-5" />
          <span class="text-xs font-medium">{option.label}</span>
        </button>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">
      {#if themeStore.mode === "system"}
        Following your system preference ({themeStore.resolvedMode})
      {:else}
        Using {themeStore.mode} mode
      {/if}
    </p>
  </div>

  <!-- Category Filter -->
  <div class="space-y-3">
    <Label class="text-sm font-medium">Theme Category</Label>
    <Select.Root
      type="single"
      value={selectedCategory}
      onValueChange={(v) => {
        if (v) selectedCategory = v as ThemeCategory | "all";
      }}
    >
      <Select.Trigger class="w-full">
        {selectedCategory === "all" ? "All Categories" : getCategoryLabel(selectedCategory)}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all" label="All Categories" />
        {#each themeCategories as category}
          <Select.Item value={category.id} label={category.label} />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <!-- Theme Grid -->
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <Label class="text-sm font-medium">Theme Preset</Label>
      <span class="text-xs text-muted-foreground">
        {filteredPresets.length} themes
      </span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
      {#each filteredPresets as preset}
        {@const isSelected = themeStore.presetId === preset.id}
        {@const colors = themeStore.getPreviewColors(preset.id)}
        <button
          type="button"
          onclick={() => handlePresetChange(preset.id)}
          class="relative flex flex-col rounded-lg border-2 overflow-hidden transition-all
            {isSelected
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border hover:border-muted-foreground/50'}"
        >
          <!-- Color Preview -->
          <div
            class="h-12 w-full flex items-center justify-center"
            style="background-color: {colors?.background ?? '#fff'}"
          >
            <div
              class="h-6 w-6 rounded-full"
              style="background-color: {colors?.primary ?? '#000'}"
            ></div>
          </div>

          <!-- Label -->
          <div class="p-2 text-center bg-card">
            <span class="text-xs font-medium truncate block">{preset.label}</span>
          </div>

          <!-- Selected Indicator -->
          {#if isSelected}
            <div class="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
              <CheckIcon class="h-3 w-3 text-primary-foreground" />
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Current Theme Info -->
  {#if themeStore.currentPreset}
    {@const currentColors = themeStore.getPreviewColors(themeStore.presetId)}
    <div class="p-3 bg-muted rounded-lg">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">{themeStore.currentPreset.label}</p>
          <p class="text-xs text-muted-foreground capitalize">
            {themeStore.currentPreset.category} theme
          </p>
        </div>
        <div class="flex gap-1">
          <div
            class="h-4 w-4 rounded-full border"
            style="background-color: {currentColors?.background}"
            title="Background"
          ></div>
          <div
            class="h-4 w-4 rounded-full border"
            style="background-color: {currentColors?.primary}"
            title="Primary"
          ></div>
          <div
            class="h-4 w-4 rounded-full border"
            style="background-color: {currentColors?.foreground}"
            title="Foreground"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
