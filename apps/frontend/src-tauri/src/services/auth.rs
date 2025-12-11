//! Authentication service for Keycloak OAuth2 PKCE flow
//!
//! This module handles OAuth2 authentication with Keycloak using PKCE
//! (Proof Key for Code Exchange) for secure authorization.
//!
//! Flow:
//! 1. Generate code_verifier and code_challenge
//! 2. Open browser to Keycloak authorization URL
//! 3. Keycloak redirects to localhost with authorization code
//! 4. Exchange code for tokens using code_verifier
//! 5. Store tokens securely and refresh when needed

use crate::models::AppError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use once_cell::sync::Lazy;
use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

// =============================================================================
// Configuration
// =============================================================================

/// Keycloak OAuth2 configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeycloakConfig {
    /// Keycloak realm URL (e.g., https://auth.superchotu.com/realms/agentpod)
    pub realm_url: String,
    /// OAuth2 client ID (agentpod-mobile)
    pub client_id: String,
    /// Redirect URI for OAuth callback (http://localhost:{port})
    pub redirect_uri: String,
    /// Scopes to request
    pub scopes: Vec<String>,
}

impl Default for KeycloakConfig {
    fn default() -> Self {
        Self {
            realm_url: "https://auth.superchotu.com/realms/agentpod".to_string(),
            client_id: "agentpod-mobile".to_string(),
            redirect_uri: "http://localhost:8765".to_string(), // Will be updated with actual port
            scopes: vec!["openid".to_string(), "profile".to_string(), "email".to_string()],
        }
    }
}

// =============================================================================
// Token Types
// =============================================================================

/// OAuth2 token response from Keycloak
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub refresh_expires_in: Option<i64>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub id_token: Option<String>,
}

/// Stored authentication data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthData {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_at: i64, // Unix timestamp
    pub refresh_expires_at: Option<i64>,
    pub user_info: Option<UserInfo>,
}

/// User information from Keycloak
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub sub: String, // Subject (user ID)
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub name: Option<String>,
    pub preferred_username: Option<String>,
}

/// Auth status for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub user: Option<UserInfo>,
    pub expires_at: Option<i64>,
}

// =============================================================================
// PKCE
// =============================================================================

/// Generate a random code verifier for PKCE (43-128 characters)
pub fn generate_code_verifier() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

/// Generate code challenge from code verifier using SHA256
pub fn generate_code_challenge(code_verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

/// Generate a random state parameter to prevent CSRF
pub fn generate_state() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

// =============================================================================
// Auth Flow State
// =============================================================================

/// Pending OAuth flow state
#[derive(Debug, Clone)]
pub struct PendingAuthFlow {
    pub state: String,
    pub code_verifier: String,
    pub port: u16,
    pub created_at: std::time::Instant,
}

// Global state for pending auth flows (thread-safe)
static PENDING_FLOWS: Lazy<Mutex<HashMap<String, PendingAuthFlow>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// =============================================================================
// Auth Service
// =============================================================================

const SERVICE_NAME: &str = "agentpod";
const AUTH_KEY: &str = "auth_tokens";

/// Authentication service for Keycloak
pub struct AuthService;

impl AuthService {
    // =========================================================================
    // Storage
    // =========================================================================

    /// Get the auth file path
    fn get_auth_path() -> Result<PathBuf, AppError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| AppError::StorageError("Could not find config directory".to_string()))?;

        let app_config_dir = config_dir.join("agentpod");
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir)
                .map_err(|e| AppError::StorageError(format!("Failed to create config dir: {}", e)))?;
        }

        Ok(app_config_dir.join("auth.json"))
    }

    /// Save auth data to secure storage
    pub fn save_auth_data(data: &AuthData) -> Result<(), AppError> {
        let json = serde_json::to_string(data)?;

        // Save to file
        let path = Self::get_auth_path()?;
        fs::write(&path, &json)
            .map_err(|e| AppError::StorageError(format!("Failed to write auth file: {}", e)))?;

        // Also try keyring for extra security
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            let _ = entry.set_password(&json);
        }

        Ok(())
    }

    /// Load auth data from storage
    pub fn load_auth_data() -> Result<Option<AuthData>, AppError> {
        // Try file first
        let path = Self::get_auth_path()?;

        if path.exists() {
            let json = fs::read_to_string(&path)
                .map_err(|e| AppError::StorageError(format!("Failed to read auth file: {}", e)))?;
            let data: AuthData = serde_json::from_str(&json)?;
            return Ok(Some(data));
        }

        // Fallback to keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            if let Ok(json) = entry.get_password() {
                let data: AuthData = serde_json::from_str(&json)?;
                return Ok(Some(data));
            }
        }

        Ok(None)
    }

    /// Delete auth data
    pub fn delete_auth_data() -> Result<(), AppError> {
        // Delete from keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            let _ = entry.delete_credential();
        }

        // Delete file
        if let Ok(path) = Self::get_auth_path() {
            let _ = fs::remove_file(path);
        }

        Ok(())
    }

    // =========================================================================
    // Auth Flow Management
    // =========================================================================

    /// Register a pending auth flow
    pub fn register_pending_flow(state: &str, code_verifier: &str, port: u16) {
        let flow = PendingAuthFlow {
            state: state.to_string(),
            code_verifier: code_verifier.to_string(),
            port,
            created_at: std::time::Instant::now(),
        };

        let mut flows = PENDING_FLOWS.lock().unwrap();

        // Clean up old flows (> 10 minutes)
        flows.retain(|_, f| f.created_at.elapsed().as_secs() < 600);

        flows.insert(state.to_string(), flow);
    }

    /// Get and remove a pending auth flow
    pub fn get_pending_flow(state: &str) -> Option<PendingAuthFlow> {
        let mut flows = PENDING_FLOWS.lock().unwrap();
        flows.remove(state)
    }

    /// Clear all pending flows
    pub fn clear_pending_flows() {
        let mut flows = PENDING_FLOWS.lock().unwrap();
        flows.clear();
    }

    // =========================================================================
    // URL Generation
    // =========================================================================

    /// Build the authorization URL for Keycloak
    pub fn build_auth_url(config: &KeycloakConfig, state: &str, code_challenge: &str) -> String {
        let scopes = config.scopes.join(" ");

        format!(
            "{}/protocol/openid-connect/auth?client_id={}&redirect_uri={}&response_type=code&state={}&code_challenge={}&code_challenge_method=S256&scope={}",
            config.realm_url,
            urlencoding::encode(&config.client_id),
            urlencoding::encode(&config.redirect_uri),
            urlencoding::encode(state),
            urlencoding::encode(code_challenge),
            urlencoding::encode(&scopes),
        )
    }

    // =========================================================================
    // Token Exchange
    // =========================================================================

    /// Exchange authorization code for tokens
    pub async fn exchange_code(
        config: &KeycloakConfig,
        code: &str,
        code_verifier: &str,
    ) -> Result<TokenResponse, AppError> {
        let token_url = format!("{}/protocol/openid-connect/token", config.realm_url);

        let client = reqwest::Client::new();
        let response = client
            .post(&token_url)
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", &config.client_id),
                ("code", code),
                ("redirect_uri", &config.redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("Token exchange failed: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ApiError(format!(
                "Token exchange failed: {}",
                error_text
            )));
        }

        let tokens: TokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::ApiError(format!("Failed to parse token response: {}", e)))?;

        Ok(tokens)
    }

    /// Refresh tokens using refresh_token
    pub async fn refresh_tokens(
        config: &KeycloakConfig,
        refresh_token: &str,
    ) -> Result<TokenResponse, AppError> {
        let token_url = format!("{}/protocol/openid-connect/token", config.realm_url);

        let client = reqwest::Client::new();
        let response = client
            .post(&token_url)
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", &config.client_id),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("Token refresh failed: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ApiError(format!(
                "Token refresh failed: {}",
                error_text
            )));
        }

        let tokens: TokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::ApiError(format!("Failed to parse token response: {}", e)))?;

        Ok(tokens)
    }

    // =========================================================================
    // User Info
    // =========================================================================

    /// Get user info from Keycloak
    pub async fn get_user_info(
        config: &KeycloakConfig,
        access_token: &str,
    ) -> Result<UserInfo, AppError> {
        let userinfo_url = format!("{}/protocol/openid-connect/userinfo", config.realm_url);

        let client = reqwest::Client::new();
        let response = client
            .get(&userinfo_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("UserInfo request failed: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ApiError(format!(
                "UserInfo request failed: {}",
                error_text
            )));
        }

        let user_info: UserInfo = response
            .json()
            .await
            .map_err(|e| AppError::ApiError(format!("Failed to parse userinfo response: {}", e)))?;

        Ok(user_info)
    }

    // =========================================================================
    // Logout
    // =========================================================================

    /// Logout from Keycloak (revoke tokens)
    pub async fn logout(
        config: &KeycloakConfig,
        refresh_token: Option<&str>,
    ) -> Result<(), AppError> {
        if let Some(token) = refresh_token {
            let logout_url = format!("{}/protocol/openid-connect/logout", config.realm_url);

            let client = reqwest::Client::new();
            let _ = client
                .post(&logout_url)
                .form(&[
                    ("client_id", config.client_id.as_str()),
                    ("refresh_token", token),
                ])
                .send()
                .await;
        }

        // Clear local auth data
        Self::delete_auth_data()?;

        Ok(())
    }

    // =========================================================================
    // Token Validation
    // =========================================================================

    /// Check if access token is expired or expiring soon (within 60 seconds)
    pub fn is_token_expired(auth_data: &AuthData) -> bool {
        let now = chrono::Utc::now().timestamp();
        auth_data.expires_at < now + 60
    }

    /// Check if refresh token is valid
    pub fn is_refresh_valid(auth_data: &AuthData) -> bool {
        if let Some(refresh_expires_at) = auth_data.refresh_expires_at {
            let now = chrono::Utc::now().timestamp();
            refresh_expires_at > now
        } else {
            // If no expiry is set, assume refresh token is valid if it exists
            auth_data.refresh_token.is_some()
        }
    }

    // =========================================================================
    // High-Level Operations
    // =========================================================================

    /// Get a valid access token, refreshing if necessary
    pub async fn get_valid_token(config: &KeycloakConfig) -> Result<String, AppError> {
        let auth_data = Self::load_auth_data()?
            .ok_or_else(|| AppError::InvalidConfig("Not authenticated".to_string()))?;

        // If token is still valid, return it
        if !Self::is_token_expired(&auth_data) {
            return Ok(auth_data.access_token);
        }

        // Try to refresh
        if let Some(refresh_token) = &auth_data.refresh_token {
            if Self::is_refresh_valid(&auth_data) {
                let tokens = Self::refresh_tokens(config, refresh_token).await?;
                let now = chrono::Utc::now().timestamp();

                let new_auth_data = AuthData {
                    access_token: tokens.access_token.clone(),
                    refresh_token: tokens.refresh_token.or(auth_data.refresh_token),
                    id_token: tokens.id_token.or(auth_data.id_token),
                    expires_at: now + tokens.expires_in,
                    refresh_expires_at: tokens.refresh_expires_in.map(|e| now + e),
                    user_info: auth_data.user_info,
                };

                Self::save_auth_data(&new_auth_data)?;
                return Ok(new_auth_data.access_token);
            }
        }

        Err(AppError::InvalidConfig("Token expired and cannot refresh".to_string()))
    }

    /// Get current auth status
    pub fn get_auth_status() -> Result<AuthStatus, AppError> {
        match Self::load_auth_data()? {
            Some(auth_data) => {
                let is_expired = Self::is_token_expired(&auth_data);
                let can_refresh = Self::is_refresh_valid(&auth_data);

                Ok(AuthStatus {
                    authenticated: !is_expired || can_refresh,
                    user: auth_data.user_info,
                    expires_at: Some(auth_data.expires_at),
                })
            }
            None => Ok(AuthStatus {
                authenticated: false,
                user: None,
                expires_at: None,
            }),
        }
    }

    /// Complete the OAuth flow after receiving callback
    pub async fn complete_auth_flow(
        config: &KeycloakConfig,
        code: &str,
        state: &str,
    ) -> Result<AuthData, AppError> {
        // Get the pending flow
        let flow = Self::get_pending_flow(state)
            .ok_or_else(|| AppError::InvalidConfig("Invalid or expired auth state".to_string()))?;

        // Exchange code for tokens
        let tokens = Self::exchange_code(config, code, &flow.code_verifier).await?;

        // Get user info
        let user_info = Self::get_user_info(config, &tokens.access_token).await.ok();

        let now = chrono::Utc::now().timestamp();
        let auth_data = AuthData {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            id_token: tokens.id_token,
            expires_at: now + tokens.expires_in,
            refresh_expires_at: tokens.refresh_expires_in.map(|e| now + e),
            user_info,
        };

        // Save auth data
        Self::save_auth_data(&auth_data)?;

        Ok(auth_data)
    }
}
