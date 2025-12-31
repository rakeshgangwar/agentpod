<script lang="ts">
  import { parseError, type ErrorCategory } from "$lib/utils/errors";
  import { X } from "@lucide/svelte";

  interface Props {
    /** Error to display (string, Error object, or any error) */
    error?: unknown;
    /** Direct message to display (overrides error prop) */
    message?: string;
    /** Error category for styling (auto-detected if not provided) */
    category?: ErrorCategory;
    /** Show action suggestion */
    showAction?: boolean;
    /** Allow dismissing the error */
    dismissible?: boolean;
    /** Callback when dismissed */
    onDismiss?: () => void;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    error = undefined,
    message = undefined,
    category = undefined,
    showAction = true,
    dismissible = false,
    onDismiss = undefined,
    class: className = "",
  }: Props = $props();

  // Parse the error
  const parsed = $derived.by(() => {
    if (message) {
      return {
        message,
        category: category || "unknown" as ErrorCategory,
        action: undefined,
        original: undefined,
      };
    }
    if (error) {
      const p = parseError(error);
      return {
        ...p,
        category: category || p.category,
      };
    }
    return null;
  });

  // Get styles based on category
  const styles = $derived.by(() => {
    const cat = parsed?.category || "unknown";
    switch (cat) {
      case "auth":
      case "permission":
      case "resource_limit":
        return {
          border: "border-[var(--cyber-orange)]/50",
          bg: "bg-[var(--cyber-orange)]/5",
          text: "text-[var(--cyber-orange)]",
          label: cat === "resource_limit" ? "limit" : cat === "permission" ? "denied" : "auth",
        };
      case "network":
      case "timeout":
        return {
          border: "border-[var(--cyber-yellow)]/50",
          bg: "bg-[var(--cyber-yellow)]/5",
          text: "text-[var(--cyber-yellow)]",
          label: cat === "timeout" ? "timeout" : "network",
        };
      default:
        return {
          border: "border-[var(--cyber-red)]/50",
          bg: "bg-[var(--cyber-red)]/5",
          text: "text-[var(--cyber-red)]",
          label: "error",
        };
    }
  });

  function handleDismiss() {
    onDismiss?.();
  }
</script>

{#if parsed}
  <div
    class="p-3 rounded border {styles.border} {styles.bg} {className}"
    role="alert"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <span class="font-mono text-xs uppercase tracking-wider {styles.text}">
          [{styles.label}]
        </span>
        <p class="text-sm {styles.text} mt-1">
          {parsed.message}
        </p>
        {#if showAction && parsed.action}
          <p class="text-xs text-muted-foreground mt-2">
            {parsed.action}
          </p>
        {/if}
      </div>
      {#if dismissible}
        <button
          type="button"
          onclick={handleDismiss}
          class="p-1 rounded hover:bg-foreground/10 transition-colors {styles.text}"
          aria-label="Dismiss error"
        >
          <X class="w-4 h-4" />
        </button>
      {/if}
    </div>
  </div>
{/if}
