<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

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

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onCancel();
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false}>
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{message}</Dialog.Description>
      </Dialog.Header>

      <p class="text-sm text-foreground">
        Type <code class="rounded bg-muted px-1 py-0.5 font-mono text-sm font-bold text-foreground"
          >{confirmPhrase}</code
        > to confirm:
      </p>

      <input
        type="text"
        class="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none transition-[color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/50"
        placeholder={confirmPhrase}
        bind:value={typed}
        autofocus
      />

      <Dialog.Footer>
        <Button variant="outline" onclick={onCancel}>Cancel</Button>
        <Button variant="destructive" disabled={!confirmed} onclick={onConfirm}
          >{confirmLabel}</Button
        >
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
