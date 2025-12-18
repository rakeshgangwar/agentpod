/**
 * Voice Input Hook
 * 
 * React hook for managing voice recording and transcription.
 * Communicates with the Rust backend via Tauri commands.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { 
  VoiceConfig, 
  ModelInfo, 
  TranscriptionResult,
  DownloadProgress,
} from './types';

/** Voice input state */
export interface VoiceInputState {
  /** Whether voice input feature is available (backend compiled with voice support) */
  isAvailable: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether processing transcription */
  isProcessing: boolean;
  /** Current audio level (0.0 - 1.0) for visualization */
  audioLevel: number;
  /** Recording duration in seconds */
  duration: number;
  /** Whether a model is loaded and ready */
  isModelLoaded: boolean;
  /** Current configuration */
  config: VoiceConfig | null;
  /** Error message if any */
  error: string | null;
}

/** Voice input actions */
export interface VoiceInputActions {
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording and transcribe */
  stopRecording: () => Promise<TranscriptionResult | null>;
  /** Cancel recording without transcribing */
  cancelRecording: () => Promise<void>;
  /** Toggle recording (for toggle mode) */
  toggleRecording: () => Promise<TranscriptionResult | null>;
  /** Load a whisper model */
  loadModel: (model: string) => Promise<void>;
  /** Unload the current model */
  unloadModel: () => Promise<void>;
  /** Download a model */
  downloadModel: (model: string) => Promise<void>;
  /** Update configuration */
  setConfig: (config: Partial<VoiceConfig>) => Promise<void>;
  /** Check if voice feature is available */
  checkAvailability: () => Promise<boolean>;
}

/** Wake word detection result */
export interface WakewordDetection {
  /** Name of the detected wake word (e.g., "Hey Jarvis") */
  name: string;
  /** Confidence score (0.0 - 1.0) */
  score: number;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/** Options for the useVoiceInput hook */
export interface UseVoiceInputOptions {
  /** Callback when transcript is ready */
  onTranscript?: (result: TranscriptionResult) => void;
  /** Callback when error occurs */
  onError?: (error: string) => void;
  /** Callback when model download progress updates */
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Callback when transcription progress updates */
  onTranscribeProgress?: (progress: number) => void;
  /** Auto-load model on mount */
  autoLoadModel?: boolean;
  /** Enable wake word triggered recording */
  enableWakeWord?: boolean;
  /** Callback when wake word is detected */
  onWakeWordDetected?: (detection: WakewordDetection) => void;
  /** Auto-stop recording after silence (seconds). 0 = disabled. Default: 3 */
  silenceTimeout?: number;
  /** Audio level threshold for silence detection (0.0 - 1.0). Default: 0.01 */
  silenceThreshold?: number;
}

/** Default voice config */
const DEFAULT_CONFIG: VoiceConfig = {
  enabled: false,
  mode: 'push-to-talk',
  model: 'base',
  language: 'en',
  wakeWordEnabled: false,
  wakePhrases: ['Buddy', 'Hey Buddy'],
  pushToTalkKey: 'Ctrl+Shift+M',
};

/**
 * Hook for voice input functionality
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): [VoiceInputState, VoiceInputActions] {
  const {
    onTranscript,
    onError,
    onDownloadProgress,
    onTranscribeProgress,
    autoLoadModel = false,
    enableWakeWord = false,
    onWakeWordDetected,
    silenceTimeout = 3, // Auto-stop after 3 seconds of silence by default
    silenceThreshold = 0.01, // Audio level below this is considered silence
  } = options;

  // State
  const [isAvailable, setIsAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [config, setConfigState] = useState<VoiceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for event listeners
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const audioLevelInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Ref for wake word triggered recording
  const wakeWordUnlistenRef = useRef<UnlistenFn | null>(null);
  const isRecordingRef = useRef(false);
  
  // Refs for silence detection
  const silenceStartTime = useRef<number | null>(null);
  const hasSpokenRef = useRef(false); // Track if user has spoken (to avoid stopping before they start)
  const stopRecordingRef = useRef<(() => Promise<TranscriptionResult | null>) | null>(null);
  const peakLevelRef = useRef<number>(0); // Track peak level during speech for adaptive threshold
  
  // Keep isRecordingRef in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Check if voice feature is available
  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      // Try to call a simple voice command - if it fails, voice isn't available
      console.log('[Voice] Checking availability...');
      const config = await invoke<VoiceConfig>('voice_get_config');
      console.log('[Voice] Voice feature is available:', config);
      setIsAvailable(true);
      return true;
    } catch (err) {
      // Voice feature not compiled in
      console.log('[Voice] Voice feature not available:', err);
      setIsAvailable(false);
      return false;
    }
  }, []);

  // Load configuration from backend
  const loadConfig = useCallback(async () => {
    try {
      const backendConfig = await invoke<VoiceConfig>('voice_get_config');
      setConfigState(backendConfig);
    } catch (err) {
      console.error('Failed to load voice config:', err);
      setConfigState(DEFAULT_CONFIG);
    }
  }, []);

  // Check if model is loaded
  const checkModelLoaded = useCallback(async () => {
    try {
      const loaded = await invoke<boolean>('voice_is_model_loaded');
      setIsModelLoaded(loaded);
      return loaded;
    } catch {
      setIsModelLoaded(false);
      return false;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const available = await checkAvailability();
      if (available) {
        await loadConfig();
        await checkModelLoaded();

        // Set up event listeners
        const unlisten1 = await listen<number>('voice:level', (event) => {
          setAudioLevel(event.payload);
        });
        
        const unlisten2 = await listen<DownloadProgress>('voice:model_progress', (event) => {
          onDownloadProgress?.(event.payload);
        });

        const unlisten3 = await listen<number>('voice:transcribe_progress', (event) => {
          onTranscribeProgress?.(event.payload);
        });

        const unlisten4 = await listen<string>('voice:transcript', (event) => {
          // This is an alternative to the return value from voice_stop_recording
          console.log('Transcript event received:', event.payload);
        });

        // Listen for model loaded/unloaded events (for cross-component sync)
        const unlisten5 = await listen<string>('voice:model_loaded', (event) => {
          console.log('[Voice] Model loaded event received:', event.payload);
          setIsModelLoaded(true);
        });

        const unlisten6 = await listen('voice:model_unloaded', () => {
          console.log('[Voice] Model unloaded event received');
          setIsModelLoaded(false);
        });

        unlistenRefs.current = [unlisten1, unlisten2, unlisten3, unlisten4, unlisten5, unlisten6];

        // Auto-load model if requested
        if (autoLoadModel) {
          const modelLoaded = await checkModelLoaded();
          if (!modelLoaded) {
            const config = await invoke<VoiceConfig>('voice_get_config');
            const modelDownloaded = await invoke<boolean>('voice_is_model_downloaded', { model: config.model });
            if (modelDownloaded) {
              try {
                await invoke('voice_load_model', { model: config.model });
                setIsModelLoaded(true);
              } catch (err) {
                console.error('Failed to auto-load model:', err);
              }
            }
          }
        }
      }
    };

    init();

    // Cleanup
    return () => {
      unlistenRefs.current.forEach(unlisten => unlisten());
      if (audioLevelInterval.current) clearInterval(audioLevelInterval.current);
      if (durationInterval.current) clearInterval(durationInterval.current);
    };
  }, [checkAvailability, loadConfig, checkModelLoaded, autoLoadModel, onDownloadProgress, onTranscribeProgress]);

  // Wake word detection listener
  useEffect(() => {
    if (!enableWakeWord || !isAvailable) return;

    let isMounted = true;

    const setupWakeWordListener = async () => {
      // Listen for wake word detection events
      const unlisten = await listen<WakewordDetection>('wakeword:detected', async (event) => {
        if (!isMounted) return;
        
        console.log('[Voice] Wake word detected:', event.payload);
        
        // Call the callback if provided
        onWakeWordDetected?.(event.payload);
        
        // Auto-start recording if not already recording
        if (!isRecordingRef.current && isModelLoaded) {
          console.log('[Voice] Starting recording from wake word trigger');
          
          // Reset silence detection state
          silenceStartTime.current = null;
          hasSpokenRef.current = false;
          
          try {
            await invoke('voice_start_recording');
            setIsRecording(true);
            setDuration(0);
            setError(null);
            
            // Start polling audio level with silence detection
            let debugCounter = 0;
            peakLevelRef.current = 0;
            
            audioLevelInterval.current = setInterval(async () => {
              try {
                const level = await invoke<number>('voice_get_audio_level');
                setAudioLevel(level);
                
                // Debug log every second
                debugCounter++;
                if (debugCounter % 20 === 0) {
                  console.log(`[Voice] Audio level: ${level.toFixed(4)}, peak: ${peakLevelRef.current.toFixed(4)}, hasSpoken: ${hasSpokenRef.current}, silenceStart: ${silenceStartTime.current !== null}`);
                }
                
                // Silence detection logic (only if enabled)
                if (silenceTimeout > 0) {
                  // Track peak level for adaptive threshold
                  if (level > peakLevelRef.current) {
                    peakLevelRef.current = level;
                  }
                  
                  // Track if user has started speaking (significant audio above noise floor)
                  // Consider "speaking" when level is notably higher than threshold
                  if (!hasSpokenRef.current && level >= 0.06) {
                    hasSpokenRef.current = true;
                    console.log('[Voice] User started speaking (wake word mode), level:', level.toFixed(4));
                  }
                  
                  // Only start silence timer after user has spoken
                  if (hasSpokenRef.current) {
                    // Adaptive silence detection: silence is when level drops to less than 50% of peak
                    // or below the configured threshold, whichever is higher
                    const adaptiveThreshold = Math.max(silenceThreshold, peakLevelRef.current * 0.4);
                    const isSilent = level < adaptiveThreshold;
                    
                    if (isSilent) {
                      if (silenceStartTime.current === null) {
                        silenceStartTime.current = Date.now();
                        console.log(`[Voice] Silence detected (level ${level.toFixed(4)} < threshold ${adaptiveThreshold.toFixed(4)})`);
                      } else {
                        const silenceDuration = (Date.now() - silenceStartTime.current) / 1000;
                        if (silenceDuration >= silenceTimeout) {
                          console.log(`[Voice] Auto-stopping after ${silenceTimeout}s of silence (wake word mode)`);
                          stopRecordingRef.current?.();
                        }
                      }
                    } else {
                      if (silenceStartTime.current !== null) {
                        console.log('[Voice] Speech resumed, resetting silence timer');
                      }
                      silenceStartTime.current = null;
                    }
                  }
                }
              } catch {
                // Ignore errors during polling
              }
            }, 50);
            
            // Start duration timer
            const startTime = Date.now();
            durationInterval.current = setInterval(() => {
              setDuration((Date.now() - startTime) / 1000);
            }, 100);
          } catch (err) {
            console.error('[Voice] Failed to start recording from wake word:', err);
            const errorMsg = String(err);
            setError(errorMsg);
            onError?.(errorMsg);
          }
        }
      });

      wakeWordUnlistenRef.current = unlisten;
    };

    setupWakeWordListener();

    return () => {
      isMounted = false;
      if (wakeWordUnlistenRef.current) {
        wakeWordUnlistenRef.current();
        wakeWordUnlistenRef.current = null;
      }
    };
  }, [enableWakeWord, isAvailable, isModelLoaded, onWakeWordDetected, onError]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!isAvailable || isRecording) return;
    
    setError(null);
    
    // Reset silence detection state
    silenceStartTime.current = null;
    hasSpokenRef.current = false;
    peakLevelRef.current = 0;
    
    try {
      await invoke('voice_start_recording');
      setIsRecording(true);
      setDuration(0);
      
      // Start polling audio level with silence detection
      audioLevelInterval.current = setInterval(async () => {
        try {
          const level = await invoke<number>('voice_get_audio_level');
          setAudioLevel(level);
          
          // Silence detection logic (only if enabled)
          if (silenceTimeout > 0) {
            // Track peak level for adaptive threshold
            if (level > peakLevelRef.current) {
              peakLevelRef.current = level;
            }
            
            // Track if user has started speaking
            if (!hasSpokenRef.current && level >= 0.06) {
              hasSpokenRef.current = true;
              console.log('[Voice] User started speaking, level:', level.toFixed(4));
            }
            
            // Only start silence timer after user has spoken
            if (hasSpokenRef.current) {
              // Adaptive silence detection
              const adaptiveThreshold = Math.max(silenceThreshold, peakLevelRef.current * 0.4);
              const isSilent = level < adaptiveThreshold;
              
              if (isSilent) {
                if (silenceStartTime.current === null) {
                  silenceStartTime.current = Date.now();
                  console.log(`[Voice] Silence detected (level ${level.toFixed(4)} < threshold ${adaptiveThreshold.toFixed(4)})`);
                } else {
                  const silenceDuration = (Date.now() - silenceStartTime.current) / 1000;
                  if (silenceDuration >= silenceTimeout) {
                    console.log(`[Voice] Auto-stopping after ${silenceTimeout}s of silence`);
                    stopRecordingRef.current?.();
                  }
                }
              } else {
                if (silenceStartTime.current !== null) {
                  console.log('[Voice] Speech resumed, resetting silence timer');
                  silenceStartTime.current = null;
                }
              }
            }
          }
        } catch {
          // Ignore errors during polling
        }
      }, 50); // 20fps for smooth visualization
      
      // Start duration timer
      const startTime = Date.now();
      durationInterval.current = setInterval(() => {
        setDuration((Date.now() - startTime) / 1000);
      }, 100);
      
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [isAvailable, isRecording, onError, silenceTimeout, silenceThreshold]);

  // Stop recording and transcribe
  const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    if (!isRecording) return null;
    
    // Stop polling
    if (audioLevelInterval.current) {
      clearInterval(audioLevelInterval.current);
      audioLevelInterval.current = null;
    }
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
    
    // Reset silence detection state
    silenceStartTime.current = null;
    hasSpokenRef.current = false;
    
    setIsRecording(false);
    setIsProcessing(true);
    setAudioLevel(0);
    
    try {
      const result = await invoke<TranscriptionResult>('voice_stop_recording');
      setIsProcessing(false);
      onTranscript?.(result);
      return result;
    } catch (err) {
      setIsProcessing(false);
      const errorMsg = String(err);
      setError(errorMsg);
      onError?.(errorMsg);
      return null;
    }
  }, [isRecording, onTranscript, onError]);
  
  // Keep stopRecording ref updated for silence detection callback
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  // Cancel recording
  const cancelRecording = useCallback(async () => {
    if (!isRecording) return;
    
    // Stop polling
    if (audioLevelInterval.current) {
      clearInterval(audioLevelInterval.current);
      audioLevelInterval.current = null;
    }
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
    
    try {
      await invoke('voice_cancel_recording');
    } catch (err) {
      console.error('Failed to cancel recording:', err);
    }
    
    setIsRecording(false);
    setAudioLevel(0);
    setDuration(0);
  }, [isRecording]);

  // Toggle recording (for toggle mode)
  const toggleRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    if (isRecording) {
      return stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

  // Load a model
  const loadModel = useCallback(async (model: string) => {
    setError(null);
    try {
      await invoke('voice_load_model', { model });
      setIsModelLoaded(true);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      onError?.(errorMsg);
      throw err;
    }
  }, [onError]);

  // Unload model
  const unloadModel = useCallback(async () => {
    try {
      await invoke('voice_unload_model');
      setIsModelLoaded(false);
    } catch (err) {
      console.error('Failed to unload model:', err);
    }
  }, []);

  // Download a model
  const downloadModel = useCallback(async (model: string) => {
    setError(null);
    try {
      await invoke('voice_download_model', { model });
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      onError?.(errorMsg);
      throw err;
    }
  }, [onError]);

  // Update configuration
  const setConfig = useCallback(async (updates: Partial<VoiceConfig>) => {
    if (!config) return;
    
    const newConfig = { ...config, ...updates };
    try {
      await invoke('voice_set_config', { config: newConfig });
      setConfigState(newConfig);
    } catch (err) {
      console.error('Failed to update config:', err);
      const errorMsg = String(err);
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [config, onError]);

  // Build state and actions
  const state: VoiceInputState = {
    isAvailable,
    isRecording,
    isProcessing,
    audioLevel,
    duration,
    isModelLoaded,
    config,
    error,
  };

  const actions: VoiceInputActions = {
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    loadModel,
    unloadModel,
    downloadModel,
    setConfig,
    checkAvailability,
  };

  return [state, actions];
}

/**
 * Hook for listing available models
 */
export function useVoiceModels() {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [available, downloaded] = await Promise.all([
        invoke<ModelInfo[]>('voice_list_available_models'),
        invoke<ModelInfo[]>('voice_list_downloaded_models'),
      ]);
      setAvailableModels(available);
      setDownloadedModels(downloaded);
    } catch (err) {
      console.error('Failed to list models:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { availableModels, downloadedModels, loading, refresh };
}

/**
 * Hook for listing audio input devices
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<string[]>([]);
  const [defaultDevice, setDefaultDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [deviceList, defaultDev] = await Promise.all([
          invoke<string[]>('voice_list_input_devices'),
          invoke<string>('voice_get_default_input_device'),
        ]);
        setDevices(deviceList);
        setDefaultDevice(defaultDev);
      } catch (err) {
        console.error('Failed to list audio devices:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { devices, defaultDevice, loading };
}
