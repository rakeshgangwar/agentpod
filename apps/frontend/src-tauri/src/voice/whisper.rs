//! Whisper speech-to-text service
//!
//! Provides local transcription using whisper-rs (whisper.cpp bindings).

use std::path::PathBuf;
use std::sync::Arc;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::VoiceError;

/// Options for transcription
#[derive(Debug, Clone)]
pub struct TranscribeOptions {
    /// Language code (e.g., "en", "auto" for detection)
    pub language: Option<String>,
    /// Whether to translate to English
    pub translate: bool,
    /// Number of threads to use (None = auto)
    pub n_threads: Option<i32>,
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self {
            language: Some("en".to_string()),
            translate: false,
            n_threads: None,
        }
    }
}

/// A segment of transcribed text with timing information
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    /// Start time in centiseconds (1/100th of a second)
    pub start: i64,
    /// End time in centiseconds
    pub end: i64,
    /// Transcribed text
    pub text: String,
}

impl TranscriptSegment {
    /// Get start time in seconds
    pub fn start_seconds(&self) -> f64 {
        self.start as f64 / 100.0
    }

    /// Get end time in seconds
    pub fn end_seconds(&self) -> f64 {
        self.end as f64 / 100.0
    }
}

/// Transcription result
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResult {
    /// Full transcribed text
    pub text: String,
    /// Individual segments with timing
    pub segments: Vec<TranscriptSegment>,
    /// Detected language (if auto-detection was used)
    pub detected_language: Option<String>,
}

/// Whisper speech-to-text service
pub struct WhisperService {
    /// The loaded Whisper context
    context: Option<WhisperContext>,
    /// Path to the loaded model
    model_path: Option<PathBuf>,
}

impl WhisperService {
    /// Create a new WhisperService (model not loaded)
    pub fn new() -> Self {
        Self {
            context: None,
            model_path: None,
        }
    }

    /// Load a Whisper model from the given path
    pub fn load_model(&mut self, model_path: PathBuf) -> Result<(), VoiceError> {
        tracing::info!("Loading Whisper model from: {:?}", model_path);

        if !model_path.exists() {
            return Err(VoiceError::WhisperModel(format!(
                "Model file not found: {:?}",
                model_path
            )));
        }

        // Create context parameters
        let params = WhisperContextParameters::default();

        tracing::debug!("Creating Whisper context");

        let model_path_str = model_path
            .to_str()
            .ok_or_else(|| VoiceError::WhisperModel("Invalid model path".to_string()))?;

        let context = WhisperContext::new_with_params(model_path_str, params)
            .map_err(|e| VoiceError::WhisperModel(format!("Failed to load model: {:?}", e)))?;

        self.context = Some(context);
        self.model_path = Some(model_path);

        tracing::info!("Whisper model loaded successfully");
        Ok(())
    }

    /// Unload the current model
    pub fn unload_model(&mut self) {
        if self.context.is_some() {
            tracing::info!("Unloading Whisper model");
            self.context = None;
            self.model_path = None;
        }
    }

    /// Check if a model is loaded
    pub fn is_loaded(&self) -> bool {
        self.context.is_some()
    }

    /// Get the path to the loaded model
    pub fn model_path(&self) -> Option<&PathBuf> {
        self.model_path.as_ref()
    }

    /// Transcribe audio samples
    ///
    /// # Arguments
    /// * `audio` - Audio samples as f32, mono, 16kHz
    /// * `options` - Transcription options
    /// * `progress_callback` - Optional callback for progress updates (0-100)
    pub fn transcribe(
        &self,
        audio: &[f32],
        options: TranscribeOptions,
        progress_callback: Option<Arc<dyn Fn(i32) + Send + Sync>>,
    ) -> Result<TranscriptionResult, VoiceError> {
        let context = self.context.as_ref().ok_or(VoiceError::ModelNotLoaded)?;

        let duration_secs = audio.len() as f32 / 16000.0;
        tracing::info!(
            "Starting transcription of {:.2}s audio ({} samples)",
            duration_secs,
            audio.len()
        );

        // Create transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Set language
        if let Some(ref lang) = options.language {
            if lang != "auto" {
                params.set_language(Some(lang.as_str()));
            }
        }

        // Set translate flag
        if options.translate {
            params.set_translate(true);
        }

        // Set thread count
        if let Some(n_threads) = options.n_threads {
            params.set_n_threads(n_threads);
        }

        // Configure output options
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);
        params.set_token_timestamps(true);
        
        // Lower the no_speech threshold to be less aggressive about detecting silence
        params.set_no_speech_thold(0.6);

        // Set progress callback if provided
        if let Some(callback) = progress_callback {
            params.set_progress_callback_safe(move |progress| {
                callback(progress);
            });
        }

        // Create state and run transcription
        let mut state = context
            .create_state()
            .map_err(|e| VoiceError::Transcription(format!("Failed to create state: {:?}", e)))?;

        state
            .full(params, audio)
            .map_err(|e| VoiceError::Transcription(format!("Transcription failed: {:?}", e)))?;

        // Extract segments using the new API
        let num_segments = state.full_n_segments();

        tracing::debug!("Transcription produced {} segments", num_segments);

        let mut segments = Vec::with_capacity(num_segments as usize);
        let mut full_text = String::new();

        for i in 0..num_segments {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(text) = segment.to_str_lossy() {
                    let text_str = text.to_string();
                    let start = segment.start_timestamp();
                    let end = segment.end_timestamp();

                    // Filter out blank/silence tokens and other special tokens
                    let trimmed = text_str.trim();
                    if !trimmed.is_empty() 
                        && !trimmed.contains("[BLANK_AUDIO]")
                        && !trimmed.contains("[SILENCE]")
                        && !trimmed.starts_with('[')  // Filter any special tokens
                    {
                        full_text.push_str(&text_str);
                        segments.push(TranscriptSegment {
                            start,
                            end,
                            text: text_str,
                        });
                    }
                }
            }
        }

        // Trim the full text
        let text = full_text.trim().to_string();

        tracing::info!("Transcription complete: \"{}\"", text);

        Ok(TranscriptionResult {
            text,
            segments,
            detected_language: None, // TODO: Extract detected language if auto-detection was used
        })
    }
}

impl Default for WhisperService {
    fn default() -> Self {
        Self::new()
    }
}

// WhisperService contains WhisperContext which may not be Send by default
// We need to ensure it's used correctly across threads
unsafe impl Send for WhisperService {}
