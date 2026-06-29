<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { provisionRuntime } from "$lib/api/client";

  interface Props {
    open: boolean;
    providers: string[];
    onClose: () => void;
    onCreated?: () => void;
  }

  let { open, providers, onClose, onCreated }: Props = $props();

  const tiers = ["small", "medium", "large"];

  // provider/name/tier are reset each time the dialog opens via $effect
  let provider = $state("");
  let name = $state("");
  let resourceTier = $state("small");
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  // Reset all fields when the dialog opens so each session is clean
  $effect(() => {
    if (open) {
      name = "";
      error = null;
      resourceTier = "small";
      provider = providers[0] ?? "docker";
    }
  });

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || isCreating) return;
    isCreating = true;
    error = null;
    try {
      await provisionRuntime({ provider, name: trimmedName, resourceTier });
      onCreated?.();
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to provision runtime";
    } finally {
      isCreating = false;
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false}>
      <Dialog.Header>
        <Dialog.Title class="font-mono">New Runtime</Dialog.Title>
        <Dialog.Description>Provision a new managed node-agent runtime.</Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <!-- Provider select -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium font-mono" for="runtime-provider">Provider</label>
          <Select.Root
            type="single"
            value={provider}
            onValueChange={(v: string | string[]) => {
              provider = Array.isArray(v) ? (v[0] ?? "") : v;
            }}
          >
            <Select.Trigger class="w-full" id="runtime-provider">
              {provider || "Select provider"}
            </Select.Trigger>
            <Select.Content>
              {#each providers as p (p)}
                <Select.Item value={p}>{p}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Name input -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium font-mono" for="runtime-name">Name</label>
          <Input
            id="runtime-name"
            placeholder="Runtime name"
            bind:value={name}
            class="font-mono"
            disabled={isCreating}
          />
        </div>

        <!-- Resource tier select -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium font-mono" for="runtime-tier">Resource tier</label>
          <Select.Root
            type="single"
            value={resourceTier}
            onValueChange={(v: string | string[]) => {
              resourceTier = Array.isArray(v) ? (v[0] ?? "small") : v;
            }}
          >
            <Select.Trigger class="w-full" id="runtime-tier">
              {resourceTier || "Select tier"}
            </Select.Trigger>
            <Select.Content>
              {#each tiers as t (t)}
                <Select.Item value={t}>{t}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Inline error -->
        {#if error}
          <p class="text-sm font-mono text-destructive" role="alert">{error}</p>
        {/if}
      </div>

      <Dialog.Footer>
        <Button variant="outline" onclick={onClose} disabled={isCreating}>Cancel</Button>
        <Button
          onclick={handleCreate}
          disabled={!name.trim() || isCreating}
          class="font-mono"
        >
          {isCreating ? "Creating…" : "Create"}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
