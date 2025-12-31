# Phase 6: Technical Notes

## Svelte Animations

### Page Transitions

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { fly, fade } from 'svelte/transition';
  import { page } from '$app/stores';
</script>

{#key $page.url.pathname}
  <div in:fade={{ duration: 200 }} out:fade={{ duration: 100 }}>
    <slot />
  </div>
{/key}
```

### List Animations

```svelte
<script>
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
</script>

{#each items as item (item.id)}
  <div
    animate:flip={{ duration: 300 }}
    in:fly={{ y: 20, duration: 300 }}
    out:fade={{ duration: 200 }}
  >
    <ProjectCard {item} />
  </div>
{/each}
```

### Button Press Animation

```svelte
<style>
  button {
    transition: transform 0.1s ease;
  }
  
  button:active {
    transform: scale(0.95);
  }
</style>
```

### Loading Skeleton

```svelte
<!-- src/lib/components/Skeleton.svelte -->
<script>
  export let width = '100%';
  export let height = '1rem';
</script>

<div class="skeleton" style="width: {width}; height: {height};" />

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      #e0e0e0 25%,
      #f0f0f0 50%,
      #e0e0e0 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }
  
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
```

---

## Performance Optimization

### Virtual List for Chat Messages

```svelte
<!-- Use svelte-virtual-list or similar -->
<script>
  import VirtualList from 'svelte-virtual-list';
  
  export let messages;
</script>

<VirtualList items={messages} let:item>
  <Message message={item} />
</VirtualList>
```

### Debounced Search

```typescript
// src/lib/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
```

```svelte
<script>
  import { debounce } from '$lib/utils/debounce';
  
  let searchQuery = '';
  
  const handleSearch = debounce((query: string) => {
    // Perform search
  }, 300);
  
  $: handleSearch(searchQuery);
</script>

<input bind:value={searchQuery} placeholder="Search..." />
```

### Lazy Loading Routes

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: true,
    }),
  },
};
```

---

## Error Handling

### Global Error Boundary

```svelte
<!-- src/routes/+error.svelte -->
<script>
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <h1>Something went wrong</h1>
  <p>{$page.error?.message || 'An unexpected error occurred'}</p>
  
  <div class="actions">
    <button on:click={() => location.reload()}>
      Try Again
    </button>
    <a href="/">Go Home</a>
  </div>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 2rem;
    text-align: center;
  }
  
  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }
</style>
```

### API Error Wrapper

```typescript
// src/lib/api/errors.ts

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You don\'t have permission to do this.';
      case 404:
        return 'The requested item was not found.';
      case 500:
        return 'Something went wrong on our end. Please try again.';
      default:
        return error.message || 'An error occurred.';
    }
  }
  
  if (error instanceof Error) {
    if (error.message.includes('network')) {
      return 'Unable to connect. Please check your internet connection.';
    }
    return error.message;
  }
  
  return 'An unexpected error occurred.';
}
```

### Toast Notifications

```svelte
<!-- src/lib/components/Toast.svelte -->
<script>
  import { fly } from 'svelte/transition';
  
  export let message: string;
  export let type: 'success' | 'error' | 'info' = 'info';
  export let duration = 3000;
  
  import { createEventDispatcher, onMount } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  onMount(() => {
    const timer = setTimeout(() => dispatch('dismiss'), duration);
    return () => clearTimeout(timer);
  });
</script>

<div
  class="toast {type}"
  transition:fly={{ y: 50, duration: 300 }}
>
  {message}
</div>

<style>
  .toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .success { background: #34c759; }
  .error { background: #ff3b30; }
  .info { background: #007aff; }
</style>
```

---

## Accessibility

### ARIA Labels

```svelte
<button
  aria-label="Start project"
  aria-pressed={isRunning}
  on:click={toggleProject}
>
  {isRunning ? '■' : '▶'}
</button>

<input
  type="text"
  id="project-name"
  aria-describedby="name-hint"
  bind:value={name}
/>
<p id="name-hint" class="hint">
  Enter a unique name for your project
</p>
```

### Focus Management

```svelte
<script>
  import { onMount } from 'svelte';
  
  let input: HTMLInputElement;
  
  onMount(() => {
    // Focus input when modal opens
    input?.focus();
  });
</script>

<input bind:this={input} />
```

### Respect Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

```svelte
<script>
  import { browser } from '$app/environment';
  
  const prefersReducedMotion = browser
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
</script>

{#if !prefersReducedMotion}
  <div transition:fly={{ y: 20 }}>Content</div>
{:else}
  <div>Content</div>
{/if}
```

---

## Onboarding

### Feature Carousel

```svelte
<!-- src/routes/onboarding/+page.svelte -->
<script>
  import { goto } from '$app/navigation';
  
  const features = [
    {
      title: 'AI-Powered Development',
      description: 'Control your AI coding agent from anywhere',
      icon: '🤖',
    },
    {
      title: 'Real-time Updates',
      description: 'See changes as they happen',
      icon: '⚡',
    },
    {
      title: 'File Browser',
      description: 'Browse and view code on the go',
      icon: '📁',
    },
  ];
  
  let currentIndex = 0;
  
  function next() {
    if (currentIndex < features.length - 1) {
      currentIndex++;
    } else {
      goto('/setup');
    }
  }
</script>

<div class="onboarding">
  <div class="feature">
    <span class="icon">{features[currentIndex].icon}</span>
    <h2>{features[currentIndex].title}</h2>
    <p>{features[currentIndex].description}</p>
  </div>
  
  <div class="dots">
    {#each features as _, i}
      <span class="dot" class:active={i === currentIndex} />
    {/each}
  </div>
  
  <button on:click={next}>
    {currentIndex < features.length - 1 ? 'Next' : 'Get Started'}
  </button>
</div>
```

### Empty State with Guidance

```svelte
<!-- src/lib/components/EmptyState.svelte -->
<script>
  export let icon = '📭';
  export let title: string;
  export let description: string;
  export let actionLabel: string;
  export let onAction: () => void;
</script>

<div class="empty-state">
  <span class="icon">{icon}</span>
  <h3>{title}</h3>
  <p>{description}</p>
  <button on:click={onAction}>{actionLabel}</button>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }
  
  .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0 0 0.5rem;
  }
  
  p {
    color: #666;
    margin: 0 0 1.5rem;
  }
  
  button {
    background: #007aff;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
```

---

## Bundle Analysis

```bash
# Install analyzer
npm install -D rollup-plugin-visualizer

# Add to vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({
      filename: 'stats.html',
      open: true,
    }),
  ],
};

# Build and analyze
npm run build
```

## Memory Profiling

```typescript
// Debug helper for development
export function logMemoryUsage() {
  if ('memory' in performance) {
    const { usedJSHeapSize, totalJSHeapSize } = (performance as any).memory;
    console.log(`Memory: ${(usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
  }
}
```
