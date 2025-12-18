//! Whisper model download and management
//!
//! Handles downloading models from Hugging Face and managing local model storage.

use std::path::PathBuf;

use super::config::ModelSize;
use super::VoiceError;

/// Information about a Whisper model
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// Model identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Model size category
    pub size: ModelSize,
    /// File size description
    pub size_display: String,
    /// Size in bytes
    pub size_bytes: u64,
    /// Description of speed/accuracy trade-off
    pub description: String,
    /// Whether the model is downloaded locally
    pub is_downloaded: bool,
    /// Local file path (if downloaded)
    pub local_path: Option<PathBuf>,
}

/// Whisper model identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhisperModel {
    Tiny,
    Base,
    Small,
    Medium,
}

impl WhisperModel {
    pub fn from_size(size: ModelSize) -> Self {
        match size {
            ModelSize::Tiny => Self::Tiny,
            ModelSize::Base => Self::Base,
            ModelSize::Small => Self::Small,
            ModelSize::Medium => Self::Medium,
        }
    }
    
    pub fn to_size(&self) -> ModelSize {
        match self {
            Self::Tiny => ModelSize::Tiny,
            Self::Base => ModelSize::Base,
            Self::Small => ModelSize::Small,
            Self::Medium => ModelSize::Medium,
        }
    }
    
    pub fn all() -> Vec<Self> {
        vec![Self::Tiny, Self::Base, Self::Small, Self::Medium]
    }
}

/// Manages Whisper model downloads and storage
pub struct ModelManager {
    /// Base directory for model storage
    models_dir: PathBuf,
}

impl ModelManager {
    /// Create a new model manager
    pub fn new() -> Self {
        let models_dir = Self::default_models_dir();
        Self { models_dir }
    }
    
    /// Get the default models directory
    pub fn default_models_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("dev.agentpod.app")
            .join("models")
            .join("whisper")
    }
    
    /// Get the models directory
    pub fn models_dir(&self) -> &PathBuf {
        &self.models_dir
    }
    
    /// Ensure the models directory exists
    pub fn ensure_models_dir(&self) -> Result<(), VoiceError> {
        if !self.models_dir.exists() {
            std::fs::create_dir_all(&self.models_dir)?;
            tracing::info!("Created models directory: {:?}", self.models_dir);
        }
        Ok(())
    }
    
    /// Get the local path for a model
    pub fn model_path(&self, size: ModelSize) -> PathBuf {
        self.models_dir.join(size.filename())
    }
    
    /// Check if a model is downloaded
    pub fn is_model_downloaded(&self, size: ModelSize) -> bool {
        self.model_path(size).exists()
    }
    
    /// Get info for a specific model
    pub fn get_model_info(&self, size: ModelSize) -> ModelInfo {
        let local_path = self.model_path(size);
        let is_downloaded = local_path.exists();
        
        ModelInfo {
            id: format!("whisper-{}", size.filename().replace(".bin", "")),
            name: format!("Whisper {}", match size {
                ModelSize::Tiny => "Tiny",
                ModelSize::Base => "Base",
                ModelSize::Small => "Small",
                ModelSize::Medium => "Medium",
            }),
            size,
            size_display: size.size_display().to_string(),
            size_bytes: size.size_bytes(),
            description: size.description().to_string(),
            is_downloaded,
            local_path: if is_downloaded { Some(local_path) } else { None },
        }
    }
    
    /// List all available models
    pub fn list_available_models(&self) -> Vec<ModelInfo> {
        vec![
            self.get_model_info(ModelSize::Tiny),
            self.get_model_info(ModelSize::Base),
            self.get_model_info(ModelSize::Small),
            self.get_model_info(ModelSize::Medium),
        ]
    }
    
    /// List downloaded models
    pub fn list_downloaded_models(&self) -> Vec<ModelInfo> {
        self.list_available_models()
            .into_iter()
            .filter(|m| m.is_downloaded)
            .collect()
    }
    
    /// Delete a downloaded model
    pub fn delete_model(&self, size: ModelSize) -> Result<(), VoiceError> {
        let path = self.model_path(size);
        if path.exists() {
            std::fs::remove_file(&path)?;
            tracing::info!("Deleted model: {:?}", path);
        }
        Ok(())
    }
    
    /// Download a model from Hugging Face
    /// 
    /// This function blocks while downloading. For UI responsiveness,
    /// call this from a background thread and use progress_callback.
    pub async fn download_model<F>(
        &self,
        size: ModelSize,
        progress_callback: F,
    ) -> Result<PathBuf, VoiceError>
    where
        F: Fn(DownloadProgress) + Send + 'static,
    {
        self.ensure_models_dir()?;
        
        let destination = self.model_path(size);
        
        // Check if already downloaded
        if destination.exists() {
            tracing::info!("Model already downloaded: {:?}", destination);
            progress_callback(DownloadProgress {
                stage: DownloadStage::Complete,
                bytes_downloaded: size.size_bytes(),
                total_bytes: size.size_bytes(),
                percent: 100,
            });
            return Ok(destination);
        }
        
        tracing::info!("Downloading model {} to {:?}", size.filename(), destination);
        
        // Use hf-hub to download the model
        let api = hf_hub::api::tokio::Api::new()
            .map_err(|e| VoiceError::ModelDownload(format!("Failed to create HF API: {}", e)))?;
        
        let repo = api.model(size.hf_model_id().to_string());
        
        progress_callback(DownloadProgress {
            stage: DownloadStage::Downloading,
            bytes_downloaded: 0,
            total_bytes: size.size_bytes(),
            percent: 0,
        });
        
        // Download the model file
        let downloaded_path = repo
            .get(size.hf_file_path())
            .await
            .map_err(|e| VoiceError::ModelDownload(format!("Failed to download model: {}", e)))?;
        
        // Copy to our models directory
        std::fs::copy(&downloaded_path, &destination)?;
        
        progress_callback(DownloadProgress {
            stage: DownloadStage::Complete,
            bytes_downloaded: size.size_bytes(),
            total_bytes: size.size_bytes(),
            percent: 100,
        });
        
        tracing::info!("Model downloaded successfully: {:?}", destination);
        Ok(destination)
    }
    
    /// Synchronous version of download_model for use in blocking contexts
    pub fn download_model_sync<F>(
        &self,
        size: ModelSize,
        progress_callback: F,
    ) -> Result<PathBuf, VoiceError>
    where
        F: Fn(DownloadProgress) + Send + 'static,
    {
        self.ensure_models_dir()?;
        
        let destination = self.model_path(size);
        
        // Check if already downloaded
        if destination.exists() {
            tracing::info!("Model already downloaded: {:?}", destination);
            progress_callback(DownloadProgress {
                stage: DownloadStage::Complete,
                bytes_downloaded: size.size_bytes(),
                total_bytes: size.size_bytes(),
                percent: 100,
            });
            return Ok(destination);
        }
        
        tracing::info!("Downloading model {} to {:?}", size.filename(), destination);
        
        // Use hf-hub sync API
        let api = hf_hub::api::sync::Api::new()
            .map_err(|e| VoiceError::ModelDownload(format!("Failed to create HF API: {}", e)))?;
        
        let repo = api.model(size.hf_model_id().to_string());
        
        progress_callback(DownloadProgress {
            stage: DownloadStage::Downloading,
            bytes_downloaded: 0,
            total_bytes: size.size_bytes(),
            percent: 0,
        });
        
        // Download the model file
        let downloaded_path = repo
            .get(size.hf_file_path())
            .map_err(|e| VoiceError::ModelDownload(format!("Failed to download model: {}", e)))?;
        
        // Copy to our models directory
        std::fs::copy(&downloaded_path, &destination)?;
        
        progress_callback(DownloadProgress {
            stage: DownloadStage::Complete,
            bytes_downloaded: size.size_bytes(),
            total_bytes: size.size_bytes(),
            percent: 100,
        });
        
        tracing::info!("Model downloaded successfully: {:?}", destination);
        Ok(destination)
    }
}

impl Default for ModelManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Download progress information
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    /// Current stage
    pub stage: DownloadStage,
    /// Bytes downloaded so far
    pub bytes_downloaded: u64,
    /// Total bytes to download
    pub total_bytes: u64,
    /// Progress percentage (0-100)
    pub percent: u32,
}

/// Download stage
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStage {
    /// Starting download
    Starting,
    /// Downloading model file
    Downloading,
    /// Download complete
    Complete,
    /// Download failed
    Failed,
}
