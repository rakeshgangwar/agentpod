<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { 
    previewStore, 
    fetchPorts, 
    detectPorts, 
    selectPort,
    sharePort,
    unsharePort
  } from "$lib/stores/preview.svelte";
  import { getSandbox, sandboxes } from "$lib/stores/sandboxes.svelte";
  import PreviewFrame from "$lib/components/preview/PreviewFrame.svelte";
  import PreviewToolbar from "$lib/components/preview/PreviewToolbar.svelte";
  import PortSelector from "$lib/components/preview/PortSelector.svelte";
  import ConsolePanel, { type ConsoleLog } from "$lib/components/preview/ConsolePanel.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import { toast } from "svelte-sonner";

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(getSandbox(sandboxId));
  
  let ports = $derived(previewStore.getPorts(sandboxId));
  let selectedPort = $derived(previewStore.getSelectedPort(sandboxId));
  let currentPort = $derived(ports.find(p => p.port === selectedPort));
  let isLoading = $derived(previewStore.isLoading);
  let previewUrl = $derived(
    selectedPort && sandbox 
      ? previewStore.getPreviewUrl(sandboxId, selectedPort, sandbox.slug) 
      : null
  );

  let logs = $state<ConsoleLog[]>([]);
  let isRefreshing = $state(false);
  let isDetecting = $state(false);
  let isSharing = $state(false);
  let shareUrl = $state<string | undefined>(undefined);

  onMount(() => {
    if (sandboxId) {
      fetchPorts(sandboxId).then((fetchedPorts: any[]) => {
        if (fetchedPorts.length === 0 && sandbox?.status === "running") {
          silentDetectPorts();
        }
      });
    }
  });

  async function silentDetectPorts() {
    isDetecting = true;
    try {
      await detectPorts(sandboxId);
    } catch (e) {
      console.error("Failed to silently detect ports", e);
    } finally {
      isDetecting = false;
    }
  }

  async function handleDetectPorts() {
    isDetecting = true;
    try {
      const detected = await detectPorts(sandboxId);
      if (detected.length > 0) {
        toast.success(`Detected ${detected.length} open port${detected.length === 1 ? '' : 's'}`);
      } else {
        toast.info("No open ports detected");
      }
    } catch (e) {
      toast.error("Failed to detect ports");
    } finally {
      isDetecting = false;
    }
  }

  function handleSelectPort(port: number) {
    selectPort(sandboxId, port);
    logs = [];
  }

  function handleRefresh() {
    isRefreshing = true;
    const currentUrl = previewUrl;
    setTimeout(() => {
      isRefreshing = false;
    }, 500);
  }

  function handleOpenExternal() {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }

  function handleConsoleMessage(log: ConsoleLog) {
    logs = [...logs, log].slice(-1000);
  }

  function handleClearConsole() {
    logs = [];
  }
  
  async function handleShare(expiresIn: string) {
    if (!selectedPort) return;
    
    isSharing = true;
    try {
      const result = await sharePort(sandboxId, selectedPort, expiresIn);
      if (result) {
        shareUrl = result.url;
        toast.success(`Port ${selectedPort} is now public`);
      } else {
        toast.error("Failed to share port");
      }
    } catch (e) {
      toast.error("Error sharing port");
      console.error(e);
    } finally {
      isSharing = false;
    }
  }

  async function handleUnshare() {
    if (!selectedPort) return;
    
    isSharing = true;
    try {
      const result = await unsharePort(sandboxId, selectedPort);
      if (result) {
        shareUrl = undefined;
        toast.success(`Revoked public access for port ${selectedPort}`);
      } else {
        toast.error("Failed to revoke access");
      }
    } catch (e) {
      toast.error("Error revoking access");
      console.error(e);
    } finally {
      isSharing = false;
    }
  }
</script>

<div class="h-full flex flex-col overflow-hidden">
  {#if !sandbox}
    <div class="flex items-center justify-center h-full">
      <div class="text-muted-foreground">Sandbox not found</div>
    </div>
  {:else if sandbox.status !== "running"}
    <SandboxNotRunning {sandbox} icon="🌐" actionText="view the preview" />
  {:else}
    <div class="flex-none p-2 border-b border-border bg-muted/20 flex items-center justify-between gap-4">
      <PortSelector 
        {ports} 
        {selectedPort} 
        onSelect={handleSelectPort} 
        onDetect={handleDetectPorts}
        {isDetecting}
      />
      
      <div class="flex-1">
        <PreviewToolbar 
          url={previewUrl}
          onRefresh={handleRefresh}
          onOpenExternal={handleOpenExternal}
          {isRefreshing}
          isPublic={currentPort?.isPublic ?? false}
          publicToken={currentPort?.publicToken}
          publicExpiresAt={currentPort?.publicExpiresAt}
          {shareUrl}
          onShare={selectedPort ? handleShare : undefined}
          onUnshare={selectedPort ? handleUnshare : undefined}
          {isSharing}
        />
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col bg-background relative">

      {#if previewUrl}
        {#key isRefreshing} 
          <PreviewFrame 
            url={previewUrl} 
            title={`Preview ${selectedPort}`}
            onConsoleMessage={handleConsoleMessage}
          />
        {/key}
      {:else}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <div class="bg-muted/30 p-8 rounded-lg border border-border/50 text-center max-w-md">
            <div class="text-4xl mb-4">🔌</div>
            <h3 class="text-lg font-bold mb-2">No Port Selected</h3>
            <p class="text-sm mb-6">
              Select a port from the dropdown above or click "Detect" to scan for running services.
            </p>
            <button 
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              onclick={handleDetectPorts}
              disabled={isDetecting}
            >
              {isDetecting ? 'Scanning...' : 'Scan for Ports'}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <div class="flex-none">
      <ConsolePanel {logs} onClear={handleClearConsole} />
    </div>
  {/if}
</div>
