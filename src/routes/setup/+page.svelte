<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection, connect } from "$lib/stores/connection.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";

  // Redirect if already connected
  $effect(() => {
    if (connection.isConnected) {
      goto("/projects");
    }
  });

  // Setup form state
  let apiUrl = $state("");
  let apiKey = $state("");
  let isConnecting = $state(false);
  let connectionError = $state<string | null>(null);

  async function handleConnect(e: Event) {
    e.preventDefault();
    isConnecting = true;
    connectionError = null;

    const success = await connect(apiUrl, apiKey || undefined);
    
    if (success) {
      goto("/projects");
    } else {
      connectionError = connection.error || "Connection failed";
    }
    
    isConnecting = false;
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  <div class="flex flex-col items-center justify-center min-h-[80vh]">
    <Card.Root class="w-full max-w-md">
      <Card.Header>
        <Card.Title class="text-2xl text-center">Welcome to CodeOpen</Card.Title>
        <Card.Description class="text-center">
          Connect to your Management API to get started
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <form onsubmit={handleConnect} class="space-y-4">
          <div class="space-y-2">
            <Label for="api-url">API URL</Label>
            <Input
              id="api-url"
              type="url"
              placeholder="https://api.example.com"
              bind:value={apiUrl}
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter API key..."
              bind:value={apiKey}
            />
          </div>
          {#if connectionError}
            <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {connectionError}
            </div>
          {/if}
          <Button type="submit" class="w-full" disabled={isConnecting || !apiUrl}>
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </Card.Content>
      <Card.Footer class="justify-center">
        <p class="text-xs text-muted-foreground">
          CodeOpen v0.1.0
        </p>
      </Card.Footer>
    </Card.Root>
  </div>
</main>
