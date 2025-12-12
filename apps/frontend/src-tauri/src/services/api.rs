//! API client service for communicating with the Management API
//!
//! This module provides a typed HTTP client for all Management API operations.
//! Authentication is handled via OAuth tokens from Keycloak.

use crate::models::{
    AppError, AppInfo, ConnectionConfig, ContainerTier, ContainerTiersResponse, 
    ContainerFlavor, ContainerFlavorsResponse, ContainerAddon, ContainerAddonsResponse,
    ResourceTier, ResourceTiersResponse,
    CreateProjectInput, DeployResponse, ErrorResponse, FileContent, FileNode, 
    HealthResponse, Message, OpenCodeHealth, Project, ProjectResponse, 
    ProjectsResponse, SendMessageInput, Session, SuccessResponse,
};
use crate::services::auth::{AuthService, KeycloakConfig};
use reqwest::Client;
use std::time::Duration;

/// API client for the Management API
pub struct ApiClient {
    client: Client,
    /// Separate client for SSE streams (no timeout)
    sse_client: Client,
    /// Separate client for long-running operations (5 minute timeout)
    long_running_client: Client,
    base_url: String,
    /// Legacy API key (for backward compatibility)
    api_key: Option<String>,
}

impl ApiClient {
    /// Create a new API client using stored connection config
    /// 
    /// This is a convenience method that loads the connection config from storage.
    pub fn new() -> Result<Self, AppError> {
        let config = crate::services::StorageService::load_config()?
            .ok_or_else(|| AppError::InvalidConfig("No connection configured".to_string()))?;
        Self::with_config(&config)
    }
    
    /// Create a new API client with the given configuration
    pub fn with_config(config: &ConnectionConfig) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::NetworkError(format!("Failed to create HTTP client: {}", e)))?;

        // SSE client without timeout for long-lived streams
        let sse_client = Client::builder()
            .build()
            .map_err(|e| AppError::NetworkError(format!("Failed to create SSE client: {}", e)))?;

        // Long-running client for operations like sending messages to LLMs
        // LLM responses can take several minutes depending on model and complexity
        let long_running_client = Client::builder()
            .timeout(Duration::from_secs(300)) // 5 minute timeout
            .build()
            .map_err(|e| AppError::NetworkError(format!("Failed to create long-running client: {}", e)))?;

        Ok(Self {
            client,
            sse_client,
            long_running_client,
            base_url: config.api_url.trim_end_matches('/').to_string(),
            api_key: config.api_key.clone(),
        })
    }
    
    /// Get a valid auth token (OAuth or legacy API key)
    async fn get_auth_token(&self) -> Option<String> {
        // First try to get OAuth token
        let keycloak_config = KeycloakConfig::default();
        match AuthService::get_valid_token(&keycloak_config).await {
            Ok(token) => {
                tracing::info!("Using OAuth token (length: {})", token.len());
                return Some(token);
            }
            Err(e) => {
                tracing::debug!("OAuth token not available: {}", e);
            }
        }
        
        // Fall back to legacy API key
        if self.api_key.is_some() {
            tracing::info!("Falling back to legacy API key");
        } else {
            tracing::warn!("No auth token available (no OAuth token and no API key)");
        }
        self.api_key.clone()
    }
    
    /// Get the base URL
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
    
    /// Get a reference to the HTTP client
    pub fn client(&self) -> &Client {
        &self.client
    }
    
    /// Make a GET request to the API
    pub async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, AppError> {
        let url = format!("{}{}", self.base_url, path);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }
    
    /// Make a POST request to the API
    pub async fn post<T: serde::de::DeserializeOwned, B: serde::Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AppError> {
        let url = format!("{}{}", self.base_url, path);
        let request = self.add_auth(self.client.post(&url)).await.json(body);
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Make a PUT request to the API
    pub async fn put<T: serde::de::DeserializeOwned, B: serde::Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AppError> {
        let url = format!("{}{}", self.base_url, path);
        let request = self.add_auth(self.client.put(&url)).await.json(body);
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Make a DELETE request to the API
    pub async fn delete<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, AppError> {
        let url = format!("{}{}", self.base_url, path);
        let request = self.add_auth(self.client.delete(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Add authorization header (uses OAuth token or legacy API key)
    pub async fn add_auth_header(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        self.add_auth(request).await
    }

    /// Add authorization header (internal, async)
    async fn add_auth(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.get_auth_token().await {
            Some(token) => request.header("Authorization", format!("Bearer {}", token)),
            None => request,
        }
    }
    
    /// Create a POST request with a specific client and add auth
    async fn add_auth_to_client(&self, client: &Client, url: &str) -> reqwest::RequestBuilder {
        let request = client.post(url);
        self.add_auth(request).await
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
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ProjectsResponse = self.handle_response(response).await?;
        Ok(result.projects)
    }

    /// Get a single project by ID
    pub async fn get_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}", self.base_url, id);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Create a new project
    pub async fn create_project(&self, input: CreateProjectInput) -> Result<Project, AppError> {
        let url = format!("{}/api/projects", self.base_url);
        let request = self.add_auth(self.client.post(&url)).await.json(&input);
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Delete a project
    pub async fn delete_project(&self, id: &str, delete_repo: bool) -> Result<(), AppError> {
        let url = format!("{}/api/projects/{}", self.base_url, id);
        let body = serde_json::json!({ "deleteRepo": delete_repo });
        let request = self.add_auth(self.client.delete(&url)).await.json(&body);
        let response = request.send().await?;
        let _: SuccessResponse = self.handle_response(response).await?;
        Ok(())
    }

    /// Start a project
    pub async fn start_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/start", self.base_url, id);
        let request = self.add_auth(self.client.post(&url)).await;
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Stop a project
    pub async fn stop_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/stop", self.base_url, id);
        let request = self.add_auth(self.client.post(&url)).await;
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Restart a project
    pub async fn restart_project(&self, id: &str) -> Result<Project, AppError> {
        let url = format!("{}/api/projects/{}/restart", self.base_url, id);
        let request = self.add_auth(self.client.post(&url)).await;
        let response = request.send().await?;
        let result: ProjectResponse = self.handle_response(response).await?;
        Ok(result.project)
    }

    /// Get container logs for a project
    pub async fn get_project_logs(&self, id: &str, lines: Option<u32>) -> Result<String, AppError> {
        let lines = lines.unwrap_or(100);
        let url = format!("{}/api/projects/{}/logs?lines={}", self.base_url, id, lines);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        
        #[derive(serde::Deserialize)]
        struct LogsResponse {
            logs: String,
        }
        
        let result: LogsResponse = self.handle_response(response).await?;
        Ok(result.logs)
    }

    /// Deploy/rebuild a project container
    pub async fn deploy_project(&self, id: &str, force: bool) -> Result<DeployResponse, AppError> {
        let url = format!("{}/api/projects/{}/deploy", self.base_url, id);
        let body = serde_json::json!({ "force": force });
        let request = self.add_auth(self.client.post(&url)).await.json(&body);
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // Container Tiers
    // =========================================================================

    /// List all available container tiers
    pub async fn list_container_tiers(&self) -> Result<Vec<ContainerTier>, AppError> {
        let url = format!("{}/api/container-tiers", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ContainerTiersResponse = self.handle_response(response).await?;
        Ok(result.tiers)
    }

    /// Get the default container tier
    pub async fn get_default_container_tier(&self) -> Result<ContainerTier, AppError> {
        let url = format!("{}/api/container-tiers/default", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // Resource Tiers (Modular Container System)
    // =========================================================================

    /// List all available resource tiers
    pub async fn list_resource_tiers(&self) -> Result<Vec<ResourceTier>, AppError> {
        let url = format!("{}/api/resource-tiers", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ResourceTiersResponse = self.handle_response(response).await?;
        Ok(result.tiers)
    }

    /// Get the default resource tier
    pub async fn get_default_resource_tier(&self) -> Result<ResourceTier, AppError> {
        let url = format!("{}/api/resource-tiers/default", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // Container Flavors
    // =========================================================================

    /// List all available container flavors
    pub async fn list_container_flavors(&self) -> Result<Vec<ContainerFlavor>, AppError> {
        let url = format!("{}/api/flavors", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ContainerFlavorsResponse = self.handle_response(response).await?;
        Ok(result.flavors)
    }

    /// Get the default container flavor
    pub async fn get_default_container_flavor(&self) -> Result<ContainerFlavor, AppError> {
        let url = format!("{}/api/flavors/default", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // Container Addons
    // =========================================================================

    /// List all available container addons
    pub async fn list_container_addons(&self) -> Result<Vec<ContainerAddon>, AppError> {
        let url = format!("{}/api/addons", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ContainerAddonsResponse = self.handle_response(response).await?;
        Ok(result.addons)
    }

    /// Get non-GPU addons only
    pub async fn list_non_gpu_addons(&self) -> Result<Vec<ContainerAddon>, AppError> {
        let url = format!("{}/api/addons/non-gpu", self.base_url);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        let result: ContainerAddonsResponse = self.handle_response(response).await?;
        Ok(result.addons)
    }

    // =========================================================================
    // OpenCode - App Info & Health
    // =========================================================================

    /// Get OpenCode app info for a project
    pub async fn opencode_get_app_info(&self, project_id: &str) -> Result<AppInfo, AppError> {
        let url = format!("{}/api/projects/{}/opencode/app", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Check if OpenCode container is healthy
    pub async fn opencode_health_check(&self, project_id: &str) -> Result<OpenCodeHealth, AppError> {
        let url = format!("{}/api/projects/{}/opencode/health", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get configured LLM providers and their models for a project
    pub async fn opencode_get_providers(&self, project_id: &str) -> Result<serde_json::Value, AppError> {
        let url = format!("{}/api/projects/{}/opencode/providers", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    // =========================================================================
    // OpenCode - Sessions
    // =========================================================================

    /// List all sessions for a project
    pub async fn opencode_list_sessions(&self, project_id: &str) -> Result<Vec<Session>, AppError> {
        let url = format!("{}/api/projects/{}/opencode/session", self.base_url, project_id);
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Create a new session for a project
    pub async fn opencode_create_session(&self, project_id: &str) -> Result<Session, AppError> {
        let url = format!("{}/api/projects/{}/opencode/session", self.base_url, project_id);
        let request = self.add_auth(self.client.post(&url)).await;
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
        let request = self.add_auth(self.client.get(&url)).await;
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
        let request = self.add_auth(self.client.delete(&url)).await;
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
        let request = self.add_auth(self.client.post(&url)).await;
        let response = request.send().await?;
        let _: SuccessResponse = self.handle_response(response).await?;
        Ok(())
    }

    // =========================================================================
    // OpenCode - Permissions
    // =========================================================================

    /// Respond to a permission request
    ///
    /// When a tool requires user approval (permission is set to "ask"), OpenCode will
    /// pause and emit a permission.updated event. This method responds to that request.
    ///
    /// # Arguments
    /// * `project_id` - The project ID
    /// * `session_id` - The session ID where the permission was requested
    /// * `permission_id` - The permission request ID
    /// * `response` - The response: "once" (allow this time), "always" (allow pattern), "reject" (deny)
    ///
    /// # Returns
    /// * `Ok(true)` - Permission was successfully responded to
    /// * `Err(_)` - Failed to respond to permission
    pub async fn opencode_respond_permission(
        &self,
        project_id: &str,
        session_id: &str,
        permission_id: &str,
        response: &str,
    ) -> Result<bool, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/session/{}/permissions/{}",
            self.base_url, project_id, session_id, permission_id
        );
        let body = serde_json::json!({ "response": response });
        let request = self.add_auth(self.client.post(&url)).await.json(&body);
        let resp = request.send().await?;
        let _: SuccessResponse = self.handle_response(resp).await?;
        Ok(true)
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
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Send a message to a session
    /// 
    /// Uses a longer timeout (5 minutes) since LLM responses can take
    /// a significant amount of time depending on model and complexity.
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
        // Use long_running_client for message sending as LLM responses can take minutes
        let request = self.add_auth_to_client(&self.long_running_client, &url).await
            .json(&input);
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
        let request = self.add_auth(self.client.get(&url)).await;
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
        let request = self.add_auth(self.client.get(&url)).await;
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
        let request = self.add_auth(self.client.get(&url)).await;
        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Find files by query
    pub async fn opencode_find_files(
        &self,
        project_id: &str,
        query: &str,
    ) -> Result<Vec<String>, AppError> {
        let url = format!(
            "{}/api/projects/{}/opencode/find/file?query={}",
            self.base_url,
            project_id,
            urlencoding::encode(query)
        );
        let request = self.add_auth(self.client.get(&url)).await;
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
        
        // Add auth header - use OAuth token if available, fall back to API key
        if let Some(token) = self.get_auth_token().await {
            request = request.header("Authorization", format!("Bearer {}", token));
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
