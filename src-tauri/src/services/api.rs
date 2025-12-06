//! API client service for communicating with the Management API
//!
//! This module provides a typed HTTP client for all Management API operations.

use crate::models::{
    AppError, AppInfo, ConnectionConfig, CreateProjectInput, ErrorResponse, FileContent, FileNode,
    HealthResponse, Message, OpenCodeHealth, Project, ProjectResponse, ProjectsResponse,
    SendMessageInput, Session, SuccessResponse,
};
use reqwest::Client;
use std::time::Duration;

/// API client for the Management API
pub struct ApiClient {
    client: Client,
    /// Separate client for SSE streams (no timeout)
    sse_client: Client,
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

        // SSE client without timeout for long-lived streams
        let sse_client = Client::builder()
            .build()
            .map_err(|e| AppError::NetworkError(format!("Failed to create SSE client: {}", e)))?;

        Ok(Self {
            client,
            sse_client,
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

    // =========================================================================
    // OpenCode - App Info & Health
    // =========================================================================

    /// Get OpenCode app info for a project
    pub async fn opencode_get_app_info(&self, project_id: &str) -> Result<AppInfo, AppError> {
        let url = format!("{}/api/projects/{}/opencode/app", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Check if OpenCode container is healthy
    pub async fn opencode_health_check(&self, project_id: &str) -> Result<OpenCodeHealth, AppError> {
        let url = format!("{}/api/projects/{}/opencode/health", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // OpenCode - Sessions
    // =========================================================================

    /// List all sessions for a project
    pub async fn opencode_list_sessions(&self, project_id: &str) -> Result<Vec<Session>, AppError> {
        let url = format!("{}/api/projects/{}/opencode/session", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Create a new session for a project
    pub async fn opencode_create_session(&self, project_id: &str) -> Result<Session, AppError> {
        let url = format!("{}/api/projects/{}/opencode/session", self.base_url, project_id);
        let request = self.add_auth(self.client.post(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get a session by ID
    pub async fn opencode_get_session(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Result<Session, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}",
            self.base_url, project_id, session_id
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Delete a session
    pub async fn opencode_delete_session(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Result<(), AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}",
            self.base_url, project_id, session_id
        );
        let request = self.add_auth(self.client.delete(&url));
        let response = request.send().await?;
        let _: SuccessResponse = self.handle_response(response).await?;
        Ok(())
    }

    /// Abort a running session
    pub async fn opencode_abort_session(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Result<(), AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}/abort",
            self.base_url, project_id, session_id
        );
        let request = self.add_auth(self.client.post(&url));
        let response = request.send().await?;
        let _: SuccessResponse = self.handle_response(response).await?;
        Ok(())
    }

    // =========================================================================
    // OpenCode - Messages
    // =========================================================================

    /// List messages in a session
    pub async fn opencode_list_messages(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Result<Vec<Message>, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}/message",
            self.base_url, project_id, session_id
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Send a message to a session
    pub async fn opencode_send_message(
        &self,
        project_id: &str,
        session_id: &str,
        input: SendMessageInput,
    ) -> Result<Message, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}/message",
            self.base_url, project_id, session_id
        );
        let request = self.add_auth(self.client.post(&url)).json(&input);
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get a specific message
    pub async fn opencode_get_message(
        &self,
        project_id: &str,
        session_id: &str,
        message_id: &str,
    ) -> Result<Message, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}/message/{}",
            self.base_url, project_id, session_id, message_id
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // OpenCode - Files
    // =========================================================================

    /// List files in a project directory
    pub async fn opencode_list_files(&self, project_id: &str, path: &str) -> Result<Vec<FileNode>, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/file?path={}",
            self.base_url,
            project_id,
            urlencoding::encode(path)
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get file content
    pub async fn opencode_get_file_content(
        &self,
        project_id: &str,
        path: &str,
    ) -> Result<FileContent, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/file/content?path={}",
            self.base_url,
            project_id,
            urlencoding::encode(path)
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Find files by pattern
    pub async fn opencode_find_files(
        &self,
        project_id: &str,
        pattern: &str,
    ) -> Result<Vec<String>, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/find/file?pattern={}",
            self.base_url,
            project_id,
            urlencoding::encode(pattern)
        );
        let request = self.add_auth(self.client.get(&url));
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // OpenCode - SSE Event Stream
    // =========================================================================

    /// Get the SSE event stream URL for a project
    pub fn opencode_event_stream_url(&self, project_id: &str) -> String {
        format!("{}/api/projects/{}/opencode/event", self.base_url, project_id)
    }

    /// Connect to the SSE event stream and return a response for streaming
    pub async fn opencode_connect_event_stream(
        &self,
        project_id: &str,
    ) -> Result<reqwest::Response, AppError> {
        let url = self.opencode_event_stream_url(project_id);
        let mut request = self.sse_client.get(&url)
            .header("Accept", "text/event-stream");
        
        // Add auth header manually since we're using sse_client
        if let Some(key) = &self.api_key {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
        
        let response = request.send().await?;
        
        if !response.status().is_success() {
            return Err(AppError::ApiError(format!(
                "Failed to connect to event stream: {}",
                response.status()
            )));
        }
        
        Ok(response)
    }
}
