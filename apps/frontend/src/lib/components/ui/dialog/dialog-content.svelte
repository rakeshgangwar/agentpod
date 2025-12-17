<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
		<DialogPrimitive.Content
			bind:ref
			data-slot="dialog-content"
			class={cn(
				"bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 pointer-events-auto grid w-full max-w-lg gap-4 rounded-lg border p-6 shadow-lg duration-200 max-h-[calc(100dvh-2rem)] overflow-y-auto",
				className
			)}
			{...restProps}
		>
			{@render children?.()}
			{#if showCloseButton}
				<DialogPrimitive.Close
					class="ring-offset-background focus:ring-ring rounded-xs focus:outline-hidden absolute end-4 top-4 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
				>
					<XIcon />
					<span class="sr-only">Close</span>
				</DialogPrimitive.Close>
			{/if}
		</DialogPrimitive.Content>
	</div>
</DialogPortal>
