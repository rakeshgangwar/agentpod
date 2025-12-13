<script lang="ts">
  /**
   * AI Assistant Authentication Modal
   * 
   * Reusable component for authenticating with AI Assistants.
   * Supports four authentication flows:
   * - URL-first (Claude Code style): User visits URL, gets code, enters it here
   * - Code-first (GitHub Copilot style): We show code, user enters it on provider's site
   * - API Key: User enters their API key directly
   * - PKCE OAuth (Anthropic): OAuth 2.0 with PKCE, user authenticates and pastes code
   */
  
  import { onDestroy } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { toast } from "svelte-sonner";
  import type { AgentInstance, AgentAuthInitResponse, AnthropicAuthMode } from "$lib/api/tauri";
  import {
    initAuth,
    completeAuth,
    checkAuthStatus,
  } from "$lib/stores/assistants.svelte";
  import { anthropicOAuthInit, anthropicOAuthCallback } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Tabs from "$lib/components/ui/tabs";
  
  // Icons
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CheckIcon from "@lucide/svelte/icons/check";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";
  import KeyIcon from "@lucide/svelte/icons/key";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  
  // Props
  interface Props {
    assistant: AgentInstance | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
  }
  
  let { assistant, open, onOpenChange, onSuccess }: Props = $props();
  
  // State
  let authResponse = $state<AgentAuthInitResponse | null>(null);
  let authCode = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  
  // PKCE OAuth specific state
  let selectedAuthMode = $state<AnthropicAuthMode>("console");
  let pkceStateId = $state<string | null>(null);
  let isPkceFlow = $derived(
    assistant?.config.authProvider === "anthropic" && 
    assistant?.config.authType === "pkce_oauth"
  );
  
  // Track if we should show mode selector (for Anthropic PKCE)
  let showModeSelector = $state(false);
  
  // Initialize auth when modal opens
  $effect(() => {
    if (open && assistant && !authResponse) {
      // For Anthropic PKCE, show mode selector first instead of auto-initializing
      if (isPkceFlow) {
        showModeSelector = true;
      } else {
        initializeAuth();
      }
    }
    
    // Cleanup when modal closes
    if (!open) {
      cleanup();
      showModeSelector = false;
    }
  });
  
  // Cleanup on destroy
  onDestroy(() => {
    cleanup();
  });
  
  function cleanup() {
    authResponse = null;
    authCode = "";
    error = null;
    copied = false;
    pkceStateId = null;
    stopPolling();
  }
  
  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }
  
  async function initializeAuth() {
    if (!assistant) return;
    
    loading = true;
    error = null;
    
    try {
      // For Anthropic PKCE OAuth, use the dedicated flow
      if (isPkceFlow) {
        const pkceResponse = await anthropicOAuthInit(selectedAuthMode);
        pkceStateId = pkceResponse.stateId;
        authResponse = {
          flowType: "pkce_oauth",
          authUrl: pkceResponse.authUrl,
          expiresIn: pkceResponse.expiresIn,
          message: pkceResponse.message,
          stateId: pkceResponse.stateId,
          authMode: pkceResponse.authMode,
        };
      } else {
        authResponse = await initAuth(assistant.id);
        
        // For code-first flow, start polling for completion
        if (authResponse?.flowType === "code_first") {
          startPolling();
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to initialize authentication";
    } finally {
      loading = false;
    }
  }
  
  function startPolling() {
    if (!assistant) return;
    
    // Poll every 2 seconds for auth completion
    pollingInterval = setInterval(async () => {
      try {
        const isAuth = await checkAuthStatus(assistant!.id);
        if (isAuth) {
          stopPolling();
          handleSuccess();
        }
      } catch (e) {
        // Ignore polling errors, continue polling
        console.debug("Auth polling error:", e);
      }
    }, 2000);
    
    // Stop polling after 10 minutes
    setTimeout(() => {
      if (pollingInterval) {
        stopPolling();
        error = "Authentication timed out. Please try again.";
      }
    }, 10 * 60 * 1000);
  }
  
  async function handleOpenUrl(url: string) {
    try {
      await openUrl(url);
    } catch (e) {
      // Fallback to window.open if Tauri opener fails
      console.warn("Tauri opener failed, using window.open:", e);
      window.open(url, "_blank");
    }
  }
  
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => copied = false, 2000);
    } catch (e) {
      toast.error("Failed to copy to clipboard");
    }
  }
  
  async function handleSubmit() {
    if (!assistant || !authCode.trim()) return;
    
    loading = true;
    error = null;
    
    try {
      // Handle PKCE OAuth flow (Anthropic)
      if (authResponse?.flowType === "pkce_oauth") {
        const result = await anthropicOAuthCallback(authCode.trim(), pkceStateId ?? undefined);
        if (!result.success) {
          throw new Error(result.error || "OAuth authentication failed");
        }
        // OAuth credentials are saved to provider_credentials
        // The agent auth status will check provider credentials automatically
        handleSuccess();
        return;
      }
      
      // For api_key flow, pass as token; for url_first, pass as code
      const isApiKey = authResponse?.flowType === "api_key";
      await completeAuth(
        assistant.id,
        isApiKey ? undefined : authCode.trim(),
        isApiKey ? authCode.trim() : undefined
      );
      
      handleSuccess();
    } catch (e) {
      error = e instanceof Error ? e.message : "Authentication failed";
    } finally {
      loading = false;
    }
  }
  
  function handleSuccess() {
    toast.success(`Successfully signed in to ${assistant?.config.name}`);
    onSuccess?.();
    onOpenChange(false);
  }
  
  function handleClose() {
    onOpenChange(false);
  }
  
  // Get provider display name
  function getProviderName(): string {
    if (assistant?.config.authProvider) {
      return assistant.config.authProvider.charAt(0).toUpperCase() + 
             assistant.config.authProvider.slice(1);
    }
    return "the provider";
  }
  
  // Start PKCE OAuth flow with selected mode
  async function startPkceFlow() {
    showModeSelector = false;
    await initializeAuth();
  }
</script>

<Dialog.Root {open} onOpenChange={handleClose}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>
        {#if assistant}
          Sign in to {assistant.config.name}
        {:else}
          Sign In
        {/if}
      </Dialog.Title>
      <Dialog.Description>
        {#if loading && !authResponse}
          Initializing authentication...
        {:else if authResponse}
          {authResponse.message}
        {:else if error}
          Authentication error
        {:else}
          Complete authentication to use this assistant
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    
    <div class="space-y-4 py-4">
      {#if showModeSelector && isPkceFlow}
        <!-- Anthropic Mode Selector -->
        <div class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Choose how you want to authenticate with Anthropic:
          </p>
          
          <div class="space-y-3">
            <!-- Claude Pro/Max Option -->
            <button
              type="button"
              onclick={() => { selectedAuthMode = "max"; }}
              class="w-full p-4 rounded-lg border text-left transition-colors {selectedAuthMode === 'max' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}"
            >
              <div class="flex items-start gap-3">
                <SparklesIcon class="h-5 w-5 text-primary mt-0.5" />
                <div class="flex-1">
                  <p class="font-medium">Claude Pro / Claude Max</p>
                  <p class="text-xs text-muted-foreground mt-1">
                    Use your existing Claude subscription for free API access. 
                    Best for personal use.
                  </p>
                </div>
              </div>
            </button>
            
            <!-- API Console Option -->
            <button
              type="button"
              onclick={() => { selectedAuthMode = "console"; }}
              class="w-full p-4 rounded-lg border text-left transition-colors {selectedAuthMode === 'console' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}"
            >
              <div class="flex items-start gap-3">
                <TerminalIcon class="h-5 w-5 text-muted-foreground mt-0.5" />
                <div class="flex-1">
                  <p class="font-medium">API Console</p>
                  <p class="text-xs text-muted-foreground mt-1">
                    Create an API key from the Anthropic Console. 
                    Usage is billed to your account.
                  </p>
                </div>
              </div>
            </button>
          </div>
          
          <Button 
            class="w-full" 
            onclick={startPkceFlow}
          >
            Continue
          </Button>
        </div>
        
      {:else if loading && !authResponse}
        <!-- Loading state -->
        <div class="flex flex-col items-center justify-center py-8 gap-3">
          <LoaderIcon class="h-8 w-8 animate-spin text-muted-foreground" />
          <p class="text-sm text-muted-foreground">Connecting to {getProviderName()}...</p>
        </div>
        
      {:else if error && !authResponse}
        <!-- Error state (before auth response) -->
        <div class="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
          <p class="font-medium text-destructive">Authentication Error</p>
          <p class="text-sm text-destructive/80 mt-1">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onclick={initializeAuth}
            class="mt-3"
          >
            Try Again
          </Button>
        </div>
        
      {:else if authResponse}
        <!-- URL-First Flow (Claude Code style) -->
        {#if authResponse.flowType === "url_first"}
          <div class="space-y-4">
            <!-- Step 1: Open sign-in page -->
            <div class="p-4 rounded-lg border bg-muted/30">
              <p class="text-sm font-medium mb-2">Step 1: Sign in</p>
              <p class="text-xs text-muted-foreground mb-3">
                Click the button below to open the sign-in page in your browser.
              </p>
              <Button 
                variant="outline" 
                class="w-full gap-2"
                onclick={() => authResponse?.authUrl && handleOpenUrl(authResponse.authUrl)}
              >
                <ExternalLinkIcon class="h-4 w-4" />
                Sign in with {getProviderName()}
              </Button>
            </div>
            
            <!-- Step 2: Enter code -->
            <div class="p-4 rounded-lg border bg-muted/30">
              <p class="text-sm font-medium mb-2">Step 2: Enter the code</p>
              <p class="text-xs text-muted-foreground mb-3">
                After signing in, you'll receive a code. Paste it below.
              </p>
              <Input 
                bind:value={authCode}
                placeholder="Paste code from browser..."
                class="font-mono"
              />
            </div>
          </div>
          
        <!-- Code-First Flow (GitHub Copilot style) -->
        {:else if authResponse.flowType === "code_first"}
          <div class="space-y-4">
            <!-- Display code -->
            <div class="p-6 rounded-lg border bg-muted/30 text-center">
              <p class="text-sm font-medium mb-3">Enter this code on the verification page:</p>
              <div class="text-3xl font-mono font-bold tracking-[0.3em] py-4 select-all">
                {authResponse.userCode}
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                class="gap-2"
                onclick={() => authResponse?.userCode && copyToClipboard(authResponse.userCode)}
              >
                {#if copied}
                  <CheckIcon class="h-4 w-4 text-green-500" />
                  <span class="text-green-500">Copied!</span>
                {:else}
                  <CopyIcon class="h-4 w-4" />
                  Copy Code
                {/if}
              </Button>
            </div>
            
            <!-- Open verification URL -->
            <Button 
              variant="outline" 
              class="w-full gap-2"
              onclick={() => authResponse?.verificationUrl && handleOpenUrl(authResponse.verificationUrl)}
            >
              <ExternalLinkIcon class="h-4 w-4" />
              Open Verification Page
            </Button>
            
            <!-- Polling status -->
            <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon class="h-4 w-4 animate-spin" />
              <span>Waiting for authentication...</span>
            </div>
          </div>
          
        <!-- API Key Flow -->
        {:else if authResponse.flowType === "api_key"}
          <div class="space-y-4">
            <div class="p-4 rounded-lg border bg-muted/30">
              <div class="flex items-center gap-2 mb-3">
                <KeyIcon class="h-4 w-4 text-muted-foreground" />
                <Label for="api-key" class="text-sm font-medium">API Key</Label>
              </div>
              <p class="text-xs text-muted-foreground mb-3">
                Enter your {getProviderName()} API key to use this assistant.
              </p>
              <Input 
                id="api-key"
                type="password"
                bind:value={authCode}
                placeholder="sk-..."
                class="font-mono"
              />
            </div>
            
            {#if assistant?.config.authUrl}
              <button 
                type="button"
                onclick={() => assistant?.config.authUrl && handleOpenUrl(assistant.config.authUrl)}
                class="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLinkIcon class="h-3 w-3" />
                Get your API key from {getProviderName()}
              </button>
            {/if}
          </div>
          
        <!-- PKCE OAuth Flow (Anthropic) -->
        {:else if authResponse.flowType === "pkce_oauth"}
          <div class="space-y-4">
            <!-- Step 1: Open sign-in page -->
            <div class="p-4 rounded-lg border bg-muted/30">
              <p class="text-sm font-medium mb-2">Step 1: Sign in with Anthropic</p>
              <p class="text-xs text-muted-foreground mb-3">
                {#if authResponse.authMode === "max"}
                  Sign in with your Claude Pro or Claude Max subscription for free API access.
                {:else}
                  Sign in to the Anthropic Console to create an API key.
                {/if}
              </p>
              <Button 
                variant="outline" 
                class="w-full gap-2"
                onclick={() => authResponse?.authUrl && handleOpenUrl(authResponse.authUrl)}
              >
                <ExternalLinkIcon class="h-4 w-4" />
                {#if authResponse.authMode === "max"}
                  Sign in with Claude Pro/Max
                {:else}
                  Sign in to Anthropic Console
                {/if}
              </Button>
            </div>
            
            <!-- Step 2: Enter code -->
            <div class="p-4 rounded-lg border bg-muted/30">
              <p class="text-sm font-medium mb-2">Step 2: Paste the authorization code</p>
              <p class="text-xs text-muted-foreground mb-3">
                After authorizing, you'll see a code. Copy and paste it below.
              </p>
              <Input 
                bind:value={authCode}
                placeholder="Paste the code here..."
                class="font-mono"
              />
              <p class="text-xs text-muted-foreground mt-2">
                The code may look like: <code class="bg-muted px-1 rounded">abc123#xyz789</code>
              </p>
            </div>
          </div>
        {/if}
        
        <!-- Error message -->
        {#if error}
          <div class="p-3 rounded-lg border border-destructive/50 bg-destructive/10">
            <p class="text-sm text-destructive">{error}</p>
          </div>
        {/if}
      {/if}
    </div>
    
    <Dialog.Footer>
      <Button variant="outline" onclick={handleClose}>
        Cancel
      </Button>
      
      {#if authResponse && (authResponse.flowType === "url_first" || authResponse.flowType === "api_key" || authResponse.flowType === "pkce_oauth")}
        <Button 
          onclick={handleSubmit}
          disabled={loading || !authCode.trim()}
        >
          {#if loading}
            <LoaderIcon class="h-4 w-4 animate-spin mr-2" />
            Verifying...
          {:else}
            Verify
          {/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
