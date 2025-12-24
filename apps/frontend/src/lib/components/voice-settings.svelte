<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { Switch } from "$lib/components/ui/switch";
  import { Mic, MicOff, Download, Check, Loader2, Volume2, AlertCircle, Ear, Play, Square } from "@lucide/svelte";

  // Types matching Rust backend
  type VoiceMode = "push-to-talk" | "toggle";
  type ModelSize = "tiny" | "base" | "small" | "medium";

  interface VoiceConfig {
    enabled: boolean;
    mode: VoiceMode;
    model: ModelSize;
    language: string;
    wakeWordEnabled: boolean;
    wakePhrases: string[];
    pushToTalkKey: string;
  }

  interface ModelInfo {
    id: string;
    name: string;
    size: ModelSize;
    sizeDisplay: string;
    sizeBytes: number;
    description: string;
    isDownloaded: boolean;
    localPath: string | null;
  }

  interface WakewordInfo {
    name: string;
    modelId: string;
    path: string | null;
    isBuiltin: boolean;
    isLoaded: boolean;
  }

  interface WakewordConfig {
    threshold: number;
    vadEnabled: boolean;
    vadThreshold: number;
  }

  // State
  let isVoiceAvailable = $state(false);
  let isLoading = $state(true);
  let config = $state<VoiceConfig | null>(null);
  let inputDevices = $state<string[]>([]);
  let defaultDevice = $state<string>("");
  let selectedDevice = $state<string>("");
  let _availableModels = $state<ModelInfo[]>([]); // Prefixed with _ to indicate intentionally unused
  let downloadedModels = $state<ModelInfo[]>([]);
  let isModelLoaded = $state(false);
  let loadedModelSize = $state<ModelSize | null>(null);

  // Audio test state
  let isTesting = $state(false);
  let testAudioLevel = $state(0);
  let testInterval: ReturnType<typeof setInterval> | null = null;

  // Download state
  let downloadingModel = $state<ModelSize | null>(null);
  let downloadProgress = $state(0);

  // Wake word state
  let wakewordModels = $state<WakewordInfo[]>([]);
  let wakewordConfig = $state<WakewordConfig | null>(null);
  let isWakewordProcessorInitialized = $state(false);
  let isWakewordListening = $state(false);
  let downloadingWakewordModel = $state<string | null>(null);
  let downloadingFeatureModels = $state(false);
  let areFeatureModelsDownloaded = $state(false);
  let lastDetectedWakeword = $state<string | null>(null);
  let detectionTimeout: ReturnType<typeof setTimeout> | null = null;

  const builtinWakewordModels = $derived(wakewordModels.filter(m => m.isBuiltin));

  // Model descriptions
  const modelDescriptions: Record<ModelSize, { speed: string; accuracy: string; size: string }> = {
    tiny: { speed: "Very Fast", accuracy: "Basic", size: "~75 MB" },
    base: { speed: "Fast", accuracy: "Good", size: "~142 MB" },
    small: { speed: "Medium", accuracy: "Better", size: "~466 MB" },
    medium: { speed: "Slower", accuracy: "High", size: "~1.5 GB" },
  };

  // Check if voice feature is available
  async function checkVoiceAvailable(): Promise<boolean> {
    try {
      await invoke<VoiceConfig>("voice_get_config");
      return true;
    } catch {
      return false;
    }
  }

  // Load all voice settings
  async function loadSettings() {
    isLoading = true;
    try {
      // Check availability first
      isVoiceAvailable = await checkVoiceAvailable();
      if (!isVoiceAvailable) {
        isLoading = false;
        return;
      }

      // Load config
      config = await invoke<VoiceConfig>("voice_get_config");

      // Load input devices
      try {
        inputDevices = await invoke<string[]>("voice_list_input_devices");
        defaultDevice = await invoke<string>("voice_get_default_input_device");
        selectedDevice = defaultDevice;
      } catch (e) {
        console.warn("Failed to load input devices:", e);
      }

      // Load models
      _availableModels = await invoke<ModelInfo[]>("voice_list_available_models");
      downloadedModels = await invoke<ModelInfo[]>("voice_list_downloaded_models");

      // Check if model is loaded
      isModelLoaded = await invoke<boolean>("voice_is_model_loaded");
      if (isModelLoaded && config) {
        loadedModelSize = config.model;
      }
    } catch (e) {
      console.error("Failed to load voice settings:", e);
    } finally {
      isLoading = false;
    }
  }

  // Save config changes
  async function saveConfig() {
    if (!config) return;
    try {
      await invoke("voice_set_config", { config });
    } catch (e) {
      console.error("Failed to save voice config:", e);
    }
  }

  // Toggle voice enabled
  async function toggleEnabled(enabled: boolean) {
    if (!config) return;
    config = { ...config, enabled };
    await saveConfig();
  }

  // Change voice mode
  async function changeMode(mode: VoiceMode) {
    if (!config) return;
    config = { ...config, mode };
    await saveConfig();
  }

  // Download a model
  async function downloadModel(size: ModelSize) {
    downloadingModel = size;
    downloadProgress = 0;
    try {
      await invoke("voice_download_model", { model: size });
      // Refresh models list
      _availableModels = await invoke<ModelInfo[]>("voice_list_available_models");
      downloadedModels = await invoke<ModelInfo[]>("voice_list_downloaded_models");
      
      // Auto-load the downloaded model
      await loadModel(size);
    } catch (e) {
      console.error("Failed to download model:", e);
    } finally {
      downloadingModel = null;
      downloadProgress = 0;
    }
  }

  // Load a model
  async function loadModel(size: ModelSize) {
    try {
      await invoke("voice_load_model", { model: size });
      isModelLoaded = true;
      loadedModelSize = size;
      if (config) {
        config = { ...config, model: size };
        await saveConfig();
      }
    } catch (e) {
      console.error("Failed to load model:", e);
    }
  }

  // Unload current model
  async function unloadModel() {
    try {
      await invoke("voice_unload_model");
      isModelLoaded = false;
      loadedModelSize = null;
    } catch (e) {
      console.error("Failed to unload model:", e);
    }
  }

  // Start audio test
  async function startAudioTest() {
    if (isTesting) return;
    isTesting = true;
    testAudioLevel = 0;

    try {
      // Start recording
      await invoke("voice_start_recording");

      // Poll audio level
      testInterval = setInterval(async () => {
        try {
          const level = await invoke<number>("voice_get_audio_level");
          testAudioLevel = Math.min(level * 3, 1); // Amplify for visibility
        } catch {
          // Ignore errors during polling
        }
      }, 50);
    } catch (e) {
      console.error("Failed to start audio test:", e);
      isTesting = false;
    }
  }

  // Stop audio test
  async function stopAudioTest() {
    if (!isTesting) return;

    if (testInterval) {
      clearInterval(testInterval);
      testInterval = null;
    }

    try {
      await invoke("voice_cancel_recording");
    } catch {
      // Ignore errors when stopping
    }

    isTesting = false;
    testAudioLevel = 0;
  }

  // Event listeners
  let unlistenProgress: UnlistenFn | null = null;
  let unlistenWakeword: UnlistenFn | null = null;

  onMount(async () => {
    console.log("[Voice Settings] Component mounted, setting up listeners...");
    await loadSettings();
    await loadWakewordSettings();

    // Listen for download progress
    unlistenProgress = await listen<{ percent: number }>("voice:model_progress", (event) => {
      downloadProgress = event.payload.percent;
    });
    
    // Listen for wake word detection events
    console.log("[Voice Settings] Setting up wakeword:detected listener...");
    unlistenWakeword = await listen<{ name: string; score: number; timestamp: number }>("wakeword:detected", (event) => {
      console.log("[Voice Settings] Wake word detected event received:", event);
      console.log("[Voice Settings] Payload:", event.payload);
      lastDetectedWakeword = event.payload.name;
      // Clear previous timeout
      if (detectionTimeout) {
        clearTimeout(detectionTimeout);
      }
      // Auto-hide after 3 seconds
      detectionTimeout = setTimeout(() => {
        lastDetectedWakeword = null;
      }, 3000);
    });
    console.log("[Voice Settings] All listeners registered successfully");
  });

  onDestroy(() => {
    if (testInterval) {
      clearInterval(testInterval);
    }
    if (unlistenProgress) {
      unlistenProgress();
    }
    if (unlistenWakeword) {
      unlistenWakeword();
    }
    if (detectionTimeout) {
      clearTimeout(detectionTimeout);
    }
    // Make sure to stop any ongoing test
    if (isTesting) {
      invoke("voice_cancel_recording").catch(() => {});
    }
  });

  // Check if a model is downloaded
  function isModelDownloaded(size: ModelSize): boolean {
    return downloadedModels.some((m) => m.size === size);
  }

  // ============================================================================
  // Wake Word Functions
  // ============================================================================

  // Load wake word settings
  async function loadWakewordSettings() {
    try {
      areFeatureModelsDownloaded = await invoke<boolean>("wakeword_are_models_downloaded");
      isWakewordProcessorInitialized = await invoke<boolean>("wakeword_is_initialized");
      wakewordModels = await invoke<WakewordInfo[]>("wakeword_list_models");
      wakewordConfig = await invoke<WakewordConfig>("wakeword_get_config");
      isWakewordListening = await invoke<boolean>("wakeword_is_listening");
    } catch (e) {
      console.warn("Failed to load wake word settings:", e);
    }
  }

  // Download feature models (melspectrogram + embedding)
  async function downloadFeatureModels() {
    downloadingFeatureModels = true;
    try {
      await invoke("wakeword_download_feature_models");
      areFeatureModelsDownloaded = true;
    } catch (e) {
      console.error("Failed to download feature models:", e);
    } finally {
      downloadingFeatureModels = false;
    }
  }

  // Initialize wake word processor
  async function initWakewordProcessor() {
    try {
      await invoke("wakeword_init_processor");
      isWakewordProcessorInitialized = true;
    } catch (e) {
      console.error("Failed to initialize wake word processor:", e);
    }
  }

  // Download a wake word model
  async function downloadWakewordModel(modelId: string) {
    downloadingWakewordModel = modelId;
    try {
      await invoke("wakeword_download_builtin", { modelId });
      // Refresh models list
      wakewordModels = await invoke<WakewordInfo[]>("wakeword_list_models");
    } catch (e) {
      console.error("Failed to download wake word model:", e);
    } finally {
      downloadingWakewordModel = null;
    }
  }

  // Load a wake word model
  async function loadWakewordModel(modelId: string) {
    try {
      await invoke("wakeword_load_model", { modelId });
      wakewordModels = await invoke<WakewordInfo[]>("wakeword_list_models");
    } catch (e) {
      console.error("Failed to load wake word model:", e);
    }
  }

  // Unload a wake word model
  async function unloadWakewordModel(modelId: string) {
    try {
      await invoke("wakeword_unload_model", { modelId });
      wakewordModels = await invoke<WakewordInfo[]>("wakeword_list_models");
    } catch (e) {
      console.error("Failed to unload wake word model:", e);
    }
  }

  // Start wake word listening
  async function startWakewordListening() {
    try {
      await invoke("wakeword_start_listening");
      isWakewordListening = true;
    } catch (e) {
      console.error("Failed to start wake word listening:", e);
    }
  }

  // Stop wake word listening
  async function stopWakewordListening() {
    try {
      await invoke("wakeword_stop_listening");
      isWakewordListening = false;
    } catch (e) {
      console.error("Failed to stop wake word listening:", e);
    }
  }

  // Update wake word threshold
  async function updateWakewordThreshold(threshold: number) {
    if (!wakewordConfig) return;
    wakewordConfig = { ...wakewordConfig, threshold };
    try {
      await invoke("wakeword_set_config", { config: wakewordConfig });
    } catch (e) {
      console.error("Failed to update wake word config:", e);
    }
  }
</script>

<div class="space-y-6">
  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  {:else if !isVoiceAvailable}
    <div class="p-6 rounded-lg border border-border/30 bg-muted/30">
      <div class="flex items-start gap-3">
        <AlertCircle class="h-5 w-5 text-[var(--cyber-amber)] mt-0.5" />
        <div>
          <h3 class="font-mono text-sm font-medium">Voice Input Not Available</h3>
          <p class="text-sm text-muted-foreground mt-1">
            The voice input feature is not enabled in this build. To enable voice input, 
            rebuild the application with the <code class="px-1 py-0.5 bg-muted rounded text-xs">voice</code> feature flag.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <!-- Enable/Disable Voice -->
    <div class="flex items-center justify-between p-4 rounded-lg border border-border/30 bg-background/50">
      <div class="flex items-center gap-3">
        {#if config?.enabled}
          <Mic class="h-5 w-5 text-[var(--cyber-cyan)]" />
        {:else}
          <MicOff class="h-5 w-5 text-muted-foreground" />
        {/if}
        <div>
          <Label class="font-mono text-sm">Voice Input</Label>
          <p class="text-xs text-muted-foreground">Enable voice-to-text in chat</p>
        </div>
      </div>
      <Switch 
        checked={config?.enabled ?? false} 
        onCheckedChange={toggleEnabled}
      />
    </div>

    <!-- Input Device Selection -->
    <div class="space-y-2">
      <Label class="font-mono text-sm">Input Device</Label>
      <Select.Root 
        type="single"
        value={selectedDevice}
        onValueChange={(v) => selectedDevice = v ?? defaultDevice}
      >
        <Select.Trigger class="w-full font-mono text-sm">
          {selectedDevice || "Select a microphone..."}
        </Select.Trigger>
        <Select.Content>
          {#each inputDevices as device}
            <Select.Item value={device} class="font-mono text-sm">
              {device}
              {#if device === defaultDevice}
                <span class="text-xs text-muted-foreground ml-2">(default)</span>
              {/if}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Audio Level Test -->
    <div class="space-y-3 p-4 rounded-lg border border-border/30 bg-background/50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Volume2 class="h-4 w-4 text-muted-foreground" />
          <Label class="font-mono text-sm">Microphone Test</Label>
        </div>
        <Button
          variant={isTesting ? "destructive" : "outline"}
          size="sm"
          onclick={isTesting ? stopAudioTest : startAudioTest}
          class="font-mono text-xs"
        >
          {isTesting ? "Stop Test" : "Start Test"}
        </Button>
      </div>
      
      <!-- Audio Level Bar -->
      <div class="relative h-4 bg-muted/50 rounded-full overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--cyber-emerald)] via-[var(--cyber-cyan)] to-[var(--cyber-amber)] rounded-full transition-all duration-75"
          style="width: {testAudioLevel * 100}%"
        ></div>
        {#if !isTesting}
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-xs text-muted-foreground font-mono">Click "Start Test" and speak</span>
          </div>
        {/if}
      </div>
      
      {#if isTesting}
        <p class="text-xs text-muted-foreground text-center">
          Speak into your microphone to test the audio level
        </p>
      {/if}
    </div>

    <!-- Voice Mode -->
    <div class="space-y-2">
      <Label class="font-mono text-sm">Voice Mode</Label>
      <Select.Root 
        type="single"
        value={config?.mode ?? "push-to-talk"}
        onValueChange={(v) => changeMode(v as VoiceMode)}
      >
        <Select.Trigger class="w-full font-mono text-sm">
          {config?.mode === "toggle" ? "Toggle (Click to start/stop)" : "Push-to-Talk (Hold to record)"}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="push-to-talk" class="font-mono text-sm">
            Push-to-Talk (Hold to record)
          </Select.Item>
          <Select.Item value="toggle" class="font-mono text-sm">
            Toggle (Click to start/stop)
          </Select.Item>
        </Select.Content>
      </Select.Root>
      <p class="text-xs text-muted-foreground">
        {#if config?.mode === "toggle"}
          Click the microphone button to start recording, click again to stop and transcribe.
        {:else}
          Hold <kbd class="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{config?.pushToTalkKey ?? "Ctrl+Shift+M"}</kbd> or the microphone button to record.
        {/if}
      </p>
    </div>

    <!-- Speech Recognition Models -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <Label class="font-mono text-sm">Speech Recognition Model</Label>
        {#if isModelLoaded && loadedModelSize}
          <span class="text-xs text-[var(--cyber-emerald)] font-mono flex items-center gap-1">
            <Check class="h-3 w-3" />
            {loadedModelSize} loaded
          </span>
        {/if}
      </div>
      
      <div class="grid gap-2">
        {#each ["tiny", "base", "small", "medium"] as size}
          {@const desc = modelDescriptions[size as ModelSize]}
          {@const downloaded = isModelDownloaded(size as ModelSize)}
          {@const isLoaded = loadedModelSize === size}
          {@const isDownloading = downloadingModel === size}
          
          <div 
            class="flex items-center justify-between p-3 rounded-lg border transition-all
              {isLoaded 
                ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
                : 'border-border/30 bg-background/50 hover:border-border/50'}"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm font-medium capitalize">{size}</span>
                {#if downloaded}
                  <span class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">
                    Downloaded
                  </span>
                {/if}
                {#if isLoaded}
                  <span class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30">
                    Active
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                {desc.speed} / {desc.accuracy} - {desc.size}
              </p>
            </div>
            
            <div class="flex items-center gap-2 ml-3">
              {#if isDownloading}
                  <div class="flex items-center gap-2">
                  <div class="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      class="h-full bg-[var(--cyber-cyan)] transition-all" 
                      style="width: {downloadProgress}%"
                    ></div>
                  </div>
                  <Loader2 class="h-4 w-4 animate-spin text-[var(--cyber-cyan)]" />
                </div>
              {:else if downloaded}
                {#if isLoaded}
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={unloadModel}
                    class="font-mono text-xs h-7"
                  >
                    Unload
                  </Button>
                {:else}
                  <Button
                    variant="default"
                    size="sm"
                    onclick={() => loadModel(size as ModelSize)}
                    class="font-mono text-xs h-7"
                  >
                    Load
                  </Button>
                {/if}
              {:else}
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => downloadModel(size as ModelSize)}
                  class="font-mono text-xs h-7"
                >
                  <Download class="h-3 w-3 mr-1" />
                  Download
                </Button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      
      <p class="text-xs text-muted-foreground">
        Models are processed locally on your device. Larger models are more accurate but slower.
      </p>
    </div>

    <!-- Wake Word Detection -->
    <div class="space-y-3 pt-4 border-t border-border/30">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Ear class="h-4 w-4 text-muted-foreground" />
          <Label class="font-mono text-sm">Wake Word Detection</Label>
        </div>
        {#if isWakewordListening}
          <span class="text-xs text-[var(--cyber-emerald)] font-mono flex items-center gap-1">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cyber-emerald)] opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-[var(--cyber-emerald)]"></span>
            </span>
            Listening
          </span>
        {/if}
      </div>

      <!-- Wake word detection notification -->
      {#if lastDetectedWakeword}
        <div class="p-3 rounded-lg border border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 animate-pulse">
          <div class="flex items-center gap-2">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cyber-cyan)] opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-[var(--cyber-cyan)]"></span>
            </span>
            <span class="font-mono text-sm text-[var(--cyber-cyan)]">
              Detected: "{lastDetectedWakeword}"
            </span>
          </div>
        </div>
      {/if}

      <p class="text-xs text-muted-foreground">
        Enable hands-free voice activation by saying a wake phrase like "Hey Jarvis".
      </p>

      <!-- Feature Models Setup -->
      {#if !areFeatureModelsDownloaded}
        <div class="p-4 rounded-lg border border-border/30 bg-background/50">
          <div class="flex items-start gap-3">
            <AlertCircle class="h-5 w-5 text-[var(--cyber-amber)] mt-0.5 flex-shrink-0" />
            <div class="flex-1">
              <h4 class="font-mono text-sm font-medium">Setup Required</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Download the audio processing models (~15 MB) to enable wake word detection.
              </p>
              <Button
                variant="default"
                size="sm"
                onclick={downloadFeatureModels}
                disabled={downloadingFeatureModels}
                class="font-mono text-xs mt-3"
              >
                {#if downloadingFeatureModels}
                  <Loader2 class="h-3 w-3 mr-1 animate-spin" />
                  Downloading...
                {:else}
                  <Download class="h-3 w-3 mr-1" />
                  Download Feature Models
                {/if}
              </Button>
            </div>
          </div>
        </div>
      {:else if !isWakewordProcessorInitialized}
        <div class="p-4 rounded-lg border border-border/30 bg-background/50">
          <div class="flex items-start gap-3">
            <AlertCircle class="h-5 w-5 text-[var(--cyber-cyan)] mt-0.5 flex-shrink-0" />
            <div class="flex-1">
              <h4 class="font-mono text-sm font-medium">Initialize Processor</h4>
              <p class="text-xs text-muted-foreground mt-1">
                Initialize the wake word processor to start using wake word detection.
              </p>
              <Button
                variant="default"
                size="sm"
                onclick={initWakewordProcessor}
                class="font-mono text-xs mt-3"
              >
                Initialize
              </Button>
            </div>
          </div>
        </div>
      {:else}
        <!-- Wake Word Models -->
        <div class="grid gap-2">
          {#each builtinWakewordModels as model}
            {@const isDownloaded = model.path !== null}
            {@const isLoaded = model.isLoaded}
            {@const isDownloading = downloadingWakewordModel === model.modelId}
            
            <div 
              class="flex items-center justify-between p-3 rounded-lg border transition-all
                {isLoaded 
                  ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
                  : 'border-border/30 bg-background/50 hover:border-border/50'}"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm font-medium">{model.name}</span>
                  {#if isDownloaded}
                    <span class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">
                      Downloaded
                    </span>
                  {/if}
                  {#if isLoaded}
                    <span class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30">
                      Active
                    </span>
                  {/if}
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Say "{model.name}" to activate voice input
                </p>
              </div>
              
              <div class="flex items-center gap-2 ml-3">
                {#if isDownloading}
                  <Loader2 class="h-4 w-4 animate-spin text-[var(--cyber-cyan)]" />
                {:else if isDownloaded}
                  {#if isLoaded}
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => unloadWakewordModel(model.modelId)}
                      class="font-mono text-xs h-7"
                    >
                      Unload
                    </Button>
                  {:else}
                    <Button
                      variant="default"
                      size="sm"
                      onclick={() => loadWakewordModel(model.modelId)}
                      class="font-mono text-xs h-7"
                    >
                      Load
                    </Button>
                  {/if}
                {:else}
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => downloadWakewordModel(model.modelId)}
                    class="font-mono text-xs h-7"
                  >
                    <Download class="h-3 w-3 mr-1" />
                    Download
                  </Button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Listening Control -->
        {#if wakewordModels.some(m => m.isLoaded)}
          <div class="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-background/50">
            <div>
              <Label class="font-mono text-sm">Wake Word Listening</Label>
              <p class="text-xs text-muted-foreground">
                {isWakewordListening 
                  ? "Continuously monitoring for wake words" 
                  : "Start listening for wake word activation"}
              </p>
            </div>
            <Button
              variant={isWakewordListening ? "destructive" : "default"}
              size="sm"
              onclick={isWakewordListening ? stopWakewordListening : startWakewordListening}
              class="font-mono text-xs"
            >
              {#if isWakewordListening}
                <Square class="h-3 w-3 mr-1" />
                Stop
              {:else}
                <Play class="h-3 w-3 mr-1" />
                Start
              {/if}
            </Button>
          </div>

          <!-- Threshold Control -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="font-mono text-sm">Detection Sensitivity</Label>
              <span class="text-xs text-muted-foreground font-mono">
                {((wakewordConfig?.threshold ?? 0.5) * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={wakewordConfig?.threshold ?? 0.5}
              oninput={(e) => updateWakewordThreshold(parseFloat(e.currentTarget.value))}
              class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[var(--cyber-cyan)]"
            />
            <p class="text-xs text-muted-foreground">
              Lower = more sensitive (may have false activations), Higher = more strict (may miss some activations)
            </p>
          </div>
        {:else}
          <p class="text-xs text-muted-foreground text-center py-2">
            Download and load a wake word model to enable voice activation.
          </p>
        {/if}
      {/if}
    </div>
  {/if}
</div>
