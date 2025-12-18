//! Voice input configuration

use serde::{Deserialize, Serialize};

/// Voice input mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum VoiceMode {
    /// Hold a key to record, release to stop and transcribe
    #[default]
    PushToTalk,
    /// Click to start recording, click again to stop and transcribe
    Toggle,
}

/// Whisper model size selection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ModelSize {
    /// ~75 MB, very fast, basic accuracy
    Tiny,
    /// ~142 MB, fast, good accuracy (recommended default)
    #[default]
    Base,
    /// ~466 MB, medium speed, better accuracy
    Small,
    /// ~1.5 GB, slower, high accuracy
    Medium,
}

impl ModelSize {
    /// Get the model filename for this size
    pub fn filename(&self) -> &'static str {
        match self {
            ModelSize::Tiny => "ggml-tiny.bin",
            ModelSize::Base => "ggml-base.bin",
            ModelSize::Small => "ggml-small.bin",
            ModelSize::Medium => "ggml-medium.bin",
        }
    }
    
    /// Get the Hugging Face model ID
    pub fn hf_model_id(&self) -> &'static str {
        // Using ggerganov's whisper.cpp compatible models
        "ggerganov/whisper.cpp"
    }
    
    /// Get the file path within the HF repo
    pub fn hf_file_path(&self) -> &'static str {
        self.filename()
    }
    
    /// Get approximate model size in bytes
    pub fn size_bytes(&self) -> u64 {
        match self {
            ModelSize::Tiny => 75_000_000,
            ModelSize::Base => 142_000_000,
            ModelSize::Small => 466_000_000,
            ModelSize::Medium => 1_500_000_000,
        }
    }
    
    /// Get human-readable size description
    pub fn size_display(&self) -> &'static str {
        match self {
            ModelSize::Tiny => "~75 MB",
            ModelSize::Base => "~142 MB",
            ModelSize::Small => "~466 MB",
            ModelSize::Medium => "~1.5 GB",
        }
    }
    
    /// Get description of speed/accuracy trade-off
    pub fn description(&self) -> &'static str {
        match self {
            ModelSize::Tiny => "Very fast, basic accuracy. Good for wake word detection.",
            ModelSize::Base => "Fast, good accuracy. Recommended for general use.",
            ModelSize::Small => "Medium speed, better accuracy. Good balance.",
            ModelSize::Medium => "Slower, high accuracy. Best quality transcription.",
        }
    }
}

/// Voice input configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceConfig {
    /// Whether voice input is enabled
    pub enabled: bool,
    
    /// Voice input mode (push-to-talk or toggle)
    pub mode: VoiceMode,
    
    /// Selected whisper model size
    pub model: ModelSize,
    
    /// Language code for transcription (e.g., "en", "auto")
    pub language: String,
    
    /// Whether wake word detection is enabled
    pub wake_word_enabled: bool,
    
    /// Wake phrases to listen for
    pub wake_phrases: Vec<String>,
    
    /// Keyboard shortcut for push-to-talk
    /// Format: modifier+key (e.g., "Alt+Space", "Ctrl+Shift+V")
    pub push_to_talk_key: String,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: VoiceMode::PushToTalk,
            model: ModelSize::Base,
            language: "en".to_string(),
            wake_word_enabled: false,
            wake_phrases: vec!["Buddy".to_string(), "Hey Buddy".to_string()],
            push_to_talk_key: "Ctrl+Shift+M".to_string(),
        }
    }
}

impl VoiceConfig {
    /// Create a new config with wake word enabled
    pub fn with_wake_word(mut self, enabled: bool) -> Self {
        self.wake_word_enabled = enabled;
        self
    }
    
    /// Set the model size
    pub fn with_model(mut self, model: ModelSize) -> Self {
        self.model = model;
        self
    }
    
    /// Set the language
    pub fn with_language(mut self, language: impl Into<String>) -> Self {
        self.language = language.into();
        self
    }
}
