//! Voice input module for AgentPod
//!
//! Provides voice recording and speech-to-text functionality using:
//! - cpal: Cross-platform audio I/O for microphone capture (macOS/Windows)
//! - parec: PulseAudio/PipeWire CLI for audio capture (Linux)
//! - whisper-rs: Local speech recognition via whisper.cpp
//! - OpenWakeWord: Wake word detection via ONNX models
//!
//! # Architecture
//!
//! ```text
//! ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
//! │ AudioRecorder│───▶│ WhisperService  │───▶│ Transcript Text  │
//! │ (cpal/parec) │    │ (whisper-rs)    │    │                  │
//! └──────────────┘    └─────────────────┘    └──────────────────┘
//!        ▲
//!        │ (triggers on detection)
//! ┌──────────────┐
//! │ WakewordSvc  │ (OpenWakeWord ONNX - continuous monitoring)
//! └──────────────┘
//! ```

pub mod audio_utils;
pub mod config;
pub mod model_manager;
pub mod recorder;
pub mod wakeword;
pub mod whisper;

pub use config::VoiceConfig;
pub use model_manager::{ModelInfo, ModelManager, WhisperModel};
pub use recorder::RecordingState;
pub use wakeword::{WakewordConfig, WakewordDetection, WakewordInfo, WakewordService, BuiltinWakeword};
pub use whisper::WhisperService;

use parking_lot::Mutex;
use std::sync::Arc;

/// Voice input state managed by Tauri
///
/// This struct holds all the voice-related state and is managed
/// as Tauri application state.
pub struct VoiceState {
    /// Recording state (samples, levels, flags)
    pub recording: Arc<RecordingState>,
    /// Recording thread handle
    pub recording_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
    /// Whisper transcription service
    pub whisper: Mutex<Option<WhisperService>>,
    /// Voice configuration
    pub config: Mutex<VoiceConfig>,
    /// Model manager for downloading/listing models
    pub model_manager: Arc<ModelManager>,
    /// Wake word detection service (OpenWakeWord via ONNX)
    pub wakeword: Arc<Mutex<WakewordService>>,
    /// Wake word listener thread handle
    pub wakeword_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl VoiceState {
    /// Create a new VoiceState with default configuration
    pub fn new() -> Self {
        let model_manager = Arc::new(ModelManager::new());
        let wakeword = Arc::new(Mutex::new(WakewordService::new()));

        Self {
            recording: Arc::new(RecordingState::new()),
            recording_handle: Mutex::new(None),
            whisper: Mutex::new(None),
            config: Mutex::new(VoiceConfig::default()),
            model_manager,
            wakeword,
            wakeword_handle: Mutex::new(None),
        }
    }

    /// Start recording audio
    pub fn start_recording(&self) -> Result<(), VoiceError> {
        let handle = recorder::start_recording(Arc::clone(&self.recording))?;
        *self.recording_handle.lock() = Some(handle);
        Ok(())
    }

    /// Stop recording and get samples
    pub fn stop_recording(&self) -> Result<Vec<f32>, VoiceError> {
        let samples = recorder::stop_recording(&self.recording)?;
        
        // Wait for recording thread to finish
        if let Some(handle) = self.recording_handle.lock().take() {
            let _ = handle.join();
        }
        
        Ok(samples)
    }

    /// Cancel recording
    pub fn cancel_recording(&self) -> Result<(), VoiceError> {
        recorder::cancel_recording(&self.recording)?;
        
        // Wait for recording thread to finish
        if let Some(handle) = self.recording_handle.lock().take() {
            let _ = handle.join();
        }
        
        Ok(())
    }
}

impl Default for VoiceState {
    fn default() -> Self {
        Self::new()
    }
}

// VoiceState is Send + Sync because all its fields are
// - Arc<RecordingState> is Send + Sync (RecordingState is marked as such)
// - Mutex<Option<JoinHandle>> is Send + Sync
// - Mutex<Option<WhisperService>> needs WhisperService to be Send
// - Mutex<VoiceConfig> is Send + Sync
// - Arc<ModelManager> is Send + Sync

/// Voice module errors
#[derive(Debug, thiserror::Error)]
pub enum VoiceError {
    #[error("Audio device error: {0}")]
    AudioDevice(String),

    #[error("Recording error: {0}")]
    Recording(String),

    #[error("Whisper model error: {0}")]
    WhisperModel(String),

    #[error("Transcription error: {0}")]
    Transcription(String),

    #[error("Model not loaded")]
    ModelNotLoaded,

    #[error("Not recording")]
    NotRecording,

    #[error("Already recording")]
    AlreadyRecording,

    #[error("Model download error: {0}")]
    ModelDownload(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Configuration error: {0}")]
    Config(String),
}

impl serde::Serialize for VoiceError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
