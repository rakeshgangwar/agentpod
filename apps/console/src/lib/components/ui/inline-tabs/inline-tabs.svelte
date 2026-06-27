<script lang="ts" module>
  import type { Component } from "svelte";
  import { tv, type VariantProps } from "tailwind-variants";

  export const inlineTabsVariants = tv({
    slots: {
      root: "bg-background/30 border border-border/30 rounded p-1",
      trigger:
        "flex items-center justify-center gap-1 font-mono uppercase tracking-wider rounded transition-all",
      badge: "px-1 py-0 rounded",
    },
    variants: {
      size: {
        default: {
          trigger: "text-[10px] py-1.5",
          badge: "text-[9px]",
        },
        sm: {
          trigger: "text-[9px] py-1",
          badge: "text-[8px]",
        },
        md: {
          trigger: "text-xs py-2",
          badge: "text-[10px]",
        },
      },
      active: {
        true: {
          trigger: "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]",
          badge: "bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]",
        },
        false: {
          trigger: "text-muted-foreground hover:bg-muted/50",
          badge: "bg-muted/50 text-muted-foreground",
        },
      },
    },
    defaultVariants: {
      size: "default",
      active: false,
    },
  });

  export type InlineTabsSize = VariantProps<typeof inlineTabsVariants>["size"];

  export interface InlineTab {
    value: string;
    label: string;
    count?: number;
    icon?: Component;
  }
</script>

<script lang="ts">
  import { cn } from "$lib/utils.js";

  let {
    tabs,
    value = $bindable(),
    size = "default",
    class: className,
    disabled = false,
  }: {
    tabs: InlineTab[];
    value: string;
    size?: InlineTabsSize;
    class?: string;
    disabled?: boolean;
  } = $props();

  const styles = $derived(inlineTabsVariants({ size }));
</script>

<div
  class={cn(styles.root(), className)}
  style="display: grid; grid-template-columns: repeat({tabs.length}, minmax(0, 1fr));"
  role="tablist"
>
  {#each tabs as tab (tab.value)}
    {@const isActive = value === tab.value}
    {@const activeStyles = inlineTabsVariants({ size, active: isActive })}
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${tab.value}`}
      tabindex={isActive ? 0 : -1}
      {disabled}
      onclick={() => (value = tab.value)}
      class={cn(activeStyles.trigger())}
    >
      {#if tab.icon}
        {@const IconComponent = tab.icon}
        <IconComponent class="w-3 h-3" />
      {/if}
      {tab.label}
      {#if tab.count !== undefined && tab.count > 0}
        <span class={cn(activeStyles.badge())}>
          {tab.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
