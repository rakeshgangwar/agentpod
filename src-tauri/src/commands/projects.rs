//! Project management commands
//!
//! Commands for CRUD operations and container control for projects.

use crate::models::{AppError, CreateProjectInput, Project};
use crate::services::{api::ApiClient, storage::StorageService};

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    let config = StorageService::load_config()?
        .ok_or(AppError::NotConnected)?;
    ApiClient::new(&config)
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
) -> Result<Project, AppError> {
    let client = get_client()?;
    
    let input = CreateProjectInput {
        name,
        description,
        github_url,
        llm_provider_id,
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
