<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ComponentProps<typeof CollapsiblePrimitive.Content> = $props();
</script>

<CollapsiblePrimitive.Content
  bind:ref
  class={cn(
    "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</CollapsiblePrimitive.Content>
