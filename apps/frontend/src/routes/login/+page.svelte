<script lang="ts">
  import { auth, login } from "$lib/stores/auth.svelte";
  import { connection, connect } from "$lib/stores/connection.svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "$lib/components/ui/card";

  // Form state
  let apiUrl = $state("https://api.superchotu.com");
  let isConnecting = $state(false);
  let connectionError = $state<string | null>(null);

  // Determine current step
  let step = $derived<"setup" | "login">(connection.isConnected ? "login" : "setup");

  async function handleSetup(e: Event) {
    e.preventDefault();
    isConnecting = true;
    connectionError = null;

    // Connect without API key - we'll use OAuth tokens instead
    const success = await connect(apiUrl, undefined);
    
    if (!success) {
      connectionError = connection.error || "Connection failed";
    }
    
    isConnecting = false;
  }

  async function handleLogin() {
    await login();
  }

  // Redirect to projects if already authenticated
  $effect(() => {
    if (auth.isAuthenticated && connection.isConnected) {
      goto("/projects");
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
  <Card class="w-full max-w-md">
    <CardHeader class="text-center space-y-2">
      <div class="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
        <svg
          class="w-8 h-8 text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      </div>
      <CardTitle class="text-2xl">Welcome to AgentPod</CardTitle>
      <CardDescription>
        {#if step === "setup"}
          Connect to your Management API to get started
        {:else}
          Sign in to manage your AI coding environments
        {/if}
      </CardDescription>
    </CardHeader>
    
    <CardContent class="space-y-4">
      {#if step === "setup"}
        <!-- Setup Step -->
        <form onsubmit={handleSetup} class="space-y-4">
          <div class="space-y-2">
            <Label for="api-url">API URL</Label>
            <Input
              id="api-url"
              type="url"
              placeholder="https://api.example.com"
              bind:value={apiUrl}
              required
            />
            <p class="text-xs text-muted-foreground">
              Enter your AgentPod Management API URL
            </p>
          </div>
          
          {#if connectionError}
            <div class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {connectionError}
            </div>
          {/if}
          
          <Button type="submit" class="w-full" disabled={isConnecting || !apiUrl}>
            {#if isConnecting}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            {:else}
              Continue
            {/if}
          </Button>
        </form>
      {:else}
        <!-- Login Step -->
        <div class="space-y-4">
          <div class="p-3 rounded-md bg-muted text-sm">
            <span class="text-muted-foreground">Connected to:</span>
            <span class="ml-1 font-medium">{connection.apiUrl}</span>
          </div>
          
          {#if auth.error}
            <div class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {auth.error}
            </div>
          {/if}
          
          <Button
            class="w-full"
            size="lg"
            onclick={handleLogin}
            disabled={auth.isLoading}
          >
            {#if auth.isLoading}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            {:else}
              <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign in with SSO
            {/if}
          </Button>
          
          <Button
            variant="ghost"
            class="w-full"
            onclick={() => {
              // Disconnect to go back to setup
              import("$lib/stores/connection.svelte").then(({ disconnect }) => disconnect());
            }}
          >
            Use different server
          </Button>
        </div>
      {/if}
    </CardContent>
    
    <CardFooter class="justify-center">
      <p class="text-xs text-muted-foreground">
        AgentPod v0.1.0
      </p>
    </CardFooter>
  </Card>
</div>
