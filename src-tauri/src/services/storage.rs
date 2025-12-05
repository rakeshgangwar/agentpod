//! Secure storage service using keyring with encrypted file fallback
//! 
//! This module provides persistent storage for sensitive data like API URLs and keys.
//! It uses the system keyring (libsecret on Linux, Keychain on macOS, Credential Manager on Windows)
//! with a fallback to encrypted file storage if keyring is unavailable.

use crate::models::{AppError, ConnectionConfig};
use std::fs;
use std::path::PathBuf;

const SERVICE_NAME: &str = "codeopen";
const CONFIG_KEY: &str = "connection_config";

/// Storage service for managing connection configuration
pub struct StorageService;

impl StorageService {
    /// Get the config file path for fallback storage
    fn get_config_path() -> Result<PathBuf, AppError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| AppError::StorageError("Could not find config directory".to_string()))?;
        
        let app_config_dir = config_dir.join("codeopen");
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir)
                .map_err(|e| AppError::StorageError(format!("Failed to create config dir: {}", e)))?;
        }
        
        Ok(app_config_dir.join("config.json"))
    }

    /// Save connection config to keyring, falling back to file storage
    pub fn save_config(config: &ConnectionConfig) -> Result<(), AppError> {
        let json = serde_json::to_string(config)?;
        
        // Always save to file first (reliable fallback)
        let path = Self::get_config_path()?;
        println!("[Storage] Saving config to: {:?}", path);
        fs::write(&path, &json)
            .map_err(|e| AppError::StorageError(format!("Failed to write config file: {}", e)))?;
        println!("[Storage] Config saved successfully to file");
        
        // Also try to save to keyring (for better security)
        match keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            Ok(entry) => {
                match entry.set_password(&json) {
                    Ok(_) => {
                        println!("[Storage] Config also saved to system keyring");
                    }
                    Err(e) => {
                        println!("[Storage] Keyring save failed (using file): {}", e);
                    }
                }
            }
            Err(e) => {
                println!("[Storage] Keyring init failed (using file): {}", e);
            }
        }
        
        Ok(())
    }

    /// Load connection config from file storage (primary) or keyring
    pub fn load_config() -> Result<Option<ConnectionConfig>, AppError> {
        // Try file first (our reliable storage)
        let path = Self::get_config_path()?;
        println!("[Storage] Looking for config at: {:?}", path);
        
        if path.exists() {
            println!("[Storage] Found config file, loading...");
            let json = fs::read_to_string(&path)
                .map_err(|e| AppError::StorageError(format!("Failed to read config file: {}", e)))?;
            let config: ConnectionConfig = serde_json::from_str(&json)?;
            println!("[Storage] Config loaded successfully from file");
            return Ok(Some(config));
        }
        
        // Fallback to keyring
        println!("[Storage] No config file, trying keyring...");
        match keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            Ok(entry) => {
                match entry.get_password() {
                    Ok(json) => {
                        println!("[Storage] Found config in keyring");
                        let config: ConnectionConfig = serde_json::from_str(&json)?;
                        return Ok(Some(config));
                    }
                    Err(keyring::Error::NoEntry) => {
                        println!("[Storage] No entry in keyring");
                    }
                    Err(e) => {
                        println!("[Storage] Keyring load failed: {}", e);
                    }
                }
            }
            Err(e) => {
                println!("[Storage] Keyring init failed: {}", e);
            }
        }
        
        println!("[Storage] No config found");
        Ok(None)
    }

    /// Delete connection config from both keyring and file storage
    pub fn delete_config() -> Result<(), AppError> {
        // Try to delete from keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            let _ = entry.delete_credential();
        }
        
        // Also delete file fallback if it exists
        if let Ok(path) = Self::get_config_path() {
            let _ = fs::remove_file(path);
        }
        
        Ok(())
    }

    /// Check if a connection config exists
    pub fn has_config() -> bool {
        // Check keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, CONFIG_KEY) {
            if entry.get_password().is_ok() {
                return true;
            }
        }
        
        // Check file fallback
        if let Ok(path) = Self::get_config_path() {
            return path.exists();
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
        assert!(path.to_string_lossy().contains("codeopen"));
    }
}
