<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmPhrase: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmPhrase,
    confirmLabel = "Confirm",
    onConfirm,
    onCancel,
  }: Props = $props();

  let typed = $state("");
  let confirmed = $derived(typed === confirmPhrase);

  // Reset typed input when dialog closes
  $effect(() => {
    if (!open) typed = "";
  });

  function handleOverlayClick(e: MouseEvent) {
    // Only cancel when clicking the backdrop itself, not the dialog
    if (e.target === e.currentTarget) onCancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }
</script>

{#if open}
  <!-- Backdrop + centering wrapper -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="presentation"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
  >
    <!-- Backdrop overlay -->
    <div class="absolute inset-0 bg-black/50"></div>

    <!-- Dialog panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ttc-dialog-title"
      class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
    >
      <h2 id="ttc-dialog-title" class="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">{message}</p>

      <p class="mt-3 text-sm text-foreground">
        Type <code
          class="rounded bg-muted px-1 py-0.5 font-mono text-sm font-bold text-foreground"
          >{confirmPhrase}</code
        > to confirm:
      </p>

      <input
        type="text"
        class="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none transition-[color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/50"
        placeholder={confirmPhrase}
        bind:value={typed}
        autofocus
      />

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
          class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-white shadow-xs hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
          disabled={!confirmed}
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
