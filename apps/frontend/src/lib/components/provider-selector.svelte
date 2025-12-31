<script lang="ts">
  /**
   * Provider Selector Component
   * 
   * Allows users to choose between Docker and Cloudflare sandbox providers.
   * Uses a toggle/radio-button style selector with clear visual feedback.
   */
  
  import { Server, Cloud } from "@lucide/svelte";
  
  // Type definition
  export type SandboxProvider = "docker" | "cloudflare";
  
  // Provider options
  interface ProviderOption {
    id: SandboxProvider;
    name: string;
    description: string;
    icon: typeof Server | typeof Cloud;
    features: string[];
  }
  
  const providers: ProviderOption[] = [
    {
      id: "docker",
      name: "Docker",
      description: "Self-hosted containers",
      icon: Server,
      features: ["Full control", "Local execution", "No cold starts"],
    },
    {
      id: "cloudflare",
      name: "Cloudflare",
      description: "Serverless Workers",
      icon: Cloud,
      features: ["Global edge", "Auto-scaling", "Zero infrastructure"],
    },
  ];
  
  // Props
  let {
    value = $bindable<SandboxProvider>("docker"),
    onValueChange,
    disabled = false,
  }: {
    value?: SandboxProvider;
    onValueChange?: (provider: SandboxProvider) => void;
    disabled?: boolean;
  } = $props();
  
  function selectProvider(providerId: SandboxProvider) {
    if (disabled) return;
    
    value = providerId;
    onValueChange?.(providerId);
  }
  
  function handleKeyDown(e: KeyboardEvent, providerId: SandboxProvider) {
    if (disabled) return;
    
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectProvider(providerId);
    }
  }
</script>

<div class="space-y-3">
  <!-- Header -->
  <div>
    <h3 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">[provider]</h3>
    <p class="text-xs text-muted-foreground font-mono">
      Choose where to run your sandbox environment
    </p>
  </div>
  
  <!-- Provider options grid -->
  <div class="grid grid-cols-2 gap-3">
    {#each providers as provider (provider.id)}
      {@const isSelected = value === provider.id}
      
      <button
        type="button"
        class="relative w-full text-left p-4 rounded border transition-all font-mono group
          {isSelected 
            ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 shadow-[0_0_12px_var(--cyber-cyan)/15]' 
            : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5 cursor-pointer'}
          {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
        role="radio"
        aria-checked={isSelected}
        tabindex={disabled ? -1 : 0}
        onclick={() => selectProvider(provider.id)}
        onkeydown={(e) => handleKeyDown(e, provider.id)}
        {disabled}
      >
        <div class="flex flex-col gap-3">
          <!-- Icon and selection indicator -->
          <div class="flex items-start justify-between">
            <!-- Icon -->
            <div class="w-10 h-10 rounded-lg flex items-center justify-center transition-all
              {isSelected 
                ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)] border-2 border-[var(--cyber-cyan)]' 
                : 'bg-[var(--cyber-cyan)]/5 text-muted-foreground border-2 border-border/30 group-hover:border-[var(--cyber-cyan)]/50 group-hover:bg-[var(--cyber-cyan)]/10'}"
            >
              {#if provider.id === "docker"}
                <Server class="w-5 h-5" />
              {:else}
                <Cloud class="w-5 h-5" />
              {/if}
            </div>
            
            <!-- Radio button indicator -->
            <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
              {isSelected 
                ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)] shadow-[0_0_8px_var(--cyber-cyan)]' 
                : 'border-muted-foreground/30 group-hover:border-[var(--cyber-cyan)]/50'}"
            >
              {#if isSelected}
                <div class="w-2 h-2 rounded-full bg-black"></div>
              {/if}
            </div>
          </div>
          
          <!-- Provider info -->
          <div class="space-y-1">
            <div class="font-medium text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : 'text-foreground'}">
              {provider.name}
            </div>
            <div class="text-xs text-muted-foreground">
              {provider.description}
            </div>
          </div>
          
          <!-- Features list -->
          <div class="space-y-1 pt-2 border-t border-border/30">
            {#each provider.features as feature}
              <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div class="w-1 h-1 rounded-full bg-[var(--cyber-cyan)]/50"></div>
                <span>{feature}</span>
              </div>
            {/each}
          </div>
        </div>
      </button>
    {/each}
  </div>
  
  <!-- Info text -->
  <p class="text-[10px] text-muted-foreground font-mono">
    <span class="text-[var(--cyber-amber)]">*</span> Docker requires local installation. Cloudflare provides instant serverless execution.
  </p>
</div>
