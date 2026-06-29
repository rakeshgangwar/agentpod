//! Tauri commands for voice input
//!
//! These commands expose the voice recording and transcription functionality
//! to the frontend via Tauri's IPC mechanism.

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};

use crate::voice::{
    config::{ModelSize, VoiceConfig, VoiceMode},
    model_manager::{DownloadProgress, DownloadStage, ModelInfo},
    recorder,
    wakeword::{BuiltinWakeword, WakewordConfig, WakewordInfo},
    whisper::{TranscribeOptions, TranscriptionResult},
    VoiceState, WhisperService,
};

// ============================================================================
// Recording Commands
// ============================================================================

/// Start recording from the microphone
#[command]
pub async fn voice_start_recording(state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("voice_start_recording called");
    state.start_recording().map_err(|e| e.to_string())
}

/// Stop recording and transcribe the audio
///
/// Returns the transcribed text
#[command]
pub async fn voice_stop_recording(
    app: AppHandle,
    state: State<'_, VoiceState>,
) -> Result<TranscriptionResult, String> {
    tracing::info!("voice_stop_recording called");

    // Stop recording and get audio samples
    let audio_samples = state.stop_recording().map_err(|e| e.to_string())?;

    // Check if whisper is loaded
    let whisper_guard = state.whisper.lock();
    let whisper = whisper_guard
        .as_ref()
        .ok_or_else(|| "Whisper model not loaded".to_string())?;

    // Get transcription options from config
    let config = state.config.lock();
    let options = TranscribeOptions {
        language: Some(config.language.clone()),
        translate: false,
        n_threads: None,
    };
    drop(config);

    // Set up progress callback
    let app_handle = app.clone();
    let progress_callback = Arc::new(move |progress: i32| {
        let _ = app_handle.emit("voice:transcribe_progress", progress);
    });

    // Transcribe
    let result = whisper
        .transcribe(&audio_samples, options, Some(progress_callback))
        .map_err(|e| e.to_string())?;

    // Emit transcript event
    let _ = app.emit("voice:transcript", &result.text);

    Ok(result)
}

/// Cancel recording without transcribing
#[command]
pub async fn voice_cancel_recording(state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("voice_cancel_recording called");
    state.cancel_recording().map_err(|e| e.to_string())
}

/// Get current audio level (for visualization)
///
/// Returns a value between 0.0 and 1.0
#[command]
pub fn voice_get_audio_level(state: State<'_, VoiceState>) -> f32 {
    state.recording.get_audio_level()
}

/// Check if currently recording
#[command]
pub fn voice_is_recording(state: State<'_, VoiceState>) -> bool {
    state.recording.is_recording()
}

/// Get recording duration in seconds
#[command]
pub fn voice_get_recording_duration(state: State<'_, VoiceState>) -> f32 {
    state.recording.get_duration()
}

// ============================================================================
// Model Management Commands
// ============================================================================

/// List all available Whisper models
#[command]
pub fn voice_list_available_models(state: State<'_, VoiceState>) -> Vec<ModelInfo> {
    state.model_manager.list_available_models()
}

/// List downloaded Whisper models
#[command]
pub fn voice_list_downloaded_models(state: State<'_, VoiceState>) -> Vec<ModelInfo> {
    state.model_manager.list_downloaded_models()
}

/// Download a Whisper model
#[command]
pub async fn voice_download_model(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model: String,
) -> Result<(), String> {
    tracing::info!("voice_download_model called for: {}", model);

    let size = match model.to_lowercase().as_str() {
        "tiny" => ModelSize::Tiny,
        "base" => ModelSize::Base,
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        _ => return Err(format!("Unknown model: {}", model)),
    };

    let app_handle = app.clone();
    let model_manager = Arc::clone(&state.model_manager);

    // Run download in background
    tokio::task::spawn_blocking(move || {
        model_manager.download_model_sync(size, move |progress| {
            let _ = app_handle.emit("voice:model_progress", &progress);
        })
    })
    .await
    .map_err(|e| format!("Download task failed: {}", e))?
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Delete a downloaded model
#[command]
pub fn voice_delete_model(state: State<'_, VoiceState>, model: String) -> Result<(), String> {
    tracing::info!("voice_delete_model called for: {}", model);

    let size = match model.to_lowercase().as_str() {
        "tiny" => ModelSize::Tiny,
        "base" => ModelSize::Base,
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        _ => return Err(format!("Unknown model: {}", model)),
    };

    state
        .model_manager
        .delete_model(size)
        .map_err(|e| e.to_string())
}

/// Load a Whisper model
#[command]
pub async fn voice_load_model(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model: String,
) -> Result<(), String> {
    tracing::info!("voice_load_model called for: {}", model);

    let size = match model.to_lowercase().as_str() {
        "tiny" => ModelSize::Tiny,
        "base" => ModelSize::Base,
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        _ => return Err(format!("Unknown model: {}", model)),
    };

    let model_path = state.model_manager.model_path(size);

    if !model_path.exists() {
        return Err(format!("Model not downloaded: {}", model));
    }

    // Emit loading progress
    let _ = app.emit(
        "voice:model_progress",
        &DownloadProgress {
            stage: DownloadStage::Starting,
            bytes_downloaded: 0,
            total_bytes: size.size_bytes(),
            percent: 0,
        },
    );

    // Load model
    let mut whisper_guard = state.whisper.lock();
    let mut whisper = whisper_guard.take().unwrap_or_else(WhisperService::new);

    whisper.load_model(model_path).map_err(|e| e.to_string())?;

    *whisper_guard = Some(whisper);

    // Emit complete
    let _ = app.emit(
        "voice:model_progress",
        &DownloadProgress {
            stage: DownloadStage::Complete,
            bytes_downloaded: size.size_bytes(),
            total_bytes: size.size_bytes(),
            percent: 100,
        },
    );

    // Emit model loaded event for cross-component sync
    let _ = app.emit("voice:model_loaded", model);

    Ok(())
}

/// Unload the current Whisper model
#[command]
pub fn voice_unload_model(app: AppHandle, state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("voice_unload_model called");

    let mut whisper_guard = state.whisper.lock();
    if let Some(whisper) = whisper_guard.as_mut() {
        whisper.unload_model();
    }
    *whisper_guard = None;

    // Emit model unloaded event for cross-component sync
    let _ = app.emit("voice:model_unloaded", ());

    Ok(())
}

/// Check if a Whisper model is loaded
#[command]
pub fn voice_is_model_loaded(state: State<'_, VoiceState>) -> bool {
    let whisper_guard = state.whisper.lock();
    whisper_guard
        .as_ref()
        .map(|w| w.is_loaded())
        .unwrap_or(false)
}

/// Check if a specific model is downloaded
#[command]
pub fn voice_is_model_downloaded(state: State<'_, VoiceState>, model: String) -> bool {
    let size = match model.to_lowercase().as_str() {
        "tiny" => ModelSize::Tiny,
        "base" => ModelSize::Base,
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        _ => return false,
    };

    state.model_manager.is_model_downloaded(size)
}

// ============================================================================
// Configuration Commands
// ============================================================================

/// Get current voice configuration
#[command]
pub fn voice_get_config(state: State<'_, VoiceState>) -> VoiceConfig {
    state.config.lock().clone()
}

/// Set voice configuration
#[command]
pub fn voice_set_config(state: State<'_, VoiceState>, config: VoiceConfig) -> Result<(), String> {
    tracing::info!("voice_set_config called: {:?}", config);
    *state.config.lock() = config;
    Ok(())
}

/// Enable or disable voice input
#[command]
pub fn voice_set_enabled(state: State<'_, VoiceState>, enabled: bool) -> Result<(), String> {
    tracing::info!("voice_set_enabled called: {}", enabled);
    state.config.lock().enabled = enabled;
    Ok(())
}

/// Set voice input mode
#[command]
pub fn voice_set_mode(state: State<'_, VoiceState>, mode: String) -> Result<(), String> {
    let voice_mode = match mode.to_lowercase().as_str() {
        "push-to-talk" | "pushtotalk" => VoiceMode::PushToTalk,
        "toggle" => VoiceMode::Toggle,
        _ => return Err(format!("Unknown mode: {}", mode)),
    };

    tracing::info!("voice_set_mode called: {:?}", voice_mode);
    state.config.lock().mode = voice_mode;
    Ok(())
}

/// Set transcription language
#[command]
pub fn voice_set_language(state: State<'_, VoiceState>, language: String) -> Result<(), String> {
    tracing::info!("voice_set_language called: {}", language);
    state.config.lock().language = language;
    Ok(())
}

/// Set push-to-talk keybinding
#[command]
pub fn voice_set_push_to_talk_key(state: State<'_, VoiceState>, key: String) -> Result<(), String> {
    tracing::info!("voice_set_push_to_talk_key called: {}", key);
    state.config.lock().push_to_talk_key = key;
    Ok(())
}

// ============================================================================
// Audio Device Commands
// ============================================================================

/// List available audio input devices
#[command]
pub fn voice_list_input_devices() -> Result<Vec<String>, String> {
    recorder::list_input_devices().map_err(|e| e.to_string())
}

/// Get the default audio input device name
#[command]
pub fn voice_get_default_input_device() -> Result<String, String> {
    recorder::get_default_input_device_name().map_err(|e| e.to_string())
}

// ============================================================================
// Wake Word Commands
// ============================================================================

/// Check if wake word feature models are downloaded
#[command]
pub fn wakeword_are_models_downloaded(state: State<'_, VoiceState>) -> bool {
    state.wakeword.lock().are_feature_models_downloaded()
}

/// Download wake word feature models (melspectrogram + embedding)
#[command]
pub async fn wakeword_download_feature_models(
    app: AppHandle,
    state: State<'_, VoiceState>,
) -> Result<(), String> {
    tracing::info!("wakeword_download_feature_models called");

    // Get the models directory while holding the lock briefly
    let models_dir = state.wakeword.lock().models_dir().clone();

    // Download melspectrogram model
    let melspec_url = crate::voice::wakeword::model_urls::MELSPECTROGRAM;
    let melspec_path = models_dir.join("melspectrogram.onnx");
    download_wakeword_model(melspec_url, &melspec_path).await?;

    // Download embedding model
    let embedding_url = crate::voice::wakeword::model_urls::EMBEDDING;
    let embedding_path = models_dir.join("embedding_model.onnx");
    download_wakeword_model(embedding_url, &embedding_path).await?;

    let _ = app.emit("wakeword:feature_models_downloaded", ());

    Ok(())
}

/// Helper function to download a wakeword model
async fn download_wakeword_model(url: &str, path: &std::path::PathBuf) -> Result<(), String> {
    use std::io::Write;

    // Create parent directory if needed
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    tracing::info!("Downloading model from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    tracing::info!("Model saved to {:?}", path);

    Ok(())
}

/// Initialize the wake word processor
#[command]
pub fn wakeword_init_processor(state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("wakeword_init_processor called");
    state
        .wakeword
        .lock()
        .init_processor()
        .map_err(|e| e.to_string())
}

/// Check if the wake word processor is initialized
#[command]
pub fn wakeword_is_initialized(state: State<'_, VoiceState>) -> bool {
    state.wakeword.lock().is_initialized()
}

/// List available wake word models (builtin and custom)
#[command]
pub fn wakeword_list_models(state: State<'_, VoiceState>) -> Vec<WakewordInfo> {
    state.wakeword.lock().list_available_models()
}

/// Download a built-in wake word model
#[command]
pub async fn wakeword_download_builtin(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model_id: String,
) -> Result<String, String> {
    tracing::info!("wakeword_download_builtin called for: {}", model_id);

    let builtin = match model_id.as_str() {
        "alexa" => BuiltinWakeword::Alexa,
        "hey_jarvis" => BuiltinWakeword::HeyJarvis,
        "hey_mycroft" => BuiltinWakeword::HeyMycroft,
        _ => return Err(format!("Unknown builtin model: {}", model_id)),
    };

    // Get the models directory while holding the lock briefly
    let models_dir = state.wakeword.lock().models_dir().clone();

    // Construct path and download
    let filename = format!("{}_v0.1.onnx", builtin.name());
    let path = models_dir.join(&filename);

    download_wakeword_model(builtin.url(), &path).await?;

    let _ = app.emit("wakeword:model_downloaded", &model_id);

    Ok(path.to_string_lossy().to_string())
}

/// Load a wake word model
#[command]
pub fn wakeword_load_model(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model_id: String,
) -> Result<(), String> {
    tracing::info!("wakeword_load_model called for: {}", model_id);

    // Try as builtin first
    let result = match model_id.as_str() {
        "alexa" => state.wakeword.lock().load_builtin(BuiltinWakeword::Alexa),
        "hey_jarvis" => state
            .wakeword
            .lock()
            .load_builtin(BuiltinWakeword::HeyJarvis),
        "hey_mycroft" => state
            .wakeword
            .lock()
            .load_builtin(BuiltinWakeword::HeyMycroft),
        _ => {
            // Try as custom model path
            let path = std::path::PathBuf::from(&model_id);
            state.wakeword.lock().load_wakeword(&model_id, &path)
        }
    };

    result.map_err(|e| e.to_string())?;

    let _ = app.emit("wakeword:model_loaded", &model_id);

    Ok(())
}

/// Unload a wake word model
#[command]
pub fn wakeword_unload_model(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model_id: String,
) -> Result<(), String> {
    tracing::info!("wakeword_unload_model called for: {}", model_id);

    state
        .wakeword
        .lock()
        .unload_wakeword(&model_id)
        .map_err(|e| e.to_string())?;

    let _ = app.emit("wakeword:model_unloaded", &model_id);

    Ok(())
}

/// Get list of currently loaded wake word models
#[command]
pub fn wakeword_get_loaded_models(state: State<'_, VoiceState>) -> Vec<String> {
    state.wakeword.lock().get_loaded_models()
}

/// Get wake word configuration
#[command]
pub fn wakeword_get_config(state: State<'_, VoiceState>) -> WakewordConfig {
    state.wakeword.lock().get_config()
}

/// Set wake word configuration
#[command]
pub fn wakeword_set_config(
    state: State<'_, VoiceState>,
    config: WakewordConfig,
) -> Result<(), String> {
    tracing::info!("wakeword_set_config called: {:?}", config);
    state.wakeword.lock().set_config(config);
    Ok(())
}

/// Check if wake word listening is active
#[command]
pub fn wakeword_is_listening(state: State<'_, VoiceState>) -> bool {
    state.wakeword.lock().is_listening()
}

/// Start wake word listening (continuous monitoring)
///
/// This starts a background thread that continuously monitors audio
/// and emits "wakeword:detected" events when a wake word is detected.
#[command]
pub fn wakeword_start_listening(
    app: AppHandle,
    state: State<'_, VoiceState>,
) -> Result<(), String> {
    tracing::info!("wakeword_start_listening called");

    // Clone what we need for the callback
    let app_for_callback = app.clone();
    let wakeword_service = state.wakeword.clone();

    // Start continuous listening with detection callback
    let handle =
        crate::voice::wakeword::start_wakeword_listening(wakeword_service, move |detection| {
            tracing::info!("Emitting wakeword:detected event for '{}'", detection.name);
            let _ = app_for_callback.emit("wakeword:detected", &detection);
        })
        .map_err(|e| e.to_string())?;

    // Store the handle
    *state.wakeword_handle.lock() = Some(handle);

    let _ = app.emit("wakeword:listening_started", ());

    Ok(())
}

/// Stop wake word listening
#[command]
pub fn wakeword_stop_listening(app: AppHandle, state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("wakeword_stop_listening called");

    state.wakeword.lock().set_listening(false);

    // Wait for listener thread to finish
    if let Some(handle) = state.wakeword_handle.lock().take() {
        let _ = handle.join();
    }

    let _ = app.emit("wakeword:listening_stopped", ());

    Ok(())
}

/// Reset the wake word processor buffers
#[command]
pub fn wakeword_reset(state: State<'_, VoiceState>) -> Result<(), String> {
    tracing::info!("wakeword_reset called");
    state.wakeword.lock().reset();
    Ok(())
}
