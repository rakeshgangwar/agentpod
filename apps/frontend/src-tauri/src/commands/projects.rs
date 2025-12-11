//! Project management commands
//!
//! Commands for CRUD operations and container control for projects.

use crate::models::{AppError, ContainerTier, ContainerFlavor, ContainerAddon, ResourceTier, CreateProjectInput, DeployResponse, Project};
use crate::services::ApiClient;

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

/// List all projects
#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, AppError> {
    let client = get_client()?;
    client.list_projects().await
}

/// Get a single project by ID
#[tauri::command]
pub async fn get_project(id: String) -> Result<Project, AppError> {
    let client = get_client()?;
    client.get_project(&id).await
}

/// Create a new project
#[tauri::command]
pub async fn create_project(
    name: String,
    description: Option<String>,
    github_url: Option<String>,
    llm_provider_id: Option<String>,
    llm_model_id: Option<String>,
    container_tier_id: Option<String>,
) -> Result<Project, AppError> {
    let client = get_client()?;
    
    let input = CreateProjectInput {
        name,
        description,
        github_url,
        llm_provider_id,
        llm_model_id,
        container_tier_id,
    };
    
    client.create_project(input).await
}

/// Delete a project
#[tauri::command]
pub async fn delete_project(id: String, delete_repo: Option<bool>) -> Result<(), AppError> {
    let client = get_client()?;
    client.delete_project(&id, delete_repo.unwrap_or(true)).await
}

/// Start a project container
#[tauri::command]
pub async fn start_project(id: String) -> Result<Project, AppError> {
    let client = get_client()?;
    client.start_project(&id).await
}

/// Stop a project container
#[tauri::command]
pub async fn stop_project(id: String) -> Result<Project, AppError> {
    let client = get_client()?;
    client.stop_project(&id).await
}

/// Restart a project container
#[tauri::command]
pub async fn restart_project(id: String) -> Result<Project, AppError> {
    let client = get_client()?;
    client.restart_project(&id).await
}

/// Get container logs for a project
#[tauri::command]
pub async fn get_project_logs(id: String, lines: Option<u32>) -> Result<String, AppError> {
    let client = get_client()?;
    client.get_project_logs(&id, lines).await
}

/// Deploy/rebuild a project container
#[tauri::command]
pub async fn deploy_project(id: String, force: Option<bool>) -> Result<DeployResponse, AppError> {
    let client = get_client()?;
    client.deploy_project(&id, force.unwrap_or(false)).await
}

// =============================================================================
// Container Tier Commands
// =============================================================================

/// List all available container tiers
#[tauri::command]
pub async fn list_container_tiers() -> Result<Vec<ContainerTier>, AppError> {
    let client = get_client()?;
    client.list_container_tiers().await
}

/// Get the default container tier
#[tauri::command]
pub async fn get_default_container_tier() -> Result<ContainerTier, AppError> {
    let client = get_client()?;
    client.get_default_container_tier().await
}

// =============================================================================
// Resource Tier Commands (Modular Container System)
// =============================================================================

/// List all available resource tiers
#[tauri::command]
pub async fn list_resource_tiers() -> Result<Vec<ResourceTier>, AppError> {
    let client = get_client()?;
    client.list_resource_tiers().await
}

/// Get the default resource tier
#[tauri::command]
pub async fn get_default_resource_tier() -> Result<ResourceTier, AppError> {
    let client = get_client()?;
    client.get_default_resource_tier().await
}

// =============================================================================
// Container Flavor Commands
// =============================================================================

/// List all available container flavors
#[tauri::command]
pub async fn list_container_flavors() -> Result<Vec<ContainerFlavor>, AppError> {
    let client = get_client()?;
    client.list_container_flavors().await
}

/// Get the default container flavor
#[tauri::command]
pub async fn get_default_container_flavor() -> Result<ContainerFlavor, AppError> {
    let client = get_client()?;
    client.get_default_container_flavor().await
}

// =============================================================================
// Container Addon Commands
// =============================================================================

/// List all available container addons
#[tauri::command]
pub async fn list_container_addons() -> Result<Vec<ContainerAddon>, AppError> {
    let client = get_client()?;
    client.list_container_addons().await
}

/// List non-GPU addons only
#[tauri::command]
pub async fn list_non_gpu_addons() -> Result<Vec<ContainerAddon>, AppError> {
    let client = get_client()?;
    client.list_non_gpu_addons().await
}
