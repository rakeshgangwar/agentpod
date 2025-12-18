//! Docker image management commands
//!
//! Commands for checking image availability and pulling images.

use crate::models::AppError;
use crate::services::ApiClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

// =============================================================================
// Types
// =============================================================================

/// Image availability status for a single flavor
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlavorImageStatus {
    pub available: bool,
    pub image_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response from flavor images endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlavorImagesResponse {
    pub success: bool,
    pub images: HashMap<String, FlavorImageStatus>,
}

/// Docker image info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageInfo {
    pub name: String,
    pub id: String,
    pub size: u64,
    pub created: String,
}

/// Response for single image check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageExistsResponse {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<DockerImageInfo>,
}

/// Response for image pull (sync)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePullResponse {
    pub success: bool,
    pub image_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<DockerImageInfo>,
}

/// Docker daemon info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageInfo2 {
    pub version: String,
    pub api_version: String,
    pub os: String,
    pub arch: String,
    pub containers: DockerContainerStats,
    pub images: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerStats {
    pub running: u32,
    pub stopped: u32,
}

/// Docker info response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfoResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<DockerImageInfo2>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Docker health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerHealthCheckResponse {
    pub healthy: bool,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Image pull request body
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePullRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flavor_id: Option<String>,
}

// =============================================================================
// Commands
// =============================================================================

/// Get availability status of all flavor images
#[tauri::command]
pub async fn get_flavor_images() -> Result<FlavorImagesResponse, AppError> {
    let client = get_client()?;
    client.get("/api/docker/images/flavors").await
}

/// Check if a specific image exists
#[tauri::command]
pub async fn check_image_exists(image_name: String) -> Result<ImageExistsResponse, AppError> {
    let client = get_client()?;
    // URL-encode the image name to handle colons in tags
    let encoded_name = urlencoding::encode(&image_name);
    client.get(&format!("/api/docker/images/{}", encoded_name)).await
}

/// Pull an image synchronously (without streaming progress)
#[tauri::command]
pub async fn pull_image_sync(
    image_name: Option<String>,
    flavor_id: Option<String>,
) -> Result<ImagePullResponse, AppError> {
    if image_name.is_none() && flavor_id.is_none() {
        return Err(AppError::InvalidConfig("Either image_name or flavor_id is required".to_string()));
    }
    
    let client = get_client()?;
    
    let body = ImagePullRequest {
        image_name,
        flavor_id,
    };
    
    let response: ImagePullResponse = client.post("/api/docker/images/pull/sync", &body).await?;
    
    if !response.success {
        return Err(AppError::ApiError(response.error.unwrap_or_else(|| "Failed to pull image".to_string())));
    }
    
    Ok(response)
}

/// Get Docker daemon information
#[tauri::command]
pub async fn get_docker_info() -> Result<DockerImageInfo2, AppError> {
    let client = get_client()?;
    
    let response: DockerInfoResponse = client.get("/api/docker/info").await?;
    
    if !response.success {
        return Err(AppError::ApiError(response.error.unwrap_or_else(|| "Failed to get Docker info".to_string())));
    }
    
    response.info.ok_or_else(|| AppError::ApiError("No Docker info returned".to_string()))
}

/// Check Docker daemon health
#[tauri::command]
pub async fn check_docker_health() -> Result<DockerHealthCheckResponse, AppError> {
    let client = get_client()?;
    client.get("/api/docker/health").await
}
