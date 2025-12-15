<script lang="ts">
  import { auth, login, loginWithEmail, signUp, clearError } from "$lib/stores/auth.svelte";
  import { connection, connect } from "$lib/stores/connection.svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Circle } from "@lucide/svelte";

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

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="min-h-screen grid-bg mesh-gradient flex items-center justify-center p-4 sm:p-6">
  <div class="w-full max-w-md animate-fade-in-up">
    <!-- Main Card -->
    <div class="cyber-card corner-accent overflow-hidden">
      <!-- Header -->
      <div class="p-6 sm:p-8 pb-4 sm:pb-6 border-b border-border/30">
        <div class="text-center space-y-4">
          <!-- Logo/Icon -->
          <div class="mx-auto w-16 h-16 relative">
            <div class="absolute inset-0 bg-[var(--cyber-cyan)]/10 rounded-lg rotate-45"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <svg
                class="w-8 h-8 text-[var(--cyber-cyan)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
          </div>
          
          <!-- Title -->
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">
              AgentPod<span class="typing-cursor"></span>
            </h1>
            <p class="mt-2 text-sm font-mono text-muted-foreground">
              {#if step === "setup"}
                // connect_to_api
              {:else if authMode === "signin"}
                // authenticate_user
              {:else}
                // create_account
              {/if}
            </p>
          </div>
        </div>
      </div>
      
      <!-- Content -->
      <div class="p-6 sm:p-8 pt-6 space-y-6">
        {#if step === "setup"}
          <!-- Setup Step -->
          <form onsubmit={handleSetup} class="space-y-5">
            <div class="space-y-2">
              <Label for="api-url" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                API Endpoint
              </Label>
              <Input
                id="api-url"
                type="url"
                placeholder="http://localhost:3001"
                bind:value={apiUrl}
                required
                class="font-mono text-sm bg-background/50 border-border/50 
                       focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]/50
                       placeholder:text-muted-foreground/50"
              />
              <p class="text-xs font-mono text-muted-foreground/70">
                Enter your AgentPod Management API URL
              </p>
            </div>
            
            {#if connectionError}
              <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                <div class="flex items-center gap-2 text-[var(--cyber-red)]">
                  <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
                  <span class="text-sm">{connectionError}</span>
                </div>
              </div>
            {/if}
            
            <Button 
              type="submit" 
              class="w-full h-11 font-mono text-xs uppercase tracking-wider
                     bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black
                     disabled:opacity-50 disabled:cursor-not-allowed" 
              disabled={isConnecting || !apiUrl}
            >
              {#if isConnecting}
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              {:else}
                Connect &rarr;
              {/if}
            </Button>
          </form>
        {:else}
          <!-- Login Step -->
          <div class="space-y-5">
            <!-- Connection Info -->
            <div class="p-3 rounded border border-border/30 bg-background/30">
              <div class="flex items-center gap-2 text-sm font-mono">
                <Circle class="h-2.5 w-2.5 text-[var(--cyber-emerald)] fill-current" />
                <span class="text-muted-foreground">connected:</span>
                <span class="text-foreground truncate">{connection.apiUrl}</span>
              </div>
            </div>
            
            {#if auth.error}
              <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                <div class="flex items-center gap-2 text-[var(--cyber-red)]">
                  <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
                  <span class="text-sm">{auth.error}</span>
                </div>
              </div>
            {/if}

            <!-- Email/Password Form -->
            <form onsubmit={handleEmailSubmit} class="space-y-4">
              {#if authMode === "signup"}
                <div class="space-y-2 animate-fade-in">
                  <Label for="name" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    bind:value={name}
                    required
                    disabled={auth.isLoading}
                    class="font-mono text-sm bg-background/50 border-border/50 
                           focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]/50"
                  />
                </div>
              {/if}
              
              <div class="space-y-2">
                <Label for="email" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  bind:value={email}
                  required
                  disabled={auth.isLoading}
                  class="font-mono text-sm bg-background/50 border-border/50 
                         focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]/50"
                />
              </div>
              
              <div class="space-y-2">
                <Label for="password" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  bind:value={password}
                  required
                  minlength={8}
                  disabled={auth.isLoading}
                  class="font-mono text-sm bg-background/50 border-border/50 
                         focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]/50"
                />
                {#if authMode === "signup"}
                  <p class="text-xs font-mono text-muted-foreground/70">
                    Minimum 8 characters
                  </p>
                {/if}
              </div>
              
              <Button 
                type="submit" 
                class="w-full h-11 font-mono text-xs uppercase tracking-wider
                       bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black
                       disabled:opacity-50" 
                disabled={auth.isLoading}
              >
                {#if auth.isLoading}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {authMode === "signin" ? "Authenticating..." : "Creating..."}
                {:else}
                  {authMode === "signin" ? "Sign In" : "Create Account"} &rarr;
                {/if}
              </Button>
            </form>

            <!-- Divider -->
            <div class="relative py-2">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t border-border/30"></span>
              </div>
              <div class="relative flex justify-center">
                <span class="bg-card px-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  or
                </span>
              </div>
            </div>

            <!-- GitHub OAuth -->
            <Button
              variant="outline"
              class="w-full h-11 font-mono text-xs uppercase tracking-wider
                     border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5"
              onclick={handleGitHubLogin}
              disabled={auth.isLoading}
            >
              <svg class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </Button>
            
            <!-- Toggle auth mode -->
            <div class="text-center text-sm font-mono">
              {#if authMode === "signin"}
                <span class="text-muted-foreground">No account? </span>
                <button 
                  type="button"
                  class="text-[var(--cyber-cyan)] hover:underline"
                  onclick={toggleAuthMode}
                >
                  Create one
                </button>
              {:else}
                <span class="text-muted-foreground">Have an account? </span>
                <button 
                  type="button"
                  class="text-[var(--cyber-cyan)] hover:underline"
                  onclick={toggleAuthMode}
                >
                  Sign in
                </button>
              {/if}
            </div>
            
            <!-- Change server -->
            <Button
              variant="ghost"
              class="w-full h-9 font-mono text-xs text-muted-foreground hover:text-foreground"
              onclick={() => {
                // Disconnect to go back to setup
                import("$lib/stores/connection.svelte").then(({ disconnect }) => disconnect());
              }}
            >
              &larr; Use different server
            </Button>
          </div>
        {/if}
      </div>
      
      <!-- Footer -->
      <div class="px-6 sm:px-8 py-4 border-t border-border/30 bg-background/30">
        <div class="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></span>
          <span>AgentPod v0.1.0</span>
        </div>
      </div>
    </div>
  </div>
</main>
