<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    children,
    ...restProps
  }: ComponentProps<typeof CollapsiblePrimitive.Trigger> = $props();
</script>

<CollapsiblePrimitive.Trigger bind:ref {...restProps}>
  {@render children?.()}
</CollapsiblePrimitive.Trigger>
