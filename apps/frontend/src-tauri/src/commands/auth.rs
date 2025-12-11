//! Authentication commands for Tauri
//!
//! These commands handle OAuth2 PKCE flow with Keycloak.

use crate::models::AppError;
use crate::services::auth::{
    generate_code_challenge, generate_code_verifier, generate_state,
    AuthData, AuthService, AuthStatus, KeycloakConfig, UserInfo,
};
use tauri::{command, Emitter, Window};
use tauri_plugin_oauth::start;

/// Start the OAuth login flow
/// 
/// Returns the authorization URL that should be opened in a browser.
/// The OAuth plugin starts a local server to receive the callback.
#[command]
pub async fn auth_start_login(window: Window) -> Result<String, AppError> {
    tracing::info!("Starting OAuth login flow");

    // Generate PKCE parameters
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();

    // Start the OAuth callback server
    let port = start(move |url| {
        tracing::info!("OAuth callback received: {}", url);
        // Emit the callback URL to the window
        let _ = window.emit("oauth-callback", url);
    })
    .map_err(|e| AppError::NetworkError(format!("Failed to start OAuth server: {}", e)))?;

    tracing::info!("OAuth server started on port {}", port);

    // Build config with the actual redirect URI
    let config = KeycloakConfig {
        redirect_uri: format!("http://localhost:{}", port),
        ..Default::default()
    };

    // Register the pending flow
    AuthService::register_pending_flow(&state, &code_verifier, port);

    // Build and return the authorization URL
    let auth_url = AuthService::build_auth_url(&config, &state, &code_challenge);

    tracing::info!("Authorization URL: {}", auth_url);
    Ok(auth_url)
}

/// Complete the OAuth flow with the callback URL
/// 
/// Parses the callback URL, extracts the authorization code,
/// exchanges it for tokens, and stores the auth data.
#[command]
pub async fn auth_complete_login(callback_url: String) -> Result<AuthStatus, AppError> {
    tracing::info!("Completing OAuth login with callback URL");

    // Parse the callback URL to extract code and state
    let url = url::Url::parse(&callback_url)
        .map_err(|e| AppError::InvalidConfig(format!("Invalid callback URL: {}", e)))?;

    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    let mut error: Option<String> = None;
    let mut error_description: Option<String> = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.to_string()),
            "state" => state = Some(value.to_string()),
            "error" => error = Some(value.to_string()),
            "error_description" => error_description = Some(value.to_string()),
            _ => {}
        }
    }

    // Check for OAuth errors
    if let Some(err) = error {
        let msg = error_description.unwrap_or_else(|| err.clone());
        return Err(AppError::ApiError(format!("OAuth error: {}", msg)));
    }

    let code = code.ok_or_else(|| AppError::InvalidConfig("Missing authorization code".to_string()))?;
    let state = state.ok_or_else(|| AppError::InvalidConfig("Missing state parameter".to_string()))?;

    // Get the pending flow to find the port
    let flow = AuthService::get_pending_flow(&state)
        .ok_or_else(|| AppError::InvalidConfig("Invalid or expired auth state".to_string()))?;

    // Build config with the correct redirect URI
    let config = KeycloakConfig {
        redirect_uri: format!("http://localhost:{}", flow.port),
        ..Default::default()
    };

    // Exchange code for tokens
    let tokens = AuthService::exchange_code(&config, &code, &flow.code_verifier).await?;

    // Get user info
    let user_info = AuthService::get_user_info(&config, &tokens.access_token).await.ok();

    let now = chrono::Utc::now().timestamp();
    let auth_data = AuthData {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_at: now + tokens.expires_in,
        refresh_expires_at: tokens.refresh_expires_in.map(|e| now + e),
        user_info: user_info.clone(),
    };

    // Save auth data
    AuthService::save_auth_data(&auth_data)?;

    tracing::info!("OAuth login completed successfully");

    Ok(AuthStatus {
        authenticated: true,
        user: user_info,
        expires_at: Some(auth_data.expires_at),
    })
}

/// Get the current authentication status
#[command]
pub fn auth_get_status() -> Result<AuthStatus, AppError> {
    AuthService::get_auth_status()
}

/// Logout the current user
/// 
/// Revokes tokens with Keycloak and clears local auth data.
#[command]
pub async fn auth_logout() -> Result<(), AppError> {
    tracing::info!("Logging out user");

    let config = KeycloakConfig::default();

    // Get refresh token for revocation
    let refresh_token = AuthService::load_auth_data()?
        .and_then(|d| d.refresh_token);

    // Logout from Keycloak
    AuthService::logout(&config, refresh_token.as_deref()).await?;

    tracing::info!("User logged out successfully");
    Ok(())
}

/// Get current user info
#[command]
pub fn auth_get_user() -> Result<Option<UserInfo>, AppError> {
    let auth_data = AuthService::load_auth_data()?;
    Ok(auth_data.and_then(|d| d.user_info))
}

/// Get a valid access token (refreshes if needed)
/// 
/// This is useful for making authenticated API calls.
#[command]
pub async fn auth_get_token() -> Result<String, AppError> {
    let config = KeycloakConfig::default();
    AuthService::get_valid_token(&config).await
}

/// Refresh the access token
/// 
/// Forces a token refresh even if the current token is still valid.
#[command]
pub async fn auth_refresh_token() -> Result<AuthStatus, AppError> {
    tracing::info!("Refreshing access token");

    let config = KeycloakConfig::default();
    
    let auth_data = AuthService::load_auth_data()?
        .ok_or_else(|| AppError::InvalidConfig("Not authenticated".to_string()))?;

    let refresh_token = auth_data.refresh_token
        .ok_or_else(|| AppError::InvalidConfig("No refresh token available".to_string()))?;

    let tokens = AuthService::refresh_tokens(&config, &refresh_token).await?;

    // Get user info
    let user_info = AuthService::get_user_info(&config, &tokens.access_token).await.ok();

    let now = chrono::Utc::now().timestamp();
    let new_auth_data = AuthData {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token.or(Some(refresh_token)),
        id_token: tokens.id_token.or(auth_data.id_token),
        expires_at: now + tokens.expires_in,
        refresh_expires_at: tokens.refresh_expires_in.map(|e| now + e),
        user_info: user_info.clone(),
    };

    AuthService::save_auth_data(&new_auth_data)?;

    tracing::info!("Token refreshed successfully");

    Ok(AuthStatus {
        authenticated: true,
        user: user_info,
        expires_at: Some(new_auth_data.expires_at),
    })
}

/// Check if user is authenticated
#[command]
pub fn auth_is_authenticated() -> Result<bool, AppError> {
    let status = AuthService::get_auth_status()?;
    Ok(status.authenticated)
}
