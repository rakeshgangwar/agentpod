//! API client service for communicating with the Management API
//!
//! This module provides a typed HTTP client for all Management API operations.
//! Authentication is handled via session tokens from Better Auth.

use crate::models::{
    AppError, ConnectionConfig, 
    ContainerFlavor, ContainerFlavorsResponse, ContainerAddon, ContainerAddonsResponse,
    ResourceTier, ResourceTiersResponse,
    ErrorResponse, HealthResponse,
};
use crate::services::auth::AuthService;
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
    
    /// Get a valid auth token (Better Auth session token or legacy API key)
    async fn get_auth_token(&self) -> Option<String> {
        // First try to get Better Auth session token
        match AuthService::get_token() {
            Ok(Some(token)) => {
                tracing::debug!("Using Better Auth session token");
                return Some(token);
            }
            Ok(None) => {
                tracing::debug!("No Better Auth session token available");
            }
            Err(e) => {
                tracing::debug!("Failed to get session token: {}", e);
            }
        }
        
        // Fall back to legacy API key
        if self.api_key.is_some() {
            tracing::debug!("Falling back to legacy API key");
        } else {
            tracing::warn!("No auth token available (no session token and no API key)");
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
    
    /// Get a reference to the SSE client
    pub fn sse_client(&self) -> &Client {
        &self.sse_client
    }
    
    /// Get a reference to the long-running client
    pub fn long_running_client(&self) -> &Client {
        &self.long_running_client
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
    
    /// Make an SSE GET request (returns Response for streaming)
    pub async fn sse_get(&self, path: &str) -> Result<reqwest::Response, AppError> {
        let url = format!("{}{}", self.base_url, path);
        let request = self.add_auth(self.sse_client.get(&url)).await;
        let response = request.send().await?;
        
        if response.status().is_success() {
            Ok(response)
        } else {
            let status = response.status();
            let error_text = response
                .json::<ErrorResponse>()
                .await
                .map(|e| e.error)
                .unwrap_or_else(|_| format!("HTTP {}", status));
            Err(AppError::ApiError(error_text))
        }
    }
    
    /// Create a POST request with a specific client and add auth
    pub async fn add_auth_to_client(&self, client: &Client, url: &str) -> reqwest::RequestBuilder {
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
        } else if status == reqwest::StatusCode::UNAUTHORIZED {
            // 401 Unauthorized - session expired or invalid
            let error_text = response
                .json::<ErrorResponse>()
                .await
                .map(|e| e.error)
                .unwrap_or_else(|_| "Session expired or invalid".to_string());
            
            Err(AppError::Unauthorized(error_text))
        } else if status == reqwest::StatusCode::FORBIDDEN {
            // 403 Forbidden - also treat as unauthorized
            let error_text = response
                .json::<ErrorResponse>()
                .await
                .map(|e| e.error)
                .unwrap_or_else(|_| "Access forbidden".to_string());
            
            Err(AppError::Unauthorized(error_text))
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
}
