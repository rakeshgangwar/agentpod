<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    open = $bindable(false),
    children,
    ...restProps
  }: ComponentProps<typeof CollapsiblePrimitive.Root> = $props();
</script>

<CollapsiblePrimitive.Root bind:ref bind:open {...restProps}>
  {@render children?.()}
</CollapsiblePrimitive.Root>
