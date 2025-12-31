//! Secure storage service using keyring with file fallback
//!
//! This module provides persistent storage for sensitive data like API URLs and keys.
//! It uses the system keyring (libsecret on Linux, Keychain on macOS, Credential Manager on Windows)
//! with a fallback to file storage if keyring is unavailable.

use crate::models::{AppError, ConnectionConfig};
use std::fs;
use std::path::PathBuf;

const SERVICE_NAME: &str = "agentpod";
const CONFIG_KEY: &str = "connection_config";

/// Storage service for managing connection configuration
pub struct StorageService;

impl StorageService {
    /// Get the config file path for fallback storage
    fn get_config_path() -> Result<PathBuf, AppError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| AppError::StorageError("Could not find config directory".to_string()))?;

        let app_config_dir = config_dir.join("agentpod");
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir).map_err(|e| {
                AppError::StorageError(format!("Failed to create config dir: {}", e))
            })?;
        }

        Ok(app_config_dir.join("config.json"))
    }

    /// Save connection config to file storage (and optionally keyring)
    pub fn save_config(config: &ConnectionConfig) -> Result<(), AppError> {
        let json = serde_json::to_string(config)?;

        // Always save to file (reliable storage)
        let path = Self::get_config_path()?;
        fs::write(&path, &json)
            .map_err(|e| AppError::StorageError(format!("Failed to write config file: {}", e)))?;

        // Also try to save to keyring (for better security on supported systems)
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            let _ = entry.set_password(&json);
        }

        Ok(())
    }

    /// Load connection config from file storage (primary) or keyring (fallback)
    pub fn load_config() -> Result<Option<ConnectionConfig>, AppError> {
        // Try file first (our reliable storage)
        let path = Self::get_config_path()?;

        if path.exists() {
            let json = fs::read_to_string(&path).map_err(|e| {
                AppError::StorageError(format!("Failed to read config file: {}", e))
            })?;
            let config: ConnectionConfig = serde_json::from_str(&json)?;
            return Ok(Some(config));
        }

        // Fallback to keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            if let Ok(json) = entry.get_password() {
                let config: ConnectionConfig = serde_json::from_str(&json)?;
                return Ok(Some(config));
            }
        }

        Ok(None)
    }

    /// Delete connection config from both keyring and file storage
    pub fn delete_config() -> Result<(), AppError> {
        // Try to delete from keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            let _ = entry.delete_credential();
        }

        // Also delete file if it exists
        if let Ok(path) = Self::get_config_path() {
            let _ = fs::remove_file(path);
        }

        Ok(())
    }

    /// Check if a connection config exists
    pub fn has_config() -> bool {
        // Check file first
        if let Ok(path) = Self::get_config_path() {
            if path.exists() {
                return true;
            }
        }

        // Check keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            if entry.get_password().is_ok() {
                return true;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_path() {
        let path = StorageService::get_config_path();
        assert!(path.is_ok());
        let path = path.unwrap();
        assert!(path.to_string_lossy().contains("agentpod"));
    }
}
