<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { Ear, EarOff } from "@lucide/svelte";

  // State
  let isAvailable = $state(false);
  let isInitialized = $state(false);
  let isListening = $state(false);
  let hasLoadedModels = $state(false);
  let isLoading = $state(false);
  let wasDetected = $state(false); // Flash cyan when wake word detected
  
  // Event listeners
  let unlistenDetected: UnlistenFn | null = null;
  let detectionTimeout: ReturnType<typeof setTimeout> | null = null;

  async function checkWakewordAvailability() {
    try {
      // Check if feature models are downloaded
      const modelsDownloaded = await invoke<boolean>("wakeword_are_models_downloaded");
      if (!modelsDownloaded) {
        isAvailable = false;
        return;
      }
      
      // Check if processor is initialized
      isInitialized = await invoke<boolean>("wakeword_is_initialized");
      
      // Check if any models are loaded
      const loadedModels = await invoke<string[]>("wakeword_get_loaded_models");
      hasLoadedModels = loadedModels.length > 0;
      
      // Don't auto-start listening - default to disabled
      // Just check the current state for display purposes
      isListening = await invoke<boolean>("wakeword_is_listening");
      
      isAvailable = true;
    } catch {
      isAvailable = false;
    }
  }

  async function toggleListening() {
    if (isLoading) return;
    
    isLoading = true;
    try {
      if (isListening) {
        await invoke("wakeword_stop_listening");
        isListening = false;
      } else {
        // Initialize processor if needed
        if (!isInitialized) {
          await invoke("wakeword_init_processor");
          isInitialized = true;
        }
        
        // Check for loaded models
        const loadedModels = await invoke<string[]>("wakeword_get_loaded_models");
        if (loadedModels.length === 0) {
          // Try to load a default model (hey_mycroft since it works well)
          const models = await invoke<Array<{modelId: string, path: string | null}>>( "wakeword_list_models");
          const downloadedModel = models.find(m => m.path !== null);
          if (downloadedModel) {
            await invoke("wakeword_load_model", { modelId: downloadedModel.modelId });
          } else {
            console.warn("[WakeWord] No wake word models downloaded. Please download one in Settings.");
            return;
          }
        }
        
        await invoke("wakeword_start_listening");
        isListening = true;
      }
    } catch (err) {
      console.error("[WakeWord] Toggle error:", err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    await checkWakewordAvailability();
    
    // Listen for detection events - flash color briefly
    unlistenDetected = await listen<{ name: string; score: number }>("wakeword:detected", () => {
      wasDetected = true;
      if (detectionTimeout) clearTimeout(detectionTimeout);
      detectionTimeout = setTimeout(() => {
        wasDetected = false;
      }, 1500); // Flash for 1.5 seconds
    });
    
    // Listen for listening state changes
    await listen("wakeword:listening_started", () => {
      isListening = true;
    });
    await listen("wakeword:listening_stopped", () => {
      isListening = false;
    });
  });

  onDestroy(() => {
    if (unlistenDetected) unlistenDetected();
    if (detectionTimeout) clearTimeout(detectionTimeout);
  });
</script>

{#if isAvailable}
  <button
    class="relative flex items-center justify-center w-7 h-7 rounded-md transition-all
      {wasDetected
        ? 'bg-[var(--cyber-cyan)]/30 text-[var(--cyber-cyan)] shadow-[0_0_8px_var(--cyber-cyan)]'
        : isListening 
          ? 'bg-[var(--cyber-emerald)]/20 text-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/30' 
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'}
      {isLoading ? 'opacity-50 cursor-wait' : ''}"
    onclick={toggleListening}
    disabled={isLoading}
    title={isListening ? "Stop wake word listening" : "Start wake word listening"}
  >
    {#if isListening}
      <Ear class="w-4 h-4" />
      <!-- Pulsing indicator when listening (cyan when detected, emerald otherwise) -->
      <span class="absolute -top-0.5 -right-0.5 flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
          {wasDetected ? 'bg-[var(--cyber-cyan)]' : 'bg-[var(--cyber-emerald)]'}"></span>
        <span class="relative inline-flex rounded-full h-2 w-2
          {wasDetected ? 'bg-[var(--cyber-cyan)]' : 'bg-[var(--cyber-emerald)]'}"></span>
      </span>
    {:else}
      <EarOff class="w-4 h-4" />
    {/if}
  </button>
{/if}
