# Voice Input Feature Implementation

> **Status**: Phase 1 Complete (Core Infrastructure)
> **Last Updated**: December 2024

## Overview

This document outlines the implementation of voice input capabilities for AgentPod's chat interface. The feature enables users to interact with AI agents using voice, with full offline speech-to-text processing via whisper.cpp.

## Key Features

1. **Push-to-Talk Mode**: Hold a key (default: Alt+Space / Opt+Space) to record
2. **Toggle Mode**: Click to start/stop recording
3. **Local STT**: Fully offline transcription using whisper-rs (whisper.cpp bindings)
4. **Wake Word Detection**: Configurable wake phrase (default: "Buddy" / "Hey Buddy")
5. **GPU Acceleration**: Metal (macOS), CUDA (NVIDIA), Vulkan (cross-platform)
6. **User-Selectable Models**: tiny, base, small, medium (user chooses based on speed/accuracy preference)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Voice Input Architecture (Rust-First)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      Frontend (React/Svelte)                           │ │
│  │  ┌─────────────┐  ┌─────────────────────────────────────────────────┐ │ │
│  │  │VoiceButton  │  │           Voice Recording UI                     │ │ │
│  │  │(UI control) │  │  - Audio level visualization                     │ │ │
│  │  │             │  │  - Interim transcript display                    │ │ │
│  │  └──────┬──────┘  │  - Recording state indicator                     │ │ │
│  │         │         └──────────────────────────────────────────────────┘ │ │
│  │         │ invoke("voice_start_recording") / invoke("voice_stop_recording") │
│  └─────────┼──────────────────────────────────────────────────────────────┘ │
│            │                                                                 │
│  ┌─────────┴──────────────────────────────────────────────────────────────┐ │
│  │                     Tauri Rust Backend                                  │ │
│  │                                                                         │ │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐ │ │
│  │  │ AudioRecorder   │    │ WhisperService  │    │ WakeWordDetector    │ │ │
│  │  │ (cpal + hound)  │    │ (whisper-rs)    │    │ (keyword matching)  │ │ │
│  │  │                 │    │                 │    │                     │ │ │
│  │  │ - Microphone    │    │ - Model loading │    │ - "Hey Buddy"       │ │ │
│  │  │   capture       │───▶│ - Transcription │    │ - Configurable      │ │ │
│  │  │ - Audio buffer  │    │ - Progress CB   │    │                     │ │ │
│  │  │ - Level meter   │    │ - GPU accel     │    │                     │ │ │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────────┘ │ │
│  │                                                                         │ │
│  │  Events emitted to frontend:                                            │ │
│  │  - "voice:level" (f32) - Audio level for visualization                  │ │
│  │  - "voice:transcript" (String) - Final transcription                    │ │
│  │  - "voice:wake" - Wake word detected                                    │ │
│  │  - "voice:model_progress" (i32) - Model download/load progress          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

### Rust Backend

```
apps/frontend/src-tauri/src/
├── commands/
│   ├── mod.rs              # (update: export voice commands)
│   ├── sandboxes.rs        # (existing)
│   └── voice.rs            # NEW: Voice input Tauri commands
├── voice/                  # NEW: Voice processing module
│   ├── mod.rs              # Module exports
│   ├── recorder.rs         # Audio recording via cpal
│   ├── whisper.rs          # Whisper transcription service
│   ├── wake_word.rs        # Wake word detection (simple)
│   ├── audio_utils.rs      # Audio format conversion (i16 <-> f32)
│   ├── config.rs           # Voice configuration
│   └── model_manager.rs    # Model download and management
└── lib.rs                  # (update: register voice commands and state)
```

### Frontend

```
apps/frontend/src/lib/
├── voice/                          # NEW: Voice input module
│   ├── index.ts                    # Exports
│   ├── types.ts                    # TypeScript types
│   ├── useVoiceInput.ts            # React hook for voice input
│   └── VoiceInputButton.tsx        # Voice button component
├── chat/
│   └── ChatThread.tsx              # (update: integrate voice button)
└── settings/
    └── VoiceSettings.svelte        # NEW: Voice configuration UI
```

## Rust Dependencies

Add to `apps/frontend/src-tauri/Cargo.toml`:

```toml
[dependencies]
# Audio recording
cpal = "0.15"
hound = "3.5"

# Transcription (whisper.cpp bindings)
whisper-rs = { git = "https://codeberg.org/tazz4843/whisper-rs.git", default-features = false }

# Async/threading utilities
parking_lot = "0.12"
eyre = "0.6"

# Model download
hf-hub = "0.4"  # Hugging Face model download

[features]
default = []
# GPU acceleration
metal = ["whisper-rs/metal"]          # macOS GPU
cuda = ["whisper-rs/cuda"]            # NVIDIA GPU
vulkan = ["whisper-rs/vulkan"]        # Cross-platform GPU (AMD, Intel, etc.)
```

## Whisper Models

Models are downloaded from Hugging Face and stored in the app data directory:

| Model | File | Size | Speed | Accuracy | Recommended For |
|-------|------|------|-------|----------|-----------------|
| tiny | `ggml-tiny.bin` | 75 MB | Very Fast | Basic | Wake word detection |
| base | `ggml-base.bin` | 142 MB | Fast | Good | Quick dictation |
| small | `ggml-small.bin` | 466 MB | Medium | Better | General use |
| medium | `ggml-medium.bin` | 1.5 GB | Slower | High | Best quality |

### Storage Locations

- **macOS**: `~/Library/Application Support/dev.agentpod.app/models/whisper/`
- **Windows**: `%APPDATA%/dev.agentpod.app/models/whisper/`
- **Linux**: `~/.local/share/dev.agentpod.app/models/whisper/`

## API Design

### Tauri Commands

```rust
// Recording control
#[command] voice_start_recording() -> Result<(), String>
#[command] voice_stop_recording() -> Result<String, String>  // Returns transcript
#[command] voice_cancel_recording() -> Result<(), String>
#[command] voice_get_audio_level() -> Result<f32, String>    // 0.0 - 1.0

// Model management
#[command] voice_list_available_models() -> Vec<ModelInfo>
#[command] voice_list_downloaded_models() -> Vec<ModelInfo>
#[command] voice_download_model(model: String) -> Result<(), String>
#[command] voice_delete_model(model: String) -> Result<(), String>
#[command] voice_load_model(model: String) -> Result<(), String>
#[command] voice_unload_model() -> Result<(), String>
#[command] voice_is_model_loaded() -> bool

// Configuration
#[command] voice_get_config() -> VoiceConfig
#[command] voice_set_config(config: VoiceConfig) -> Result<(), String>

// Wake word (Phase 2)
#[command] voice_start_wake_word_listening() -> Result<(), String>
#[command] voice_stop_wake_word_listening() -> Result<(), String>
```

### Events (Rust -> Frontend)

```typescript
// Audio level updates during recording (for visualization)
listen("voice:level", (event: { payload: number }) => {
  // payload is 0.0 - 1.0
});

// Model download/load progress
listen("voice:model_progress", (event: { payload: { stage: string; progress: number } }) => {
  // stage: "downloading" | "loading"
  // progress: 0 - 100
});

// Wake word detected
listen("voice:wake", () => {
  // Start recording automatically
});

// Transcription complete (alternative to command return)
listen("voice:transcript", (event: { payload: string }) => {
  // Final transcript text
});
```

## Configuration Schema

```typescript
interface VoiceConfig {
  // Feature toggle
  enabled: boolean;
  
  // Interaction mode
  mode: 'push-to-talk' | 'toggle';
  
  // Model selection (user's choice)
  model: 'tiny' | 'base' | 'small' | 'medium';
  
  // Language
  language: string;  // 'en', 'auto', 'es', 'fr', etc.
  
  // Wake word settings
  wakeWordEnabled: boolean;
  wakePhrases: string[];  // ["Buddy", "Hey Buddy"]
  
  // Keybinding
  pushToTalkKey: string;  // Default: "Alt+Space" (Windows/Linux), "Opt+Space" (macOS)
}
```

### Default Configuration

```json
{
  "enabled": false,
  "mode": "push-to-talk",
  "model": "base",
  "language": "en",
  "wakeWordEnabled": false,
  "wakePhrases": ["Buddy", "Hey Buddy"],
  "pushToTalkKey": "Alt+Space"
}
```

## Implementation Status

### Phase 1: Core Infrastructure - COMPLETE

- [x] Add Rust dependencies to Cargo.toml (as optional `voice` feature)
- [x] Create voice module structure (`src-tauri/src/voice/`)
- [x] Implement AudioRecorder (cpal-based microphone capture)
- [x] Implement WhisperService (model loading + transcription)
- [x] Create Tauri commands for recording control
- [x] Model download from Hugging Face (`model_manager.rs`)

### Phase 2: Frontend Integration - COMPLETE

- [x] Create useVoiceInput React hook (`src/lib/voice/useVoiceInput.ts`)
- [x] Create VoiceInputButton component (`src/lib/voice/VoiceInputButton.tsx`)
- [x] Export voice module (`src/lib/voice/index.ts`)
- [x] Type definitions (`src/lib/voice/types.ts`)
- [x] Integrate into ChatThread Composer (`src/lib/chat/ChatThread.tsx`)
- [x] Audio level visualization (component supports it)
- [x] Recording state UI feedback (component supports it)
- [x] VoiceSetupDialog for model download (`src/lib/voice/VoiceSetupDialog.tsx`)

### Phase 3: Settings & Configuration - PARTIAL

- [x] VoiceConfig type and default values
- [x] Tauri commands for config get/set
- [x] Model selection dropdown (in VoiceSetupDialog)
- [ ] Voice settings UI page (in main Settings)
- [ ] Keybinding configuration UI

### Phase 4: Wake Word Detection - PENDING

- [ ] Simple keyword matching in transcripts
- [ ] Continuous listening with tiny model
- [ ] Wake word configuration UI

## Building with Voice Support

The voice feature requires system audio libraries:

### Prerequisites

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install -y libasound2-dev
```

**macOS**: No additional dependencies (uses CoreAudio)

**Windows**: No additional dependencies (uses WASAPI)

### Build Commands

```bash
# Build without voice (default)
cargo build

# Build with voice support (CPU only)
cargo build --features voice

# Build with voice + GPU acceleration
cargo build --features voice-metal   # macOS
cargo build --features voice-cuda    # NVIDIA
cargo build --features voice-vulkan  # AMD/Intel/Cross-platform
```

## Next Steps

1. ~~**ChatThread Integration**: Add VoiceInputButton to the Composer component~~ DONE
2. ~~**First-run Flow**: Prompt users to download a model on first use~~ DONE (VoiceSetupDialog)
3. **Settings UI**: Add voice settings panel to main Settings page
4. **Wake Word**: Implement simple keyword matching for "Buddy" / "Hey Buddy"

## Build Configuration

### macOS (Apple Silicon)

```bash
# Enable Metal GPU acceleration
cargo build --features metal
```

### macOS (Intel)

```bash
# CPU only or Vulkan
cargo build
# or
cargo build --features vulkan
```

### Windows (NVIDIA)

```bash
# Enable CUDA
cargo build --features cuda
```

### Windows (AMD/Intel)

```bash
# Enable Vulkan
cargo build --features vulkan
```

### Linux

```bash
# Enable Vulkan for GPU, or CPU-only
cargo build --features vulkan
```

## Security Considerations

1. **Microphone Permission**: Request microphone access explicitly
2. **Local Processing**: All audio processing happens on-device
3. **No Cloud Upload**: Audio data never leaves the user's machine
4. **Model Verification**: Verify model checksums after download

## Testing Plan

1. **Unit Tests**: Audio conversion utilities, config serialization
2. **Integration Tests**: Recording -> Transcription pipeline
3. **Manual Testing**:
   - Different microphone devices
   - Various audio environments (quiet, noisy)
   - Long recordings (5+ minutes)
   - Multiple languages
   - GPU vs CPU performance comparison

## Future Enhancements

1. **Voice Enrollment**: Train custom wake words with user's voice
2. **Speaker Diarization**: Identify different speakers (using pyannote-rs)
3. **Real-time Streaming**: Show transcript as user speaks
4. **Voice Commands**: Navigate UI with voice ("go to projects", "send message")
5. **Audio Feedback**: Confirmation sounds for start/stop recording
