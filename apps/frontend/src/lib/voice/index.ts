/**
 * Voice Input Module
 * 
 * Provides voice recording and speech-to-text functionality.
 * Uses Tauri commands to communicate with the Rust backend.
 */

// Types
export type {
  VoiceMode,
  ModelSize,
  VoiceConfig,
  ModelInfo,
  DownloadProgress,
  TranscriptSegment,
  TranscriptionResult,
  VoiceError,
} from './types';

export { DEFAULT_VOICE_CONFIG } from './types';

// Hooks
export {
  useVoiceInput,
  useVoiceModels,
  useAudioDevices,
  type VoiceInputState,
  type VoiceInputActions,
  type UseVoiceInputOptions,
  type WakewordDetection,
} from './useVoiceInput';

// Components
export { VoiceInputButton, type VoiceInputButtonProps } from './VoiceInputButton';
export { VoiceSetupDialog } from './VoiceSetupDialog';
