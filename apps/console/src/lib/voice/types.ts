/**
 * Voice input types
 */

/** Voice input mode */
export type VoiceMode = 'push-to-talk' | 'toggle';

/** Whisper model size */
export type ModelSize = 'tiny' | 'base' | 'small' | 'medium';

/** Voice configuration */
export interface VoiceConfig {
  /** Whether voice input is enabled */
  enabled: boolean;
  /** Voice input mode */
  mode: VoiceMode;
  /** Selected whisper model size */
  model: ModelSize;
  /** Language code for transcription (e.g., "en", "auto") */
  language: string;
  /** Whether wake word detection is enabled */
  wakeWordEnabled: boolean;
  /** Wake phrases to listen for */
  wakePhrases: string[];
  /** Keyboard shortcut for push-to-talk */
  pushToTalkKey: string;
}

/** Model information */
export interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Model size category */
  size: ModelSize;
  /** File size description */
  sizeDisplay: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Description of speed/accuracy trade-off */
  description: string;
  /** Whether the model is downloaded locally */
  isDownloaded: boolean;
  /** Local file path (if downloaded) */
  localPath: string | null;
}

/** Download progress */
export interface DownloadProgress {
  /** Current stage */
  stage: 'starting' | 'downloading' | 'complete' | 'failed';
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Progress percentage (0-100) */
  percent: number;
}

/** Transcript segment with timing */
export interface TranscriptSegment {
  /** Start time in centiseconds */
  start: number;
  /** End time in centiseconds */
  end: number;
  /** Transcribed text */
  text: string;
}

/** Transcription result */
export interface TranscriptionResult {
  /** Full transcribed text */
  text: string;
  /** Individual segments with timing */
  segments: TranscriptSegment[];
  /** Detected language (if auto-detection was used) */
  detectedLanguage: string | null;
}

/** Voice input error */
export interface VoiceError {
  code: string;
  message: string;
}

/** Default voice configuration */
export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  mode: 'push-to-talk',
  model: 'base',
  language: 'en',
  wakeWordEnabled: false,
  wakePhrases: ['Buddy', 'Hey Buddy'],
  pushToTalkKey: 'Ctrl+Shift+M',
};
