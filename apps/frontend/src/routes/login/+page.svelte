<script lang="ts">
  import { auth, login, loginWithEmail, signUp, clearError } from "$lib/stores/auth.svelte";
  import { connection, connect } from "$lib/stores/connection.svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "$lib/components/ui/card";

  // Form state
  let apiUrl = $state("http://localhost:3001");
  let isConnecting = $state(false);
  let connectionError = $state<string | null>(null);

  // Auth form state
  let authMode = $state<"signin" | "signup">("signin");
  let email = $state("");
  let password = $state("");
  let name = $state("");

  // Determine current step - wait for connection to be initialized
  let step = $derived<"setup" | "login">(
    connection.isConnected && connection.apiUrl ? "login" : "setup"
  );

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

  async function handleGitHubLogin() {
    clearError();
    await login();
  }

  async function handleEmailSubmit(e: Event) {
    e.preventDefault();
    clearError();
    
    let success = false;
    if (authMode === "signin") {
      success = await loginWithEmail(email, password);
    } else {
      success = await signUp(email, password, name);
    }
    
    if (success) {
      // Redirect immediately after successful auth
      // The session cookie is set, so we're authenticated
      goto("/projects");
    }
  }

  function toggleAuthMode() {
    authMode = authMode === "signin" ? "signup" : "signin";
    clearError();
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
        {:else if authMode === "signin"}
          Sign in to manage your AI coding environments
        {:else}
          Create an account to get started
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
              placeholder="http://localhost:3001"
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

          <!-- Email/Password Form -->
          <form onsubmit={handleEmailSubmit} class="space-y-4">
            {#if authMode === "signup"}
              <div class="space-y-2">
                <Label for="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  bind:value={name}
                  required
                  disabled={auth.isLoading}
                />
              </div>
            {/if}
            
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                bind:value={email}
                required
                disabled={auth.isLoading}
              />
            </div>
            
            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                bind:value={password}
                required
                minlength={8}
                disabled={auth.isLoading}
              />
              {#if authMode === "signup"}
                <p class="text-xs text-muted-foreground">
                  Must be at least 8 characters
                </p>
              {/if}
            </div>
            
            <Button type="submit" class="w-full" disabled={auth.isLoading}>
              {#if auth.isLoading}
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {authMode === "signin" ? "Signing in..." : "Creating account..."}
              {:else}
                {authMode === "signin" ? "Sign in" : "Create account"}
              {/if}
            </Button>
          </form>

          <!-- Divider -->
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t"></span>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <!-- GitHub OAuth -->
          <Button
            variant="outline"
            class="w-full"
            onclick={handleGitHubLogin}
            disabled={auth.isLoading}
          >
            <svg class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </Button>
          
          <!-- Toggle auth mode -->
          <div class="text-center text-sm">
            {#if authMode === "signin"}
              <span class="text-muted-foreground">Don't have an account? </span>
              <button 
                type="button"
                class="text-primary hover:underline font-medium"
                onclick={toggleAuthMode}
              >
                Sign up
              </button>
            {:else}
              <span class="text-muted-foreground">Already have an account? </span>
              <button 
                type="button"
                class="text-primary hover:underline font-medium"
                onclick={toggleAuthMode}
              >
                Sign in
              </button>
            {/if}
          </div>
          
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
