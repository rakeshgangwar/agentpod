//! Wake word detection using OpenWakeWord (ONNX models)
//!
//! Provides continuous audio monitoring for wake word detection.
//! When a wake word is detected, it triggers the voice recording flow.
//!
//! OpenWakeWord uses a three-stage pipeline:
//! 1. Melspectrogram model - converts audio to mel spectrograms
//! 2. Embedding model - converts mel spectrograms to speech embeddings (Google's speech_embedding)
//! 3. Wakeword model - classifies embeddings to detect wake words
//!
//! Reference: https://github.com/dscripka/openWakeWord

use ort::{session::Session, value::Tensor};
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::VoiceError;

/// Sample rate for wake word detection (OpenWakeWord works at 16kHz)
pub const WAKEWORD_SAMPLE_RATE: u32 = 16000;

/// Default detection threshold (0.0 - 1.0)
/// Lower threshold = more sensitive (may have false positives)
/// Higher threshold = more strict (may miss detections)
pub const DEFAULT_THRESHOLD: f32 = 0.4;

/// Frame size in samples (80ms at 16kHz)
pub const FRAME_SIZE_SAMPLES: usize = 1280;

/// Melspectrogram bins
const MELSPEC_BINS: usize = 32;

/// Embedding model input frames
const EMBEDDING_INPUT_FRAMES: usize = 76;

/// Embedding dimension
const EMBEDDING_DIM: usize = 96;

/// Feature buffer size (for storing embeddings history)
const FEATURE_BUFFER_SIZE: usize = 120;

/// URLs for downloading OpenWakeWord models
pub mod model_urls {
    pub const MELSPECTROGRAM: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx";
    pub const EMBEDDING: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx";
    pub const SILERO_VAD: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/silero_vad.onnx";
    // Pre-trained wakeword models
    pub const ALEXA: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/alexa_v0.1.onnx";
    pub const HEY_JARVIS: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx";
    pub const HEY_MYCROFT: &str =
        "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_mycroft_v0.1.onnx";
}

/// Wake word detection event
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WakewordDetection {
    /// Name of the detected wake word
    pub name: String,
    /// Detection score (0.0 - 1.0)
    pub score: f32,
    /// Timestamp of detection (ms since epoch)
    pub timestamp: u64,
}

/// Wake word service configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakewordConfig {
    /// Detection threshold (0.0 - 1.0, higher = more strict)
    pub threshold: f32,
    /// Enable Voice Activity Detection pre-filter
    pub vad_enabled: bool,
    /// VAD threshold (0.0 - 1.0)
    pub vad_threshold: f32,
}

impl Default for WakewordConfig {
    fn default() -> Self {
        Self {
            threshold: DEFAULT_THRESHOLD,
            vad_enabled: false,
            vad_threshold: 0.5,
        }
    }
}

/// Wake word file information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakewordInfo {
    /// Wake word name/phrase
    pub name: String,
    /// Model ID for internal use
    pub model_id: String,
    /// File path (if custom model)
    pub path: Option<String>,
    /// Whether it's a built-in or custom model
    pub is_builtin: bool,
    /// Whether it's currently loaded
    pub is_loaded: bool,
}

/// Available built-in wake word models
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuiltinWakeword {
    Alexa,
    HeyJarvis,
    HeyMycroft,
}

impl BuiltinWakeword {
    pub fn name(&self) -> &'static str {
        match self {
            BuiltinWakeword::Alexa => "alexa",
            BuiltinWakeword::HeyJarvis => "hey_jarvis",
            BuiltinWakeword::HeyMycroft => "hey_mycroft",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            BuiltinWakeword::Alexa => "Alexa",
            BuiltinWakeword::HeyJarvis => "Hey Jarvis",
            BuiltinWakeword::HeyMycroft => "Hey Mycroft",
        }
    }

    pub fn url(&self) -> &'static str {
        match self {
            BuiltinWakeword::Alexa => model_urls::ALEXA,
            BuiltinWakeword::HeyJarvis => model_urls::HEY_JARVIS,
            BuiltinWakeword::HeyMycroft => model_urls::HEY_MYCROFT,
        }
    }

    pub fn all() -> &'static [BuiltinWakeword] {
        &[
            BuiltinWakeword::Alexa,
            BuiltinWakeword::HeyJarvis,
            BuiltinWakeword::HeyMycroft,
        ]
    }
}

/// Loaded wakeword model
struct LoadedWakewordModel {
    name: String,
    session: Session,
    input_frames: usize,
}

/// Audio feature processor using OpenWakeWord's pipeline
struct AudioFeatureProcessor {
    /// Melspectrogram ONNX model
    melspec_session: Session,
    /// Embedding ONNX model
    embedding_session: Session,
    /// Raw audio buffer
    raw_buffer: VecDeque<i16>,
    /// Melspectrogram buffer
    melspec_buffer: Vec<f32>,
    /// Feature/embedding buffer
    feature_buffer: Vec<f32>,
    /// Accumulated samples counter
    accumulated_samples: usize,
}

impl AudioFeatureProcessor {
    /// Create a new audio feature processor
    fn new(melspec_path: &PathBuf, embedding_path: &PathBuf) -> Result<Self, VoiceError> {
        let melspec_session = Session::builder()
            .map_err(|e| VoiceError::Config(format!("Failed to create session builder: {}", e)))?
            .with_intra_threads(1)
            .map_err(|e| VoiceError::Config(format!("Failed to set intra threads: {}", e)))?
            .commit_from_file(melspec_path)
            .map_err(|e| VoiceError::Config(format!("Failed to load melspec model: {}", e)))?;

        let embedding_session = Session::builder()
            .map_err(|e| VoiceError::Config(format!("Failed to create session builder: {}", e)))?
            .with_intra_threads(1)
            .map_err(|e| VoiceError::Config(format!("Failed to set intra threads: {}", e)))?
            .commit_from_file(embedding_path)
            .map_err(|e| VoiceError::Config(format!("Failed to load embedding model: {}", e)))?;

        Ok(Self {
            melspec_session,
            embedding_session,
            raw_buffer: VecDeque::with_capacity(WAKEWORD_SAMPLE_RATE as usize * 10),
            melspec_buffer: vec![1.0; EMBEDDING_INPUT_FRAMES * MELSPEC_BINS],
            feature_buffer: Vec::with_capacity(FEATURE_BUFFER_SIZE * EMBEDDING_DIM),
            accumulated_samples: 0,
        })
    }

    /// Process audio samples and update internal buffers
    /// Returns the number of new embedding frames generated
    fn process(&mut self, samples: &[i16]) -> Result<usize, VoiceError> {
        // Add samples to raw buffer
        for &s in samples {
            self.raw_buffer.push_back(s);
        }

        // Keep raw buffer bounded
        while self.raw_buffer.len() > WAKEWORD_SAMPLE_RATE as usize * 10 {
            self.raw_buffer.pop_front();
        }

        self.accumulated_samples += samples.len();

        // Only process when we have enough samples (80ms = 1280 samples)
        if self.accumulated_samples < FRAME_SIZE_SAMPLES {
            return Ok(0);
        }

        let frames_to_process = self.accumulated_samples / FRAME_SIZE_SAMPLES;
        let mut new_embeddings = 0;

        for _ in 0..frames_to_process {
            // Get audio for melspectrogram (need extra context)
            let total_samples = FRAME_SIZE_SAMPLES + 160 * 3; // Extra context for melspec
            if self.raw_buffer.len() < total_samples {
                break;
            }

            // Extract samples from buffer
            let start_idx = self.raw_buffer.len() - total_samples;
            let audio_samples: Vec<f32> = self
                .raw_buffer
                .iter()
                .skip(start_idx)
                .take(total_samples)
                .map(|&s| s as f32)
                .collect();

            // Compute melspectrogram
            let melspec = self.compute_melspectrogram(&audio_samples)?;

            // Update melspec buffer (sliding window)
            let melspec_len = melspec.len();
            if melspec_len > 0 {
                // Shift buffer and append new frames
                let new_frames = melspec_len / MELSPEC_BINS;
                let shift = new_frames * MELSPEC_BINS;

                if shift < self.melspec_buffer.len() {
                    self.melspec_buffer.drain(0..shift);
                    self.melspec_buffer.extend(melspec);
                }
            }

            // Compute embedding if we have enough melspec frames
            if self.melspec_buffer.len() >= EMBEDDING_INPUT_FRAMES * MELSPEC_BINS {
                let embedding = self.compute_embedding()?;

                // Add to feature buffer
                self.feature_buffer.extend(embedding);
                new_embeddings += 1;

                // Keep feature buffer bounded
                while self.feature_buffer.len() > FEATURE_BUFFER_SIZE * EMBEDDING_DIM {
                    self.feature_buffer.drain(0..EMBEDDING_DIM);
                }
            }
        }

        self.accumulated_samples %= FRAME_SIZE_SAMPLES;

        Ok(new_embeddings)
    }

    /// Compute melspectrogram from audio samples
    fn compute_melspectrogram(&mut self, audio: &[f32]) -> Result<Vec<f32>, VoiceError> {
        let input_tensor = Tensor::from_array(([1, audio.len()], audio.to_vec()))
            .map_err(|e| VoiceError::Transcription(format!("Tensor error: {}", e)))?;

        let outputs = self
            .melspec_session
            .run(ort::inputs!["input" => input_tensor])
            .map_err(|e| VoiceError::Transcription(format!("Melspec inference error: {}", e)))?;

        let output = outputs
            .get("output")
            .ok_or_else(|| VoiceError::Transcription("Missing melspec output".to_string()))?;

        let tensor_data = output
            .try_extract_array::<f32>()
            .map_err(|e| VoiceError::Transcription(format!("Extract error: {}", e)))?;

        // Apply transform: x/10 + 2 (matches Python implementation)
        let transformed: Vec<f32> = tensor_data.iter().map(|&x| x / 10.0 + 2.0).collect();

        Ok(transformed)
    }

    /// Compute embedding from melspectrogram buffer
    fn compute_embedding(&mut self) -> Result<Vec<f32>, VoiceError> {
        // Get the last 76 frames from melspec buffer
        let start = self.melspec_buffer.len() - (EMBEDDING_INPUT_FRAMES * MELSPEC_BINS);
        let melspec_window: Vec<f32> = self.melspec_buffer[start..].to_vec();

        // Reshape to (1, 76, 32, 1)
        let input_tensor =
            Tensor::from_array(([1, EMBEDDING_INPUT_FRAMES, MELSPEC_BINS, 1], melspec_window))
                .map_err(|e| VoiceError::Transcription(format!("Tensor error: {}", e)))?;

        let outputs = self
            .embedding_session
            .run(ort::inputs!["input_1" => input_tensor])
            .map_err(|e| VoiceError::Transcription(format!("Embedding inference error: {}", e)))?;

        // Get first output
        let output = outputs
            .iter()
            .next()
            .ok_or_else(|| VoiceError::Transcription("No embedding output".to_string()))?;

        let tensor_data = output
            .1
            .try_extract_array::<f32>()
            .map_err(|e| VoiceError::Transcription(format!("Extract error: {}", e)))?;

        Ok(tensor_data.iter().cloned().collect())
    }

    /// Get features for wakeword model (last n_frames of embeddings)
    fn get_features(&self, n_frames: usize) -> Option<Vec<f32>> {
        let required = n_frames * EMBEDDING_DIM;
        if self.feature_buffer.len() < required {
            return None;
        }

        let start = self.feature_buffer.len() - required;
        Some(self.feature_buffer[start..].to_vec())
    }

    /// Reset all buffers
    fn reset(&mut self) {
        self.raw_buffer.clear();
        self.melspec_buffer = vec![1.0; EMBEDDING_INPUT_FRAMES * MELSPEC_BINS];
        self.feature_buffer.clear();
        self.accumulated_samples = 0;
    }
}

/// Wake word service for continuous audio monitoring
pub struct WakewordService {
    /// Audio feature processor
    processor: Option<AudioFeatureProcessor>,
    /// Loaded wakeword models
    models: Vec<LoadedWakewordModel>,
    /// Configuration
    config: WakewordConfig,
    /// Directory for storing wake word files
    models_dir: PathBuf,
    /// Whether listening is active
    is_listening: Arc<AtomicBool>,
    /// Prediction buffer for each model (for smoothing)
    prediction_buffers: Vec<VecDeque<f32>>,
}

impl WakewordService {
    /// Create a new wake word service
    pub fn new() -> Self {
        let models_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("agentpod")
            .join("wakeword_models");

        // Create directory if it doesn't exist
        let _ = std::fs::create_dir_all(&models_dir);

        Self {
            processor: None,
            models: Vec::new(),
            config: WakewordConfig::default(),
            models_dir,
            is_listening: Arc::new(AtomicBool::new(false)),
            prediction_buffers: Vec::new(),
        }
    }

    /// Get the models directory path
    pub fn models_dir(&self) -> &PathBuf {
        &self.models_dir
    }

    /// Initialize the audio feature processor
    pub fn init_processor(&mut self) -> Result<(), VoiceError> {
        let melspec_path = self.models_dir.join("melspectrogram.onnx");
        let embedding_path = self.models_dir.join("embedding_model.onnx");

        if !melspec_path.exists() || !embedding_path.exists() {
            return Err(VoiceError::Config(
                "Feature models not downloaded. Call download_feature_models() first.".to_string(),
            ));
        }

        let processor = AudioFeatureProcessor::new(&melspec_path, &embedding_path)?;
        self.processor = Some(processor);

        tracing::info!("OpenWakeWord audio processor initialized");

        Ok(())
    }

    /// Check if feature models are downloaded
    pub fn are_feature_models_downloaded(&self) -> bool {
        let melspec_path = self.models_dir.join("melspectrogram.onnx");
        let embedding_path = self.models_dir.join("embedding_model.onnx");
        melspec_path.exists() && embedding_path.exists()
    }

    /// Download feature models (melspectrogram + embedding)
    pub async fn download_feature_models(&self) -> Result<(), VoiceError> {
        download_model(
            model_urls::MELSPECTROGRAM,
            &self.models_dir.join("melspectrogram.onnx"),
        )
        .await?;
        download_model(
            model_urls::EMBEDDING,
            &self.models_dir.join("embedding_model.onnx"),
        )
        .await?;
        tracing::info!("Feature models downloaded successfully");
        Ok(())
    }

    /// Download a built-in wakeword model
    pub async fn download_builtin_model(
        &self,
        model: BuiltinWakeword,
    ) -> Result<PathBuf, VoiceError> {
        let filename = format!("{}_v0.1.onnx", model.name());
        let path = self.models_dir.join(&filename);
        download_model(model.url(), &path).await?;
        tracing::info!("Downloaded {} model", model.display_name());
        Ok(path)
    }

    /// Load a wakeword model
    pub fn load_wakeword(&mut self, name: &str, path: &PathBuf) -> Result<(), VoiceError> {
        if self.processor.is_none() {
            return Err(VoiceError::Config("Processor not initialized".to_string()));
        }

        let session = Session::builder()
            .map_err(|e| VoiceError::Config(format!("Failed to create session builder: {}", e)))?
            .with_intra_threads(1)
            .map_err(|e| VoiceError::Config(format!("Failed to set intra threads: {}", e)))?
            .commit_from_file(path)
            .map_err(|e| VoiceError::Config(format!("Failed to load wakeword model: {}", e)))?;

        // Determine input frames from model input shape
        // Input shape is typically [1, n_frames, embedding_dim]
        let mut input_frames = 16; // Default to 16 frames

        // Try to get actual input shape from model
        if let Some(input) = session.inputs.first() {
            tracing::info!(
                "Wakeword model '{}' input: name='{}', type={:?}",
                name,
                input.name,
                input.input_type
            );

            // Extract dimensions from tensor type
            if let ort::value::ValueType::Tensor { shape, .. } = &input.input_type {
                tracing::info!("Wakeword model '{}' input shape: {:?}", name, shape);
                // If shape is [1, n_frames, 96], extract n_frames
                if shape.len() >= 2 {
                    let n = shape[1];
                    if n > 0 && n < 1000 {
                        input_frames = n as usize;
                    }
                }
            }
        }

        // Log outputs too
        for (i, output) in session.outputs.iter().enumerate() {
            tracing::info!(
                "Wakeword model '{}' output[{}]: name='{}', type={:?}",
                name,
                i,
                output.name,
                output.output_type
            );
        }

        self.models.push(LoadedWakewordModel {
            name: name.to_string(),
            session,
            input_frames,
        });

        self.prediction_buffers.push(VecDeque::with_capacity(30));

        tracing::info!(
            "Loaded wakeword model '{}' (input_frames={})",
            name,
            input_frames
        );

        Ok(())
    }

    /// Load a built-in wakeword model
    pub fn load_builtin(&mut self, model: BuiltinWakeword) -> Result<(), VoiceError> {
        let filename = format!("{}_v0.1.onnx", model.name());
        let path = self.models_dir.join(&filename);

        if !path.exists() {
            return Err(VoiceError::Config(format!(
                "Model '{}' not downloaded. Call download_builtin_model() first.",
                model.display_name()
            )));
        }

        self.load_wakeword(model.name(), &path)
    }

    /// Unload a wakeword model
    pub fn unload_wakeword(&mut self, name: &str) -> Result<(), VoiceError> {
        if let Some(idx) = self.models.iter().position(|m| m.name == name) {
            self.models.remove(idx);
            self.prediction_buffers.remove(idx);
            tracing::info!("Unloaded wakeword model '{}'", name);
        }
        Ok(())
    }

    /// Process audio samples and check for wake word detection
    ///
    /// Takes i16 samples at 16kHz mono.
    /// Returns Some(WakewordDetection) if a wake word was detected.
    pub fn process_samples(&mut self, samples: &[i16]) -> Option<WakewordDetection> {
        let processor = self.processor.as_mut()?;

        // Update features
        let new_embeddings = match processor.process(samples) {
            Ok(n) => n,
            Err(e) => {
                tracing::error!("Error processing audio samples: {}", e);
                return None;
            }
        };

        if new_embeddings == 0 || self.models.is_empty() {
            return None;
        }

        // Log periodically to confirm processing is happening
        static PROCESS_COUNT: std::sync::atomic::AtomicUsize =
            std::sync::atomic::AtomicUsize::new(0);
        let count = PROCESS_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if count % 50 == 0 {
            tracing::debug!(
                "Processing wakeword (count={}, new_embeddings={}, feature_buffer_len={})",
                count,
                new_embeddings,
                processor.feature_buffer.len() / EMBEDDING_DIM
            );
        }

        // Run each wakeword model
        for (idx, model) in self.models.iter_mut().enumerate() {
            let features = match processor.get_features(model.input_frames) {
                Some(f) => f,
                None => {
                    if count % 50 == 0 {
                        tracing::debug!(
                            "Not enough features yet for model '{}' (need {} frames)",
                            model.name,
                            model.input_frames
                        );
                    }
                    continue;
                }
            };

            // Create input tensor with shape [1, n_frames, embedding_dim]
            let input_tensor =
                match Tensor::from_array(([1, model.input_frames, EMBEDDING_DIM], features)) {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::error!("Failed to create input tensor: {}", e);
                        continue;
                    }
                };

            // Get input name (clone to avoid borrow conflict)
            let input_name: String = model
                .session
                .inputs
                .first()
                .map(|i| i.name.clone())
                .unwrap_or_else(|| "input".to_string());

            let outputs = match model
                .session
                .run(ort::inputs![input_name.as_str() => input_tensor])
            {
                Ok(o) => o,
                Err(e) => {
                    tracing::error!("Failed to run wakeword model '{}': {}", model.name, e);
                    continue;
                }
            };

            // Get prediction
            let output = match outputs.iter().next() {
                Some(o) => o,
                None => {
                    tracing::error!("No output from wakeword model '{}'", model.name);
                    continue;
                }
            };

            let tensor_data = match output.1.try_extract_array::<f32>() {
                Ok(t) => t,
                Err(e) => {
                    tracing::error!("Failed to extract tensor data from '{}': {}", model.name, e);
                    continue;
                }
            };

            let score = tensor_data.iter().cloned().next().unwrap_or(0.0);

            // Log score periodically for debugging
            if count % 25 == 0 {
                tracing::debug!(
                    "Wakeword '{}' score: {:.4} (threshold: {:.2})",
                    model.name,
                    score,
                    self.config.threshold
                );
            }

            // Update prediction buffer
            if let Some(buffer) = self.prediction_buffers.get_mut(idx) {
                buffer.push_back(score);
                while buffer.len() > 30 {
                    buffer.pop_front();
                }

                // Skip first 5 frames (initialization)
                if buffer.len() < 5 {
                    continue;
                }
            }

            // Check threshold
            if score >= self.config.threshold {
                return Some(WakewordDetection {
                    name: model.name.clone(),
                    score,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0),
                });
            }
        }

        None
    }

    /// Get the number of samples required per frame
    pub fn get_samples_per_frame(&self) -> usize {
        FRAME_SIZE_SAMPLES
    }

    /// Check if listening is active
    pub fn is_listening(&self) -> bool {
        self.is_listening.load(Ordering::Relaxed)
    }

    /// Set listening state
    pub fn set_listening(&self, listening: bool) {
        self.is_listening.store(listening, Ordering::Relaxed);
    }

    /// Get listening flag for sharing with threads
    pub fn get_listening_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.is_listening)
    }

    /// Get current configuration
    pub fn get_config(&self) -> WakewordConfig {
        self.config.clone()
    }

    /// Update configuration
    pub fn set_config(&mut self, config: WakewordConfig) {
        self.config = config;
    }

    /// List available wakeword models (both builtin and custom)
    pub fn list_available_models(&self) -> Vec<WakewordInfo> {
        let mut models = Vec::new();

        // Add builtins
        for builtin in BuiltinWakeword::all() {
            let filename = format!("{}_v0.1.onnx", builtin.name());
            let path = self.models_dir.join(&filename);
            let is_downloaded = path.exists();
            let is_loaded = self.models.iter().any(|m| m.name == builtin.name());

            models.push(WakewordInfo {
                name: builtin.display_name().to_string(),
                model_id: builtin.name().to_string(),
                path: if is_downloaded {
                    Some(path.to_string_lossy().to_string())
                } else {
                    None
                },
                is_builtin: true,
                is_loaded,
            });
        }

        // Add custom models
        if let Ok(entries) = std::fs::read_dir(&self.models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "onnx" {
                        let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

                        // Skip builtin models and feature models
                        if filename.contains("_v0.1")
                            || filename == "melspectrogram.onnx"
                            || filename == "embedding_model.onnx"
                            || filename == "silero_vad.onnx"
                        {
                            continue;
                        }

                        let name = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown")
                            .to_string();

                        let is_loaded = self.models.iter().any(|m| m.name == name);

                        models.push(WakewordInfo {
                            name: name.clone(),
                            model_id: name,
                            path: Some(path.to_string_lossy().to_string()),
                            is_builtin: false,
                            is_loaded,
                        });
                    }
                }
            }
        }

        models
    }

    /// Get list of currently loaded models
    pub fn get_loaded_models(&self) -> Vec<String> {
        self.models.iter().map(|m| m.name.clone()).collect()
    }

    /// Reset the processor buffers
    pub fn reset(&mut self) {
        if let Some(processor) = &mut self.processor {
            processor.reset();
        }
        for buffer in &mut self.prediction_buffers {
            buffer.clear();
        }
    }

    /// Check if the processor is initialized
    pub fn is_initialized(&self) -> bool {
        self.processor.is_some()
    }
}

impl Default for WakewordService {
    fn default() -> Self {
        Self::new()
    }
}

/// Download a model from URL
async fn download_model(url: &str, path: &PathBuf) -> Result<(), VoiceError> {
    use std::io::Write;

    // Create parent directory if needed
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    tracing::info!("Downloading model from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| VoiceError::ModelDownload(format!("HTTP request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(VoiceError::ModelDownload(format!(
            "HTTP error: {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| VoiceError::ModelDownload(format!("Failed to read response: {}", e)))?;

    let mut file = std::fs::File::create(path)?;
    file.write_all(&bytes)?;

    tracing::info!("Model saved to {:?}", path);

    Ok(())
}

/// State for wake word listening thread
pub struct WakewordListenerState {
    /// Service instance
    pub service: Arc<Mutex<WakewordService>>,
    /// Whether listening is active
    pub is_listening: Arc<AtomicBool>,
}

impl WakewordListenerState {
    pub fn new(service: Arc<Mutex<WakewordService>>) -> Self {
        let is_listening = service.lock().get_listening_flag();
        Self {
            service,
            is_listening,
        }
    }
}

// ============================================================================
// Continuous Wake Word Listening
// ============================================================================

/// Start continuous wake word listening
///
/// This spawns a background thread that continuously captures audio and
/// processes it through the wake word detection pipeline. When a wake word
/// is detected, the provided callback is called.
///
/// On Linux, uses parec for reliable PipeWire/PulseAudio capture.
/// On other platforms, uses cpal.
pub fn start_wakeword_listening<F>(
    wakeword_service: Arc<Mutex<WakewordService>>,
    on_detection: F,
) -> Result<std::thread::JoinHandle<()>, super::VoiceError>
where
    F: Fn(WakewordDetection) + Send + 'static,
{
    // Check if already listening
    if wakeword_service.lock().is_listening() {
        return Err(super::VoiceError::Recording(
            "Already listening for wake words".to_string(),
        ));
    }

    // Check if processor is initialized
    if !wakeword_service.lock().is_initialized() {
        return Err(super::VoiceError::Config(
            "Wake word processor not initialized".to_string(),
        ));
    }

    // Check if any models are loaded
    if wakeword_service.lock().get_loaded_models().is_empty() {
        return Err(super::VoiceError::Config(
            "No wake word models loaded".to_string(),
        ));
    }

    // Set listening state
    wakeword_service.lock().set_listening(true);

    tracing::info!("Starting continuous wake word listening");

    let service_clone = Arc::clone(&wakeword_service);

    // Spawn listening thread
    #[cfg(target_os = "linux")]
    let handle = std::thread::spawn(move || {
        if let Err(e) = linux_wakeword_listener::run_listening_loop(service_clone, on_detection) {
            tracing::error!("Wake word listening error: {}", e);
        }
    });

    #[cfg(not(target_os = "linux"))]
    let handle = std::thread::spawn(move || {
        if let Err(e) = cpal_wakeword_listener::run_listening_loop(service_clone, on_detection) {
            tracing::error!("Wake word listening error: {}", e);
        }
    });

    Ok(handle)
}

/// Stop wake word listening
pub fn stop_wakeword_listening(wakeword_service: &Arc<Mutex<WakewordService>>) {
    tracing::info!("Stopping wake word listening");
    wakeword_service.lock().set_listening(false);
}

// ============================================================================
// Linux Wake Word Listener (using parec)
// ============================================================================

#[cfg(target_os = "linux")]
mod linux_wakeword_listener {
    use super::*;
    use std::io::Read;
    use std::process::{Command, Stdio};

    /// Check if parec is available on the system
    fn is_parec_available() -> bool {
        Command::new("parec")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Run the wake word listening loop using parec
    pub fn run_listening_loop<F>(
        wakeword_service: Arc<Mutex<WakewordService>>,
        on_detection: F,
    ) -> Result<(), super::super::VoiceError>
    where
        F: Fn(WakewordDetection) + Send + 'static,
    {
        if !is_parec_available() {
            return Err(super::super::VoiceError::AudioDevice(
                "parec not found. Install pulseaudio-utils or pipewire-pulse.".to_string(),
            ));
        }

        // Audio format constants (parec default with --raw)
        const PAREC_SAMPLE_RATE: u32 = 44100;
        const PAREC_CHANNELS: u16 = 2;
        const WAKEWORD_SAMPLE_RATE: u32 = 16000;

        let mut child = Command::new("parec")
            .args(["--raw", "--latency-msec=100"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                super::super::VoiceError::AudioDevice(format!("Failed to start parec: {}", e))
            })?;

        let mut stdout = child.stdout.take().ok_or_else(|| {
            super::super::VoiceError::AudioDevice("Failed to get parec stdout".to_string())
        })?;

        tracing::info!(
            "Wake word listener started (parec s16le {}ch {}Hz)",
            PAREC_CHANNELS,
            PAREC_SAMPLE_RATE
        );

        // Buffer for reading audio data
        // s16le stereo = 4 bytes per frame
        // Read ~80ms worth of data at a time (matches frame size): 44100 * 0.08 * 4 = 14112 bytes
        let buffer_size = (PAREC_SAMPLE_RATE as usize * 80 / 1000) * 4;
        let mut buffer = vec![0u8; buffer_size];

        // Track last detection time to avoid rapid-fire detections
        let mut last_detection_time = std::time::Instant::now();
        let detection_cooldown = std::time::Duration::from_secs(2);

        while wakeword_service.lock().is_listening() {
            match stdout.read(&mut buffer) {
                Ok(0) => {
                    tracing::warn!("parec EOF - process may have exited");
                    break;
                }
                Ok(bytes_read) => {
                    // Convert s16le stereo bytes to i16 samples for wake word (expects i16)
                    let frame_count = bytes_read / 4;

                    // Convert to f32 first for resampling
                    let stereo_f32: Vec<f32> = (0..frame_count * 2)
                        .map(|i| {
                            let start = i * 2;
                            if start + 1 >= bytes_read {
                                return 0.0;
                            }
                            let bytes = [buffer[start], buffer[start + 1]];
                            let sample = i16::from_le_bytes(bytes);
                            sample as f32 / i16::MAX as f32
                        })
                        .collect();

                    // Convert stereo to mono
                    let mono_f32: Vec<f32> = stereo_f32
                        .chunks(2)
                        .map(|chunk| {
                            if chunk.len() == 2 {
                                (chunk[0] + chunk[1]) / 2.0
                            } else {
                                chunk[0]
                            }
                        })
                        .collect();

                    // Resample from 44100Hz to 16000Hz
                    let resampled = super::super::audio_utils::resample(
                        &mono_f32,
                        PAREC_SAMPLE_RATE,
                        WAKEWORD_SAMPLE_RATE,
                    );

                    // Convert back to i16 for wake word processor
                    let samples_i16: Vec<i16> = resampled
                        .iter()
                        .map(|&s| (s * i16::MAX as f32) as i16)
                        .collect();

                    // Log audio stats periodically
                    static AUDIO_COUNT: std::sync::atomic::AtomicUsize =
                        std::sync::atomic::AtomicUsize::new(0);
                    let audio_count =
                        AUDIO_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    if audio_count % 100 == 0 {
                        let max_sample = samples_i16.iter().map(|&s| s.abs()).max().unwrap_or(0);
                        let rms: f32 =
                            (samples_i16.iter().map(|&s| (s as f32).powi(2)).sum::<f32>()
                                / samples_i16.len() as f32)
                                .sqrt();
                        tracing::debug!(
                            "Audio stats: bytes={}, samples={}, max={}, rms={:.1}",
                            bytes_read,
                            samples_i16.len(),
                            max_sample,
                            rms
                        );
                    }

                    // Process through wake word detector
                    let mut service = wakeword_service.lock();
                    if let Some(detection) = service.process_samples(&samples_i16) {
                        // Check cooldown
                        if last_detection_time.elapsed() >= detection_cooldown {
                            tracing::info!(
                                "Wake word detected: {} (score={:.3})",
                                detection.name,
                                detection.score
                            );
                            last_detection_time = std::time::Instant::now();
                            drop(service); // Release lock before callback
                            on_detection(detection);
                        }
                    }
                }
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::Interrupted {
                        tracing::error!("Error reading from parec: {}", e);
                        break;
                    }
                }
            }
        }

        // Kill the parec process
        let _ = child.kill();
        let _ = child.wait();

        tracing::info!("Wake word listener stopped");
        Ok(())
    }
}

// ============================================================================
// Non-Linux Wake Word Listener (using cpal)
// ============================================================================

#[cfg(not(target_os = "linux"))]
mod cpal_wakeword_listener {
    use super::*;
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::mpsc;

    /// Run the wake word listening loop using cpal
    pub fn run_listening_loop<F>(
        wakeword_service: Arc<Mutex<WakewordService>>,
        on_detection: F,
    ) -> Result<(), super::super::VoiceError>
    where
        F: Fn(WakewordDetection) + Send + 'static,
    {
        let host = cpal::default_host();
        let device = host.default_input_device().ok_or_else(|| {
            super::super::VoiceError::AudioDevice("No default input device".to_string())
        })?;

        let supported_config = device.default_input_config().map_err(|e| {
            super::super::VoiceError::AudioDevice(format!("Failed to get input config: {}", e))
        })?;

        let config: cpal::StreamConfig = supported_config.clone().into();
        let device_sample_rate = config.sample_rate.0;
        let device_channels = config.channels;

        tracing::info!(
            "Wake word listener started (cpal {} Hz, {} channels)",
            device_sample_rate,
            device_channels
        );

        // Channel to send audio samples to the processing thread
        let (tx, rx) = mpsc::channel::<Vec<i16>>();

        let is_listening = wakeword_service.lock().get_listening_flag();
        let is_listening_stream = Arc::clone(&is_listening);

        // Build the input stream
        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_listening_stream.load(Ordering::Relaxed) {
                        return;
                    }

                    // Convert to mono if stereo
                    let mono_data: Vec<f32> = if device_channels > 1 {
                        data.chunks(device_channels as usize)
                            .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
                            .collect()
                    } else {
                        data.to_vec()
                    };

                    // Resample to 16kHz if needed
                    let resampled = if device_sample_rate != WAKEWORD_SAMPLE_RATE as u32 {
                        super::super::audio_utils::resample(
                            &mono_data,
                            device_sample_rate,
                            WAKEWORD_SAMPLE_RATE as u32,
                        )
                    } else {
                        mono_data
                    };

                    // Convert to i16
                    let samples_i16: Vec<i16> = resampled
                        .iter()
                        .map(|&s| {
                            (s * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16
                        })
                        .collect();

                    let _ = tx.send(samples_i16);
                },
                |err| {
                    tracing::error!("Audio stream error: {}", err);
                },
                None,
            )
            .map_err(|e| {
                super::super::VoiceError::AudioDevice(format!(
                    "Failed to build input stream: {}",
                    e
                ))
            })?;

        stream.play().map_err(|e| {
            super::super::VoiceError::Recording(format!("Failed to start stream: {}", e))
        })?;

        // Track last detection time
        let mut last_detection_time = std::time::Instant::now();
        let detection_cooldown = std::time::Duration::from_secs(2);

        // Processing loop
        while is_listening.load(Ordering::Relaxed) {
            match rx.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(samples) => {
                    let mut service = wakeword_service.lock();
                    if let Some(detection) = service.process_samples(&samples) {
                        if last_detection_time.elapsed() >= detection_cooldown {
                            tracing::info!(
                                "Wake word detected: {} (score={:.3})",
                                detection.name,
                                detection.score
                            );
                            last_detection_time = std::time::Instant::now();
                            drop(service);
                            on_detection(detection);
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }

        tracing::info!("Wake word listener stopped");
        Ok(())
    }
}
