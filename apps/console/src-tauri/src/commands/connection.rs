//! Connection management commands
//!
//! Commands for connecting to, testing, and managing the Management API connection.

use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::services::{api::ApiClient, storage::StorageService};
use chrono::Utc;

/// Connect to a Management API instance
///
/// Validates the connection by performing a health check, then stores the config.
#[tauri::command]
pub async fn connect(
    api_url: String,
    api_key: Option<String>,
) -> Result<ConnectionStatus, AppError> {
    // Normalize the URL
    let api_url = api_url.trim().trim_end_matches('/').to_string();

    if api_url.is_empty() {
        return Err(AppError::InvalidConfig("API URL is required".to_string()));
    }

    // Create config and test connection
    let config = ConnectionConfig {
        api_url: api_url.clone(),
        api_key,
    };

    let client = ApiClient::with_config(&config)?;

    // Test the connection with a health check
    match client.health_check().await {
        Ok(_health) => {
            // Connection successful, save the config
            StorageService::save_config(&config)?;

            Ok(ConnectionStatus {
                connected: true,
                api_url: Some(api_url),
                last_tested: Some(Utc::now().to_rfc3339()),
                error: None,
            })
        }
        Err(e) => Ok(ConnectionStatus {
            connected: false,
            api_url: Some(api_url),
            last_tested: Some(Utc::now().to_rfc3339()),
            error: Some(e.to_string()),
        }),
    }
}

/// Disconnect from the Management API
///
/// Removes stored credentials and connection config.
#[tauri::command]
pub async fn disconnect() -> Result<(), AppError> {
    StorageService::delete_config()?;
    Ok(())
}

/// Test the current connection
///
/// Performs a health check on the stored API endpoint.
#[tauri::command]
pub async fn test_connection() -> Result<ConnectionStatus, AppError> {
    let config = StorageService::load_config()?;

    match config {
        Some(config) => {
            let client = ApiClient::with_config(&config)?;

            match client.health_check().await {
                Ok(_health) => Ok(ConnectionStatus {
                    connected: true,
                    api_url: Some(config.api_url),
                    last_tested: Some(Utc::now().to_rfc3339()),
                    error: None,
                }),
                Err(e) => Ok(ConnectionStatus {
                    connected: false,
                    api_url: Some(config.api_url),
                    last_tested: Some(Utc::now().to_rfc3339()),
                    error: Some(e.to_string()),
                }),
            }
        }
        None => Ok(ConnectionStatus {
            connected: false,
            api_url: None,
            last_tested: None,
            error: Some("No connection configured".to_string()),
        }),
    }
}

/// Get the current connection status
///
/// Returns cached status without performing a health check.
#[tauri::command]
pub async fn get_connection_status() -> Result<ConnectionStatus, AppError> {
    let config = StorageService::load_config()?;

    match config {
        Some(config) => {
            Ok(ConnectionStatus {
                connected: true, // Assume connected if config exists
                api_url: Some(config.api_url),
                last_tested: None,
                error: None,
            })
        }
        None => Ok(ConnectionStatus {
            connected: false,
            api_url: None,
            last_tested: None,
            error: None,
        }),
    }
}
