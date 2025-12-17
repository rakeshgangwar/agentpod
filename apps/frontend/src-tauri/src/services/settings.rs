//! Settings storage service
//! 
//! Manages local app settings in ~/.config/agentpod/settings.json

use crate::models::{AppError, AppSettings};
use std::fs;
use std::path::PathBuf;

/// Settings service for managing app settings
pub struct SettingsService;

impl SettingsService {
    /// Get the settings file path
    fn get_settings_path() -> Result<PathBuf, AppError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| AppError::StorageError("Could not find config directory".to_string()))?;
        
        let app_config_dir = config_dir.join("agentpod");
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir)
                .map_err(|e| AppError::StorageError(format!("Failed to create config dir: {}", e)))?;
        }
        
        Ok(app_config_dir.join("settings.json"))
    }

    /// Load settings from storage, or return defaults if not found
    pub fn load_settings() -> Result<AppSettings, AppError> {
        let path = Self::get_settings_path()?;
        
        if path.exists() {
            let json = fs::read_to_string(&path)
                .map_err(|e| AppError::StorageError(format!("Failed to read settings file: {}", e)))?;
            let settings: AppSettings = serde_json::from_str(&json)
                .map_err(|e| AppError::SerializationError(format!("Failed to parse settings: {}", e)))?;
            Ok(settings)
        } else {
            // Return defaults if no settings file exists
            Ok(AppSettings::default())
        }
    }

    /// Save settings to storage
    pub fn save_settings(settings: &AppSettings) -> Result<(), AppError> {
        let path = Self::get_settings_path()?;
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize settings: {}", e)))?;
        
        fs::write(&path, &json)
            .map_err(|e| AppError::StorageError(format!("Failed to write settings file: {}", e)))?;
        
        Ok(())
    }

    /// Delete settings file
    pub fn delete_settings() -> Result<(), AppError> {
        let path = Self::get_settings_path()?;
        
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| AppError::StorageError(format!("Failed to delete settings file: {}", e)))?;
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_path() {
        let path = SettingsService::get_settings_path();
        assert!(path.is_ok());
        let path = path.unwrap();
        assert!(path.to_string_lossy().contains("agentpod"));
        assert!(path.to_string_lossy().contains("settings.json"));
    }
    
    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.auto_refresh_interval, 30);
        assert!(settings.in_app_notifications);
        assert!(settings.system_notifications);
    }
}
