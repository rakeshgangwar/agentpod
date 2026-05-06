use agentpod_tui::api::ApiClient;
use agentpod_tui::app::{App, View};
use agentpod_tui::cli::Cli;
use agentpod_tui::config::Config;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use serde_json::json;
use tempfile::tempdir;
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, body_json};

fn create_test_app() -> App {
    let config = Config::default();
    let cli = Cli {
        api_url: None,
        token: None,
        config: None,
        embedded_terminal: false,
        debug: false,
        sandbox: None,
    };
    App::new(config, cli)
}

fn create_test_app_with_api_url(api_url: String, config_path: std::path::PathBuf) -> App {
    let config = Config::default();
    let cli = Cli {
        api_url: Some(api_url),
        token: None,
        config: Some(config_path),
        embedded_terminal: false,
        debug: false,
        sandbox: None,
    };
    App::new(config, cli)
}

#[tokio::test]
async fn test_login_success() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/auth/sign-in/email"))
        .and(body_json(json!({
            "email": "test@example.com",
            "password": "password123"
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt-token-123",
            "user": {
                "id": "user-1",
                "email": "test@example.com",
                "name": "Test User"
            }
        })))
        .mount(&mock_server)
        .await;

    let client = ApiClient::new(&mock_server.uri(), None);
    let result = client.login("test@example.com", "password123").await.unwrap();

    assert_eq!(result.token, "jwt-token-123");
    assert_eq!(result.user.id, "user-1");
    assert_eq!(result.user.email, "test@example.com");
    assert_eq!(result.user.name, Some("Test User".to_string()));
}

#[tokio::test]
async fn test_login_invalid_credentials() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/auth/sign-in/email"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({
            "error": "Invalid email or password"
        })))
        .mount(&mock_server)
        .await;

    let client = ApiClient::new(&mock_server.uri(), None);
    let result = client.login("test@example.com", "wrongpassword").await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("401"));
}

#[tokio::test]
async fn test_login_network_error() {
    let client = ApiClient::new("http://localhost:9999", None);
    let result = client.login("test@example.com", "password123").await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_login_form_submission() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_email = "test@example.com".to_string();
    app.login_password = "password123".to_string();

    // Simulate Enter key press
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    // Should stay on login (since we're not connected to a real server)
    assert_eq!(app.active_view, View::Login);
    // Should have an error message
    assert!(app.login_error.is_some());
}

#[tokio::test]
async fn test_login_form_submission_success_persists_token() {
    let mock_server = MockServer::start().await;
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    Mock::given(method("POST"))
        .and(path("/api/auth/sign-in/email"))
        .and(body_json(json!({
            "email": "test@example.com",
            "password": "password123"
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "persisted-token-123",
            "user": {
                "id": "user-1",
                "email": "test@example.com",
                "name": "Test User"
            }
        })))
        .mount(&mock_server)
        .await;

    let mut app = create_test_app_with_api_url(mock_server.uri(), config_path.clone());
    app.active_view = View::Login;
    app.login_email = "test@example.com".to_string();
    app.login_password = "password123".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::Dashboard);
    assert!(app.connected);
    assert!(app.api.has_token());
    assert_eq!(app.login_password, "");
    assert!(app.login_error.is_none());

    let saved_config = Config::load(Some(&config_path)).unwrap();
    assert_eq!(
        saved_config.connection.api_token,
        Some("persisted-token-123".to_string())
    );
}

#[tokio::test]
async fn test_login_form_submission_error_keeps_login_and_does_not_persist_token() {
    let mock_server = MockServer::start().await;
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    Mock::given(method("POST"))
        .and(path("/api/auth/sign-in/email"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({
            "error": "Invalid email or password"
        })))
        .mount(&mock_server)
        .await;

    let mut app = create_test_app_with_api_url(mock_server.uri(), config_path.clone());
    app.active_view = View::Login;
    app.login_email = "test@example.com".to_string();
    app.login_password = "wrongpassword".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::Login);
    assert!(!app.connected);
    assert!(!app.api.has_token());
    assert_eq!(app.login_password, "");
    assert!(app.login_error.as_ref().unwrap().contains("401"));

    let saved_config = Config::load(Some(&config_path)).unwrap();
    assert_eq!(saved_config.connection.api_token, None);
}

#[tokio::test]
async fn test_login_form_empty_email() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_email = "".to_string();
    app.login_password = "password123".to_string();

    // Simulate Enter key press
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    // Should have validation error
    assert!(app.login_error.is_some());
    assert!(app.login_error.unwrap().contains("email"));
}

#[tokio::test]
async fn test_login_form_empty_password() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_email = "test@example.com".to_string();
    app.login_password = "".to_string();

    // Simulate Enter key press
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    // Should have validation error
    assert!(app.login_error.is_some());
    assert!(app.login_error.unwrap().contains("password"));
}

#[tokio::test]
async fn test_login_switch_to_dashboard_on_success() {
    let mut app = create_test_app();
    app.active_view = View::Login;

    // Simulate successful login result
    app.handle_api_result(agentpod_tui::event::ApiResult::LoginSuccess {
        token: "new-token".to_string(),
    });

    assert_eq!(app.active_view, View::Dashboard);
    assert!(app.api.has_token());
    assert!(app.connected);
    assert!(app.login_error.is_none());
}

#[tokio::test]
async fn test_login_stay_on_error() {
    let mut app = create_test_app();
    app.active_view = View::Login;

    // Simulate failed login result
    app.handle_api_result(agentpod_tui::event::ApiResult::LoginError {
        message: "Invalid credentials".to_string(),
    });

    assert_eq!(app.active_view, View::Login);
    assert!(!app.connected);
    assert_eq!(app.login_error, Some("Invalid credentials".to_string()));
}

#[tokio::test]
async fn test_login_clears_previous_error() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_error = Some("Previous error".to_string());

    // Simulate successful login result
    app.handle_api_result(agentpod_tui::event::ApiResult::LoginSuccess {
        token: "new-token".to_string(),
    });

    assert!(app.login_error.is_none());
}

#[tokio::test]
async fn test_login_preserves_email_on_error() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_email = "test@example.com".to_string();
    app.login_password = "wrongpassword".to_string();

    // Simulate failed login
    app.handle_api_result(agentpod_tui::event::ApiResult::LoginError {
        message: "Invalid credentials".to_string(),
    });

    // Email should be preserved
    assert_eq!(app.login_email, "test@example.com");
    // Password should be cleared for security
    assert_eq!(app.login_password, "");
}
