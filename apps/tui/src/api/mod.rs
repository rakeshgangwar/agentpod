use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub mod auth;
pub mod sandboxes;

/// API client for AgentPod Management API
#[derive(Debug, Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
    token: Option<String>,
}

/// Standard API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub data: Option<T>,
    pub error: Option<String>,
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

impl ApiClient {
    pub fn new(base_url: &str, token: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    /// Set or update the authentication token
    pub fn set_token(&mut self, token: Option<String>) {
        self.token = token;
    }

    /// Get the base URL
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Check if we have a token
    pub fn has_token(&self) -> bool {
        self.token.is_some()
    }

    /// Make a GET request
    pub async fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.get(&url);

        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("GET {}", url))?;

        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            anyhow::bail!("API error ({}): {}", status, text);
        }

        serde_json::from_str(&text).with_context(|| format!("Failed to parse response from GET {}", url))
    }

    /// Make a POST request
    pub async fn post<T: for<'de> Deserialize<'de>, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.post(&url).json(body);

        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("POST {}", url))?;

        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            anyhow::bail!("API error ({}): {}", status, text);
        }

        serde_json::from_str(&text).with_context(|| format!("Failed to parse response from POST {}", url))
    }

    /// Make a DELETE request
    pub async fn delete(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.delete(&url);

        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("DELETE {}", url))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            anyhow::bail!("API error ({}): {}", status, text);
        }

        Ok(())
    }

    /// Health check
    pub async fn health(&self) -> Result<HealthResponse> {
        self.get("/health").await
    }

    /// Test connection
    pub async fn test_connection(&self) -> Result<bool> {
        match self.health().await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}
