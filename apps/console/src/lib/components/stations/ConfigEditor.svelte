<script lang="ts">
  import { onMount } from "svelte";
  import { readFile, writeFile } from "$lib/api/client";
  import { diffLines } from "diff";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";

  interface Props {
    stationId: string;
    path: string;
    onClose?: () => void;
  }

  let { stationId, path, onClose }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────────
  let original = $state("");
  let buffer = $state("");
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let showConfirm = $state(false);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let backupPath = $state<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const hasChanges = $derived(buffer !== original);

  const diff = $derived(
    hasChanges ? diffLines(original, buffer) : []
  );

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const result = await readFile(stationId, path);
      original = result.content;
      buffer = result.content;
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to load file";
    } finally {
      isLoading = false;
    }
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!hasChanges) return;
    isSaving = true;
    saveError = null;
    try {
      const result = await writeFile(stationId, path, buffer, { backup: true });
      original = buffer;
      backupPath = result.backupPath ?? null;
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Failed to save";
    } finally {
      isSaving = false;
      showConfirm = false;
    }
  }
</script>

<div class="flex flex-col h-full min-h-[400px] overflow-hidden rounded-md border border-border bg-background">
  <!-- ── Header ── -->
  <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 text-xs font-mono">
    <span class="truncate text-foreground">{path}</span>
    <div class="ml-auto flex items-center gap-2 shrink-0">
      {#if backupPath}
        <span class="text-[11px] text-muted-foreground font-sans">
          Backup: <span class="font-mono">{backupPath}</span>
        </span>
      {/if}
      {#if saveError}
        <span class="text-[11px] text-destructive font-sans">{saveError}</span>
      {/if}
      {#if onClose}
        <button
          type="button"
          class="rounded border border-input bg-background px-2 py-0.5 text-[11px] font-sans hover:bg-muted/60"
          onclick={onClose}
        >
          Close
        </button>
      {/if}
      <button
        type="button"
        class="rounded border border-primary bg-primary px-2 py-0.5 text-[11px] font-sans text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!hasChanges || isSaving}
        onclick={() => (showConfirm = true)}
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
    </div>
  </div>

  <!-- ── Body ── -->
  {#if isLoading}
    <p class="p-3 text-sm text-muted-foreground">Loading…</p>
  {:else if loadError}
    <p class="p-3 text-sm text-destructive">{loadError}</p>
  {:else}
    <!-- Editor + diff split: editor on top, diff below when changes exist -->
    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- Editable textarea -->
      <div class="flex flex-col flex-1 overflow-hidden" style:flex={hasChanges ? "0 0 50%" : "1 1 100%"}>
        <textarea
          class="w-full h-full resize-none m-0 p-3 font-mono text-[13px] leading-relaxed bg-transparent text-foreground outline-none"
          bind:value={buffer}
        ></textarea>
      </div>

      <!-- Diff view — rendered below the editor whenever there are pending changes -->
      {#if hasChanges}
        <div class="flex flex-col flex-1 overflow-auto border-t border-border bg-muted/10">
          <div class="px-3 py-1 text-[11px] font-sans text-muted-foreground border-b border-border">
            Diff (original → buffer)
          </div>
          <div
            data-testid="diff-view"
            class="flex-1 overflow-auto p-2 font-mono text-[12px] leading-relaxed"
          >
            {#each diff as part (part.value)}
              {#if part.added}
                <pre
                  class="m-0 whitespace-pre-wrap break-all rounded px-1 bg-green-500/15 text-green-700 dark:text-green-400"
                >{part.value}</pre>
              {:else if part.removed}
                <pre
                  class="m-0 whitespace-pre-wrap break-all rounded px-1 bg-red-500/15 text-red-700 dark:text-red-400 line-through"
                >{part.value}</pre>
              {:else}
                <pre
                  class="m-0 whitespace-pre-wrap break-all px-1 text-muted-foreground"
                >{part.value}</pre>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ── Save ConfirmDialog ── -->
<ConfirmDialog
  open={showConfirm}
  title="Save changes to {path}"
  message="Save changes to {path}? A timestamped backup will be created."
  onConfirm={handleSave}
  onCancel={() => (showConfirm = false)}
/>
