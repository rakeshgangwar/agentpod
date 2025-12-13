<script lang="ts">
  /**
   * AI Assistant Card Component
   * 
   * Displays an AI Assistant (agent harness) with status, auth state, and actions.
   * Used in the AI Assistants settings tab.
   */
  
  import type { AgentInstance } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  
  interface Props {
    assistant: AgentInstance;
    isDefault?: boolean;
    onStart?: () => void;
    onStop?: () => void;
    onAuth?: () => void;
    onSetDefault?: () => void;
    onRemove?: () => void;
    disabled?: boolean;
  }
  
  let {
    assistant,
    isDefault = false,
    onStart,
    onStop,
    onAuth,
    onSetDefault,
    onRemove,
    disabled = false,
  }: Props = $props();
  
  // Status helpers
  function getStatusColor(status: string): string {
    switch (status) {
      case "running": return "bg-green-500";
      case "starting": return "bg-yellow-500 animate-pulse";
      case "stopped": return "bg-gray-400";
      case "error": return "bg-red-500";
      case "auth_required": return "bg-orange-500";
      default: return "bg-gray-400";
    }
  }
  
  function getStatusLabel(status: string): string {
    switch (status) {
      case "running": return "Running";
      case "starting": return "Starting...";
      case "stopped": return "Stopped";
      case "error": return "Error";
      case "auth_required": return "Auth Required";
      default: return status;
    }
  }
  
  function getIcon(id: string): string {
    // Return emoji icons based on assistant ID
    switch (id) {
      case "opencode": return "O";
      case "claude-code": return "C";
      case "gemini-cli": return "G";
      case "codex": return "X";
      case "goose": return "Go";
      case "mistral-vibe": return "M";
      case "kimi-cli": return "K";
      case "qwen-code": return "Q";
      default: return "AI";
    }
  }

  function getIconBgColor(id: string): string {
    switch (id) {
      case "opencode": return "bg-gradient-to-br from-blue-500 to-purple-600";
      case "claude-code": return "bg-gradient-to-br from-orange-400 to-orange-600";
      case "gemini-cli": return "bg-gradient-to-br from-blue-400 to-blue-600";
      case "codex": return "bg-gradient-to-br from-green-400 to-green-600";
      case "goose": return "bg-gradient-to-br from-gray-600 to-gray-800";
      case "mistral-vibe": return "bg-gradient-to-br from-purple-400 to-purple-600";
      default: return "bg-gradient-to-br from-gray-400 to-gray-600";
    }
  }
  
  // Determine if we need auth
  const needsAuth = $derived(
    assistant.config.requiresAuth && !assistant.authenticated
  );
  
  // Can we start this assistant?
  const canStart = $derived(
    assistant.status === "stopped" && !needsAuth
  );
  
  // Can we stop this assistant?
  const canStop = $derived(
    assistant.status === "running" || assistant.status === "starting"
  );
</script>

<Card.Root class="overflow-hidden transition-all hover:shadow-md {assistant.status === 'running' ? 'border-green-500/30' : ''} {needsAuth ? 'border-orange-500/30' : ''}">
  <Card.Content class="p-0">
    <!-- Header -->
    <div class="p-4 flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <!-- Icon -->
        <div class="w-10 h-10 rounded-lg {getIconBgColor(assistant.id)} flex items-center justify-center text-white font-bold text-sm shrink-0">
          {getIcon(assistant.id)}
        </div>
        
        <!-- Info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium truncate">{assistant.config.name}</span>
            {#if isDefault}
              <Badge variant="default" class="text-[10px] px-1.5 py-0 shrink-0">Default</Badge>
            {/if}
            {#if assistant.config.isBuiltIn}
              <Badge variant="outline" class="text-[10px] px-1.5 py-0 shrink-0">Built-in</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {assistant.config.description}
          </p>
        </div>
      </div>
      
      <!-- Actions dropdown -->
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" {disabled}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {#if !isDefault && assistant.authenticated}
            <DropdownMenu.Item onclick={onSetDefault}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Set as Default
            </DropdownMenu.Item>
          {/if}
          
          {#if canStart}
            <DropdownMenu.Item onclick={onStart}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start
            </DropdownMenu.Item>
          {/if}
          
          {#if canStop}
            <DropdownMenu.Item onclick={onStop}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Stop
            </DropdownMenu.Item>
          {/if}
          
          {#if assistant.config.requiresAuth}
            <DropdownMenu.Item onclick={onAuth}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {assistant.authenticated ? "Re-authenticate" : "Sign In"}
            </DropdownMenu.Item>
          {/if}
          
          {#if !assistant.config.isBuiltIn}
            <DropdownMenu.Separator />
            <DropdownMenu.Item 
              onclick={onRemove}
              class="text-destructive focus:text-destructive"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    
    <!-- Status bar -->
    <div class="px-4 pb-4">
      <div class="flex items-center justify-between gap-2">
        <!-- Status indicator -->
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full {getStatusColor(assistant.status)}"></span>
          <span class="text-xs text-muted-foreground">{getStatusLabel(assistant.status)}</span>
          
          {#if assistant.authenticated && assistant.config.requiresAuth}
            <Badge variant="outline" class="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/30">
              Signed in
            </Badge>
          {/if}
          
          {#if needsAuth}
            <Badge variant="outline" class="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-600 border-orange-500/30">
              Sign in required
            </Badge>
          {/if}
        </div>
        
        <!-- Quick action button -->
        {#if needsAuth}
          <Button 
            variant="outline" 
            size="sm" 
            class="h-7 text-xs"
            onclick={onAuth}
            {disabled}
          >
            Sign In
          </Button>
        {:else if canStart}
          <Button 
            variant="outline" 
            size="sm" 
            class="h-7 text-xs"
            onclick={onStart}
            {disabled}
          >
            Start
          </Button>
        {:else if canStop}
          <Button 
            variant="ghost" 
            size="sm" 
            class="h-7 text-xs"
            onclick={onStop}
            {disabled}
          >
            Stop
          </Button>
        {/if}
      </div>
      
      {#if assistant.error}
        <div class="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          {assistant.error}
        </div>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
