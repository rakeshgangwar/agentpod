<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { 
    validateImportedWorkflow, 
    parseWorkflowJson,
    convertToSvelteFlowFormat,
    type ImportedWorkflow 
  } from "./workflow-import-export";
  import type { ISvelteFlowNode, ISvelteFlowEdge } from "@agentpod/types";

  import UploadIcon from "@lucide/svelte/icons/upload";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";

  interface Props {
    open: boolean;
    onImport: (nodes: ISvelteFlowNode[], edges: ISvelteFlowEdge[], name?: string, description?: string) => void;
    onClose: () => void;
  }

  let { open = $bindable(), onImport, onClose }: Props = $props();

  let jsonInput = $state("");
  let errors = $state<string[]>([]);
  let warnings = $state<string[]>([]);
  let isValid = $state(false);
  let parsedWorkflow = $state<ImportedWorkflow | null>(null);
  let activeTab = $state<"paste" | "file">("paste");
  let fileInput: HTMLInputElement;
  let isDragging = $state(false);

  function resetState() {
    jsonInput = "";
    errors = [];
    warnings = [];
    isValid = false;
    parsedWorkflow = null;
  }

  function validateInput(input: string) {
    if (!input.trim()) {
      errors = [];
      warnings = [];
      isValid = false;
      parsedWorkflow = null;
      return;
    }

    const parseResult = parseWorkflowJson(input);
    if (!parseResult.success) {
      errors = [`JSON Parse Error: ${parseResult.error}`];
      warnings = [];
      isValid = false;
      parsedWorkflow = null;
      return;
    }

    const validationResult = validateImportedWorkflow(parseResult.data);
    errors = validationResult.errors;
    warnings = validationResult.warnings;
    isValid = validationResult.valid;
    parsedWorkflow = validationResult.workflow || null;
  }

  function handleJsonChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    jsonInput = target.value;
    validateInput(jsonInput);
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      readFile(file);
    }
  }

  function readFile(file: File) {
    if (!file.name.endsWith(".json")) {
      errors = ["Please select a JSON file"];
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      jsonInput = content;
      validateInput(content);
      activeTab = "paste";
    };
    reader.onerror = () => {
      errors = ["Failed to read file"];
    };
    reader.readAsText(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    
    const file = event.dataTransfer?.files[0];
    if (file) {
      readFile(file);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleImport() {
    if (!parsedWorkflow || !isValid) return;

    const { nodes, edges } = convertToSvelteFlowFormat(parsedWorkflow);
    onImport(nodes, edges, parsedWorkflow.name, parsedWorkflow.description);
    resetState();
    open = false;
  }

  function handleClose() {
    resetState();
    onClose();
  }

  $effect(() => {
    if (!open) {
      resetState();
    }
  });
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => !isOpen && handleClose()}>
  <Dialog.Content class="max-w-2xl bg-card border-border/50">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-lg uppercase tracking-wider flex items-center gap-2">
        <FileJsonIcon class="h-5 w-5 text-[var(--cyber-cyan)]" />
        Import Workflow
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground text-sm">
        Paste workflow JSON or upload a .json file to import nodes and edges.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      <div class="flex gap-2 border-b border-border/30">
        <button
          class="px-4 py-2 text-sm font-mono uppercase tracking-wider transition-colors {activeTab === 'paste' 
            ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)]' 
            : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => activeTab = "paste"}
        >
          Paste JSON
        </button>
        <button
          class="px-4 py-2 text-sm font-mono uppercase tracking-wider transition-colors {activeTab === 'file' 
            ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)]' 
            : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => activeTab = "file"}
        >
          Upload File
        </button>
      </div>

      {#if activeTab === "paste"}
        <div class="space-y-2">
          <textarea
            value={jsonInput}
            oninput={handleJsonChange}
            placeholder={'{"name": "My Workflow", "nodes": [...], "edges": [...]}'}
            class="w-full h-64 p-3 rounded-lg bg-background border border-border/50 font-mono text-sm resize-none focus:outline-none focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]/30"
            spellcheck="false"
          ></textarea>
        </div>
      {:else}
        <div
          class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {isDragging 
            ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
            : 'border-border/50 hover:border-border'}"
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === "Enter" && fileInput?.click()}
        >
          <UploadIcon class="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <p class="text-sm text-muted-foreground mb-2">
            Drag and drop a .json file here, or
          </p>
          <Button
            variant="outline"
            size="sm"
            onclick={() => fileInput?.click()}
            class="font-mono text-xs uppercase"
          >
            Browse Files
          </Button>
          <input
            bind:this={fileInput}
            type="file"
            accept=".json,application/json"
            onchange={handleFileSelect}
            class="hidden"
          />
        </div>
      {/if}

      {#if errors.length > 0}
        <div class="p-3 rounded-lg bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30">
          <div class="flex items-start gap-2">
            <AlertCircleIcon class="h-4 w-4 text-[var(--cyber-red)] mt-0.5 shrink-0" />
            <div class="space-y-1">
              {#each errors as error}
                <p class="text-xs text-[var(--cyber-red)]">{error}</p>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if warnings.length > 0}
        <div class="p-3 rounded-lg bg-[var(--cyber-amber)]/10 border border-[var(--cyber-amber)]/30">
          <div class="flex items-start gap-2">
            <AlertTriangleIcon class="h-4 w-4 text-[var(--cyber-amber)] mt-0.5 shrink-0" />
            <div class="space-y-1">
              {#each warnings as warning}
                <p class="text-xs text-[var(--cyber-amber)]">{warning}</p>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if isValid && parsedWorkflow}
        <div class="p-3 rounded-lg bg-[var(--cyber-emerald)]/10 border border-[var(--cyber-emerald)]/30">
          <div class="flex items-start gap-2">
            <CheckCircleIcon class="h-4 w-4 text-[var(--cyber-emerald)] mt-0.5 shrink-0" />
            <div class="text-xs text-[var(--cyber-emerald)]">
              <p class="font-medium">Valid workflow: "{parsedWorkflow.name}"</p>
              <p class="text-[var(--cyber-emerald)]/80">
                {parsedWorkflow.nodes.length} nodes, {parsedWorkflow.edges.length} edges
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex gap-2">
      <Button
        variant="outline"
        onclick={handleClose}
        class="font-mono text-xs uppercase"
      >
        Cancel
      </Button>
      <Button
        onclick={handleImport}
        disabled={!isValid}
        class="cyber-btn-primary font-mono text-xs uppercase"
      >
        <UploadIcon class="h-4 w-4 mr-2" />
        Import Workflow
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
