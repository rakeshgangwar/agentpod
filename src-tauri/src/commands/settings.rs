//! Settings commands for the CodeOpen app
//! 
//! Handles local settings storage and Management API provider operations.

use crate::models::{AppError, AppSettings, ExportData, Provider, ProvidersResponse};
use crate::services::{ApiClient, SettingsService};
use chrono::Utc;

/// Get current app settings from local storage
#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, AppError> {
    SettingsService::load_settings()
}

/// Save app settings to local storage
#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), AppError> {
    SettingsService::save_settings(&settings)
}

/// List LLM providers from Management API
#[tauri::command]
pub async fn list_providers() -> Result<Vec<Provider>, AppError> {
    let client = ApiClient::new()?;
    let response: ProvidersResponse = client.get("/api/providers").await?;
    Ok(response.providers)
}

/// Get the default LLM provider from Management API
#[tauri::command]
pub async fn get_default_provider() -> Result<Option<Provider>, AppError> {
    let client = ApiClient::new()?;
    
    // The API returns { provider: Provider | null }
    #[derive(serde::Deserialize)]
    struct Response {
        provider: Option<Provider>,
    }
    
    let response: Response = client.get("/api/providers/default").await?;
    Ok(response.provider)
}

/// Export settings to a JSON string for backup/transfer
#[tauri::command]
pub async fn export_settings() -> Result<String, AppError> {
    let settings = SettingsService::load_settings()?;
    let api_url = crate::services::StorageService::load_config()?.map(|c| c.api_url);
    
    let export_data = ExportData {
        version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: Utc::now().to_rfc3339(),
        settings,
        api_url,
    };
    
    serde_json::to_string_pretty(&export_data)
        .map_err(|e| AppError::SerializationError(e.to_string()))
}

/// Import settings from a JSON string
#[tauri::command]
pub async fn import_settings(json: String) -> Result<AppSettings, AppError> {
    let export_data: ExportData = serde_json::from_str(&json)
        .map_err(|e| AppError::SerializationError(format!("Invalid settings file: {}", e)))?;
    
    // Save the imported settings
    SettingsService::save_settings(&export_data.settings)?;
    
    // Optionally update the API URL if provided and different
    if let Some(api_url) = export_data.api_url {
        if let Ok(Some(mut config)) = crate::services::StorageService::load_config() {
            if config.api_url != api_url {
                // Only update URL, keep existing key
                config.api_url = api_url;
                crate::services::StorageService::save_config(&config)?;
            }
        }
    }
    
    Ok(export_data.settings)
}
