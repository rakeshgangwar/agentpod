<script lang="ts">
  /**
   * Provider Configuration Modal
   * 
   * Handles API key entry for api_key providers and OAuth device flow
   * for OAuth providers like GitHub Copilot.
   */
  
  import { onMount, onDestroy } from "svelte";
  import {
    configureProviderApiKey,
    initOAuthFlow,
    pollOAuthFlow,
    cancelOAuthFlow,
    type OAuthFlowInit,
    type AuthType,
  } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Dialog from "$lib/components/ui/dialog";
  
  // Props
  let {
    providerId,
    providerName,
    authType,
    onClose,
    onComplete,
  }: {
    providerId: string;
    providerName: string;
    authType: AuthType;
    onClose: () => void;
    onComplete: () => void;
  } = $props();
  
  // State
  let apiKey = $state("");
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  
  // OAuth state
  let oauthFlow = $state<OAuthFlowInit | null>(null);
  let oauthPolling = $state(false);
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  
  // Cleanup on unmount
  onDestroy(() => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
  });
  
  // API Key validation
  const isApiKeyValid = $derived(apiKey.trim().length >= 10);
  
  async function handleApiKeySubmit() {
    if (!isApiKeyValid || isSubmitting) return;
    
    isSubmitting = true;
    error = null;
    
    try {
      await configureProviderApiKey(providerId, apiKey.trim());
      onComplete();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save API key";
    } finally {
      isSubmitting = false;
    }
  }
  
  async function startOAuthFlow() {
    isSubmitting = true;
    error = null;
    
    try {
      oauthFlow = await initOAuthFlow(providerId);
      
      // Start polling
      oauthPolling = true;
      pollIntervalId = setInterval(async () => {
        if (!oauthFlow) return;
        
        try {
          const status = await pollOAuthFlow(providerId, oauthFlow.stateId);
          
          if (status.status === "completed") {
            // Success!
            stopPolling();
            onComplete();
          } else if (status.status === "expired" || status.status === "error") {
            error = status.error || "Authentication failed";
            stopPolling();
          }
          // "pending" - keep polling
        } catch (err) {
          error = err instanceof Error ? err.message : "Polling error";
          stopPolling();
        }
      }, (oauthFlow.interval + 1) * 1000); // +1 second buffer
      
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to start OAuth flow";
      oauthFlow = null;
    } finally {
      isSubmitting = false;
    }
  }
  
  function stopPolling() {
    oauthPolling = false;
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }
  
  async function handleCancelOAuth() {
    stopPolling();
    
    if (oauthFlow) {
      try {
        await cancelOAuthFlow(providerId, oauthFlow.stateId);
      } catch {
        // Ignore errors when cancelling
      }
    }
    
    oauthFlow = null;
    onClose();
  }
  
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
</script>

<Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Configure {providerName}</Dialog.Title>
      <Dialog.Description>
        {#if authType === "api_key"}
          Enter your API key to enable this provider.
        {:else}
          Authenticate with {providerName} to enable this provider.
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    
    <div class="space-y-4 py-4">
      {#if error}
        <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      {/if}
      
      {#if authType === "api_key"}
        <!-- API Key Form -->
        <form onsubmit={(e) => { e.preventDefault(); handleApiKeySubmit(); }}>
          <div class="space-y-2">
            <Label for="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-..."
              bind:value={apiKey}
              disabled={isSubmitting}
              autocomplete="off"
            />
            <p class="text-xs text-muted-foreground">
              Your API key will be encrypted before storage.
            </p>
          </div>
          
          <div class="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onclick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isApiKeyValid || isSubmitting}>
              {#if isSubmitting}
                <div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                Saving...
              {:else}
                Save
              {/if}
            </Button>
          </div>
        </form>
        
      {:else if authType === "device_flow" || authType === "oauth"}
        <!-- OAuth Device Flow -->
        {#if oauthFlow}
          <div class="space-y-4 text-center">
            <div class="p-4 bg-muted rounded-lg">
              <p class="text-sm text-muted-foreground mb-2">Enter this code:</p>
              <div class="flex items-center justify-center gap-2">
                <code class="text-2xl font-mono font-bold tracking-widest">
                  {oauthFlow.userCode}
                </code>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onclick={() => copyToClipboard(oauthFlow!.userCode)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </Button>
              </div>
            </div>
            
            <div>
              <p class="text-sm text-muted-foreground mb-2">at</p>
              <a 
                href={oauthFlow.verificationUri} 
                target="_blank" 
                rel="noopener noreferrer"
                class="text-primary underline text-sm font-medium"
              >
                {oauthFlow.verificationUri}
              </a>
            </div>
            
            {#if oauthPolling}
              <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                Waiting for authorization...
              </div>
            {/if}
            
            <Button variant="outline" onclick={handleCancelOAuth}>
              Cancel
            </Button>
          </div>
        {:else}
          <div class="text-center space-y-4">
            <p class="text-sm text-muted-foreground">
              Click below to start the authentication process. You'll be given a code to enter on the {providerName} website.
            </p>
            
            <Button onclick={startOAuthFlow} disabled={isSubmitting} class="w-full">
              {#if isSubmitting}
                <div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                Starting...
              {:else}
                Authenticate with {providerName}
              {/if}
            </Button>
            
            <Button variant="outline" onclick={onClose} class="w-full">
              Cancel
            </Button>
          </div>
        {/if}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
