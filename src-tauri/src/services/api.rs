//! API client service for communicating with the Management API
//!
//! This module provides a typed HTTP client for all Management API operations.

use crate::models::{
    AppError, ConnectionConfig, CreateProjectInput, ErrorResponse, HealthResponse, Project,
    ProjectResponse, ProjectsResponse, SuccessResponse,
};
use reqwest::Client;
use std::time::Duration;

/// API client for the Management API
pub struct ApiClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl ApiClient {
    /// Create a new API client with the given configuration
    pub fn new(config: &ConnectionConfig) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::NetworkError(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url: config.api_url.trim_end_matches('/').to_string(),
            api_key: config.api_key.clone(),
        })
    }

    /// Add authorization header if API key is configured
    fn add_auth(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.api_key {
            Some(key) => request.header("Authorization", format!("Bearer {}", key)),
            None => request,
        }
    }

    /// Handle API response, converting errors appropriately
    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, AppError> {
        let status = response.status();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| AppError::ApiError(format!("Failed to parse response: {}", e)))
        } else {
            let error_text = response
                .json::<ErrorResponse>()
                .await
                .map(|e| e.error)
                .unwrap_or_else(|_| format!("HTTP {}", status));

            Err(AppError::ApiError(error_text))
        }
    }

    // =========================================================================
    // Health
    // =========================================================================

    /// Test connection to the Management API
    /// Note: Health endpoint is at /health (not /api/health) and doesn't require auth
    pub async fn health_check(&self) -> Result<HealthResponse, AppError> {
        let url = format!("{}/health", self.base_url);
        let response = self.client.get(&url).send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // Projects
    // =========================================================================

    /// List all projects
    pub async fn list_projects(&self) -> Result<Vec<Project>, AppError> {
        let url = format!("{}/api/projects", self.base_url);
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        let result: ProjectsResponse = self.handle_response(response).await?;
        Ok(result.projects)
    }

    /// Get a single project by ID
    pub async fn get_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}", self.base_url, id);
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Create a new project
    pub async fn create_project(&self, input: CreateProjectInput) -> Result<Project, AppError> {
        let url = format!("{}/api/projects", self.base_url);
        let request = self.add_auth(self.client.post(&url)).json(&input);
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Delete a project
    pub async fn delete_project(&self, id: &str, delete_repo: bool) -> Result<(), AppError> {
        let url = format!("{}/api/projects/{}", self.base_url, id);
        let body = serde_json::json!({ "deleteRepo": delete_repo });
        let request = self.add_auth(self.client.delete(&url)).json(&body);
        let response = request.send().await?;
        let _: SuccessResponse = self.handle_response(response).await?;
        Ok(())
    }

    /// Start a project
    pub async fn start_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/start", self.base_url, id);
        let request = self.add_auth(self.client.post(&url));
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Stop a project
    pub async fn stop_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/stop", self.base_url, id);
        let request = self.add_auth(self.client.post(&url));
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Restart a project
    pub async fn restart_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/restart", self.base_url, id);
        let request = self.add_auth(self.client.post(&url));
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }
}
