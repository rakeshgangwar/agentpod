<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import CameraIcon from "@lucide/svelte/icons/camera";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import LinkIcon from "@lucide/svelte/icons/link";
  import { toast } from "svelte-sonner";

  let { 
    url = null, 
    onRefresh,
    onOpenExternal,
    onScreenshot,
    isRefreshing = false,
    isPublic = false,
    publicToken = undefined,
    publicExpiresAt = undefined,
    shareUrl = undefined,
    onShare,
    onUnshare,
    isSharing = false
  } = $props<{ 
    url: string | null; 
    onRefresh: () => void;
    onOpenExternal: () => void;
    onScreenshot?: () => void;
    isRefreshing?: boolean;
    isPublic?: boolean;
    publicToken?: string;
    publicExpiresAt?: string;
    shareUrl?: string;
    onShare?: (expiresIn: string) => Promise<void>;
    onUnshare?: () => Promise<void>;
    isSharing?: boolean;
  }>();

  let isCapturing = $state(false);
  let sharePopoverOpen = $state(false);
  let selectedExpiration = $state("24h");
  
  const expirationOptions = [
    { value: "1h", label: "1 hour", seconds: 3600 },
    { value: "24h", label: "24 hours", seconds: 86400 },
    { value: "7d", label: "7 days", seconds: 604800 },
    { value: "30d", label: "30 days", seconds: 2592000 }
  ];

  async function handleScreenshot() {
    if (!onScreenshot || isCapturing) return;
    
    isCapturing = true;
    try {
      await onScreenshot();
    } finally {
      // Small delay to prevent double-clicks
      setTimeout(() => {
        isCapturing = false;
      }, 500);
    }
  }

  async function handleShare() {
    if (!onShare) return;
    await onShare(selectedExpiration);
  }

  async function handleUnshare() {
    if (!onUnshare) return;
    await onUnshare();
    sharePopoverOpen = false;
  }
  
  function copyShareLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard");
  }

  function getExpirationLabel() {
    if (!publicExpiresAt) return "";
    const date = new Date(publicExpiresAt);
    return date.toLocaleString();
  }
</script>

<div class="h-10 border-b border-border flex items-center px-2 bg-muted/40 gap-2 shrink-0">
  <div class="flex-1 flex items-center bg-background border border-border rounded-sm px-3 h-7 text-xs font-mono text-muted-foreground overflow-hidden">
    {#if url}
      <span class="truncate select-all text-foreground">{url}</span>
    {:else}
      <span class="opacity-50 italic">No preview URL</span>
    {/if}
  </div>

  <div class="flex items-center gap-1">
    {#if onShare}
      <Popover.Root bind:open={sharePopoverOpen}>
        <Popover.Trigger>
          <Button 
            variant={isPublic ? "secondary" : "ghost"}
            size="icon" 
            class="h-7 w-7 rounded-sm {isPublic ? 'text-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' : ''}" 
            title="Share preview"
            disabled={!url || isSharing}
          >
            {#if isSharing}
              <Loader2Icon class="h-3.5 w-3.5 animate-spin" />
            {:else}
              <Share2Icon class="h-3.5 w-3.5" />
            {/if}
          </Button>
        </Popover.Trigger>
        <Popover.Content class="w-80 p-0" align="end">
          <div class="p-4 flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <h4 class="font-medium leading-none">Share Preview</h4>
              <p class="text-xs text-muted-foreground">
                Make this port accessible publicly via a secure tunnel.
              </p>
            </div>
            
            <Separator />
            
            {#if isPublic && publicToken}
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-2">
                  <Label class="text-xs">Public Link</Label>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-muted rounded-md px-3 py-1.5 text-xs font-mono truncate select-all border border-border">
                      {shareUrl || "No share URL"}
                    </div>
                    <Button variant="outline" size="icon" class="h-8 w-8 shrink-0" onclick={copyShareLink}>
                      <CopyIcon class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Expires:</span>
                  <span class="font-mono">{getExpirationLabel()}</span>
                </div>
                
                <Button variant="destructive" size="sm" class="w-full mt-2" onclick={handleUnshare} disabled={isSharing}>
                  {#if isSharing}
                    <Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
                  {/if}
                  Revoke Access
                </Button>
              </div>
            {:else}
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-2">
                  <Label class="text-xs">Expiration</Label>
                  <Select.Root type="single" bind:value={selectedExpiration}>
                    <Select.Trigger class="h-8 text-xs">
                      {expirationOptions.find(o => o.value === selectedExpiration)?.label || "24 hours"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each expirationOptions as option}
                        <Select.Item value={option.value} label={option.label} class="text-xs" />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                
                <Button class="w-full mt-2" size="sm" onclick={handleShare} disabled={isSharing}>
                  {#if isSharing}
                    <Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
                  {:else}
                    <LinkIcon class="mr-2 h-3.5 w-3.5" />
                  {/if}
                  Create Share Link
                </Button>
              </div>
            {/if}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/if}

    {#if onScreenshot}
      <Button 
        variant="ghost" 
        size="icon" 
        class="h-7 w-7 rounded-sm" 
        title="Capture screenshot"
        disabled={!url || isCapturing}
        onclick={handleScreenshot}
      >
        <CameraIcon class="h-3.5 w-3.5 {isCapturing ? 'text-[var(--cyber-cyan)]' : ''}" />
      </Button>
    {/if}

    <Button 
      variant="ghost" 
      size="icon" 
      class="h-7 w-7 rounded-sm" 
      title="Refresh preview"
      disabled={!url}
      onclick={onRefresh}
    >
      <RefreshCwIcon class="h-3.5 w-3.5 {isRefreshing ? 'animate-spin' : ''}" />
    </Button>
    
    <Button 
      variant="ghost" 
      size="icon" 
      class="h-7 w-7 rounded-sm" 
      title="Open in browser"
      disabled={!url}
      onclick={onOpenExternal}
    >
      <ExternalLinkIcon class="h-3.5 w-3.5" />
    </Button>
  </div>
</div>
