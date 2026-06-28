<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = "Confirm",
    onConfirm,
    onCancel,
  }: Props = $props();

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="presentation"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50"></div>

    <!-- Dialog panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
    >
      <h2 id="confirm-dialog-title" class="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">{message}</p>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
          onclick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
