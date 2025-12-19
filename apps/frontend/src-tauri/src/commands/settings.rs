//! Settings commands for the AgentPod app
//!
//! Handles local settings storage and Management API provider operations.

use crate::models::{
    AppError, AppSettings, ContainerAddon, ContainerAddonsResponse, ContainerFlavor,
    ContainerFlavorsResponse, ExportData, FilesListResponse, OAuthFlowInit, OAuthFlowStatus,
    Provider, ProviderWithModels, ProvidersResponse, ProvidersWithModelsResponse, ResourceTier,
    ResourceTiersResponse, SettingsUpdateResponse, UserOpencodeConfig, UserOpencodeFile,
    UserOpencodeSettings,
};
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

/// List LLM providers from Management API (legacy endpoint)
#[tauri::command]
pub async fn list_providers() -> Result<Vec<Provider>, AppError> {
    let client = ApiClient::new()?;
    let response: ProvidersResponse = client.get("/api/providers").await?;
    Ok(response.providers)
}

/// List LLM providers with models from Models.dev (new endpoint)
#[tauri::command]
pub async fn list_providers_with_models(
    popular_only: Option<bool>,
) -> Result<Vec<ProviderWithModels>, AppError> {
    let client = ApiClient::new()?;

    let popular = popular_only.unwrap_or(true);
    let path = format!("/api/providers?popularOnly={}", popular);

    let response: ProvidersWithModelsResponse = client.get(&path).await?;
    Ok(response.providers)
}

/// List only configured LLM providers (those with credentials)
#[tauri::command]
pub async fn list_configured_providers() -> Result<Vec<ProviderWithModels>, AppError> {
    let client = ApiClient::new()?;
    let response: ProvidersWithModelsResponse = client.get("/api/providers/configured").await?;
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

/// Configure a provider with an API key
#[tauri::command]
pub async fn configure_provider_api_key(
    provider_id: String,
    api_key: String,
) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Body {
        api_key: String,
    }

    let path = format!("/api/providers/{}/configure", provider_id);
    let _: serde_json::Value = client.post(&path, &Body { api_key }).await?;

    Ok(())
}

/// Initialize OAuth device flow for a provider
#[tauri::command]
pub async fn init_oauth_flow(provider_id: String) -> Result<OAuthFlowInit, AppError> {
    let client = ApiClient::new()?;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        state_id: String,
        user_code: String,
        verification_uri: String,
        expires_at: String,
        interval: u32,
    }

    let path = format!("/api/providers/{}/oauth/init", provider_id);
    let response: Response = client.post(&path, &serde_json::json!({})).await?;

    Ok(OAuthFlowInit {
        state_id: response.state_id,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        expires_at: response.expires_at,
        interval: response.interval,
    })
}

/// Poll OAuth device flow status
#[tauri::command]
pub async fn poll_oauth_flow(
    provider_id: String,
    state_id: String,
) -> Result<OAuthFlowStatus, AppError> {
    let client = ApiClient::new()?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Body {
        state_id: String,
    }

    let path = format!("/api/providers/{}/oauth/poll", provider_id);
    let response: OAuthFlowStatus = client.post(&path, &Body { state_id }).await?;

    Ok(response)
}

/// Cancel an OAuth flow
#[tauri::command]
pub async fn cancel_oauth_flow(provider_id: String, state_id: String) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    let path = format!("/api/providers/{}/oauth/{}", provider_id, state_id);

    // DELETE request - we'll need to add a delete method to ApiClient
    let url = format!("{}{}", client.base_url(), path);
    let request = client.client().delete(&url);
    let request = client.add_auth_header(request).await;
    let response = request
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::ApiError(format!(
            "Failed to cancel OAuth flow: {}",
            response.status()
        )));
    }

    Ok(())
}

/// Remove provider credentials
#[tauri::command]
pub async fn remove_provider_credentials(provider_id: String) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    let path = format!("/api/providers/{}", provider_id);

    // DELETE request
    let url = format!("{}{}", client.base_url(), path);
    let request = client.client().delete(&url);
    let request = client.add_auth_header(request).await;
    let response = request
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::ApiError(format!(
            "Failed to remove credentials: {}",
            response.status()
        )));
    }

    Ok(())
}

/// Set a provider as the default
#[tauri::command]
pub async fn set_default_provider(provider_id: String) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    let path = format!("/api/providers/{}/set-default", provider_id);
    let _: serde_json::Value = client.post(&path, &serde_json::json!({})).await?;

    Ok(())
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

// =============================================================================
// User OpenCode Config Commands
// =============================================================================

/// Get user's full OpenCode configuration
/// This is used to display and edit the user's OpenCode settings in the mobile app
#[tauri::command]
pub async fn get_user_opencode_config(user_id: String) -> Result<UserOpencodeConfig, AppError> {
    let client = ApiClient::new()?;

    let path = format!("/api/users/{}/opencode/config", user_id);
    let response: UserOpencodeConfig = client.get(&path).await?;

    Ok(response)
}

/// Update user's OpenCode settings (Layer 3)
#[tauri::command]
pub async fn update_user_opencode_settings(
    user_id: String,
    settings: UserOpencodeSettings,
) -> Result<UserOpencodeSettings, AppError> {
    let client = ApiClient::new()?;

    // API expects { "settings": {...} } wrapper
    #[derive(serde::Serialize)]
    struct Body {
        settings: UserOpencodeSettings,
    }

    let path = format!("/api/users/{}/opencode/settings", user_id);
    let response: SettingsUpdateResponse = client.put(&path, &Body { settings }).await?;

    Ok(response.settings)
}

/// Update user's AGENTS.md content
#[tauri::command]
pub async fn update_user_agents_md(user_id: String, content: String) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    #[derive(serde::Serialize)]
    struct Body {
        content: String,
    }

    let path = format!("/api/users/{}/opencode/agents-md", user_id);
    let _: serde_json::Value = client.put(&path, &Body { content }).await?;

    Ok(())
}

/// List user's OpenCode config files (agents, commands, tools, plugins)
#[tauri::command]
pub async fn list_user_opencode_files(
    user_id: String,
    file_type: Option<String>,
) -> Result<Vec<UserOpencodeFile>, AppError> {
    let client = ApiClient::new()?;

    let mut path = format!("/api/users/{}/opencode/files", user_id);
    if let Some(ft) = file_type {
        path = format!("{}?type={}", path, ft);
    }

    let response: FilesListResponse = client.get(&path).await?;

    Ok(response.files)
}

/// Create or update a user's OpenCode config file
#[tauri::command]
pub async fn upsert_user_opencode_file(
    user_id: String,
    file_type: String,
    name: String,
    content: String,
    extension: Option<String>,
) -> Result<UserOpencodeFile, AppError> {
    let client = ApiClient::new()?;

    #[derive(serde::Serialize)]
    struct Body {
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        extension: Option<String>,
    }

    #[derive(serde::Deserialize)]
    #[allow(dead_code)]
    struct Response {
        #[serde(default)]
        success: bool,
        #[serde(rename = "type", default)]
        file_type: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        extension: String,
        #[serde(default)]
        content: String,
        #[serde(default)]
        message: Option<String>,
    }

    let path = format!(
        "/api/users/{}/opencode/files/{}/{}",
        user_id, file_type, name
    );
    let response: Response = client.put(&path, &Body { content, extension }).await?;

    Ok(UserOpencodeFile {
        name: response.name,
        file_type: response.file_type,
        extension: response.extension,
        content: response.content,
        id: None,
        created_at: None,
        updated_at: None,
    })
}

/// Delete a user's OpenCode config file
#[tauri::command]
pub async fn delete_user_opencode_file(
    user_id: String,
    file_type: String,
    name: String,
) -> Result<(), AppError> {
    let client = ApiClient::new()?;

    let path = format!(
        "/api/users/{}/opencode/files/{}/{}",
        user_id, file_type, name
    );

    // DELETE request
    let url = format!("{}{}", client.base_url(), path);
    let request = client.client().delete(&url);
    let request = client.add_auth_header(request).await;
    let response = request
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::ApiError(format!(
            "Failed to delete file: {}",
            response.status()
        )));
    }

    Ok(())
}

// =============================================================================
// Resource Tiers (Modular Container System)
// =============================================================================

/// List all available resource tiers
#[tauri::command]
pub async fn list_resource_tiers() -> Result<Vec<ResourceTier>, AppError> {
    let client = ApiClient::new()?;
    let response: ResourceTiersResponse = client.get("/api/resource-tiers").await?;
    Ok(response.tiers)
}

/// Get the default resource tier
#[tauri::command]
pub async fn get_default_resource_tier() -> Result<ResourceTier, AppError> {
    let client = ApiClient::new()?;
    client.get("/api/resource-tiers/default").await
}

// =============================================================================
// Container Flavors
// =============================================================================

/// List all available container flavors
#[tauri::command]
pub async fn list_container_flavors() -> Result<Vec<ContainerFlavor>, AppError> {
    let client = ApiClient::new()?;
    let response: ContainerFlavorsResponse = client.get("/api/flavors").await?;
    Ok(response.flavors)
}

/// Get the default container flavor
#[tauri::command]
pub async fn get_default_container_flavor() -> Result<ContainerFlavor, AppError> {
    let client = ApiClient::new()?;
    client.get("/api/flavors/default").await
}

// =============================================================================
// Container Addons
// =============================================================================

/// List all available container addons
#[tauri::command]
pub async fn list_container_addons() -> Result<Vec<ContainerAddon>, AppError> {
    let client = ApiClient::new()?;
    let response: ContainerAddonsResponse = client.get("/api/addons").await?;
    Ok(response.addons)
}

/// Get non-GPU addons only
#[tauri::command]
pub async fn list_non_gpu_addons() -> Result<Vec<ContainerAddon>, AppError> {
    let client = ApiClient::new()?;
    let response: ContainerAddonsResponse = client.get("/api/addons/non-gpu").await?;
    Ok(response.addons)
}
