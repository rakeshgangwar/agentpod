---
description: Create a new Svelte component following project patterns
agent: tauri-frontend
---

# Create Component: $ARGUMENTS

Create a new Svelte 5 component following these guidelines:

## Component Structure

```svelte
<script lang="ts">
  // 1. Imports (external, then internal)
  import { type Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button";
  
  // 2. Props with types
  let {
    // Required props first
    title,
    // Optional props with defaults
    variant = "default",
    // Event handlers
    onClick,
    // Snippets for composition
    children,
  }: {
    title: string;
    variant?: "default" | "primary" | "secondary";
    onClick?: () => void;
    children?: Snippet;
  } = $props();
  
  // 3. State
  let isHovered = $state(false);
  
  // 4. Derived values
  let computedClass = $derived(/* ... */);
  
  // 5. Effects
  $effect(() => {
    // Side effects
  });
  
  // 6. Functions
  function handleClick() {
    onClick?.();
  }
</script>

<!-- Template with semantic HTML -->
<div class="component-name">
  {@render children?.()}
</div>

<!-- Scoped styles only if needed -->
<style>
  /* Prefer Tailwind, use this sparingly */
</style>
```

## Requirements

1. **TypeScript**: Full type safety for props and events
2. **Svelte 5 Runes**: Use $state, $derived, $effect, $props
3. **Accessibility**: 
   - Semantic HTML
   - ARIA attributes where needed
   - Keyboard support
4. **Responsive**: 
   - Mobile-first approach
   - Tailwind responsive utilities
5. **Design System**: 
   - Use CSS variables (--background, --foreground, etc.)
   - Follow existing component patterns
6. **Composition**: 
   - Use Snippets for flexible content
   - Prefer composition over configuration

## File Location

Place the component in the appropriate location:
- Generic UI primitives: `src/lib/components/ui/`
- Feature components: `src/lib/components/`
- Page-specific: Adjacent to the route

## Also Create

- TypeScript types if complex (in same file or adjacent .ts)
- Export from index.ts if in ui/ folder
- Usage example in comments

Parse $ARGUMENTS for the component name and purpose. If not provided, ask for clarification.
