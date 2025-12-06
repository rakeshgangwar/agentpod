//! Error types for the CodeOpen Tauri app

use thiserror::Error;

/// Application-level errors
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Not connected to Management API")]
    NotConnected,

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

/// Make AppError serializable for Tauri commands
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// Conversion from reqwest errors
impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_connect() {
            AppError::ConnectionFailed(err.to_string())
        } else if err.is_timeout() {
            AppError::NetworkError("Request timed out".to_string())
        } else {
            AppError::NetworkError(err.to_string())
        }
    }
}

// Conversion from keyring errors
impl From<keyring::Error> for AppError {
    fn from(err: keyring::Error) -> Self {
        AppError::StorageError(err.to_string())
    }
}

// Conversion from serde_json errors
impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::StorageError(format!("JSON error: {}", err))
    }
}
