use agentpod_tui::app::{App, View};
use agentpod_tui::cli::Cli;
use agentpod_tui::config::Config;
use agentpod_tui::types::{Sandbox, SandboxStatus};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn sandbox(id: &str, name: &str, status: SandboxStatus) -> Sandbox {
    Sandbox {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        status,
        container_id: None,
        git_url: None,
        flavor_id: Some("fullstack".to_string()),
        resource_tier_id: Some("builder".to_string()),
        created_at: "2024-01-01T00:00:00Z".to_string(),
        updated_at: "2024-01-01T00:00:00Z".to_string(),
    }
}

fn create_test_app(api_url: String) -> App {
    let config = Config::default();
    let cli = Cli {
        api_url: Some(api_url),
        token: Some("test-token".to_string()),
        config: None,
        embedded_terminal: false,
        debug: false,
        sandbox: None,
    };

    App::new(config, cli)
}

#[tokio::test]
async fn test_dashboard_refresh_loads_sandboxes_from_api() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/v2/sandboxes"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "sandboxes": [{
                "id": "sb-1",
                "name": "Loaded Sandbox",
                "description": null,
                "status": "running",
                "container_id": null,
                "git_url": null,
                "flavor_id": "fullstack",
                "resource_tier_id": "builder",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z"
            }]
        })))
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes_loaded = false;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE))
        .await;

    assert!(app.sandboxes_loaded);
    assert_eq!(app.sandboxes.len(), 1);
    assert_eq!(app.sandboxes[0].name, "Loaded Sandbox");
    assert_eq!(app.sandboxes[0].status, SandboxStatus::Running);
}

#[tokio::test]
async fn test_dashboard_start_selected_sandbox_updates_local_status() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes/sb-1/start"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "success": true })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![sandbox("sb-1", "Stopped Sandbox", SandboxStatus::Stopped)];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.sandboxes[0].status, SandboxStatus::Running);
}

#[tokio::test]
async fn test_dashboard_stop_selected_sandbox_updates_local_status() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes/sb-1/stop"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "success": true })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![sandbox("sb-1", "Running Sandbox", SandboxStatus::Running)];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.sandboxes[0].status, SandboxStatus::Stopped);
}

#[tokio::test]
async fn test_dashboard_restart_selected_sandbox_updates_local_status() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes/sb-1/restart"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "success": true })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![sandbox("sb-1", "Running Sandbox", SandboxStatus::Running)];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('R'), KeyModifiers::SHIFT))
        .await;

    assert_eq!(app.sandboxes[0].status, SandboxStatus::Running);
}

#[tokio::test]
async fn test_dashboard_pause_selected_sandbox_updates_local_status() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes/sb-1/pause"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "success": true })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![sandbox("sb-1", "Running Sandbox", SandboxStatus::Running)];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('p'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.sandboxes[0].status, SandboxStatus::Paused);
}

#[tokio::test]
async fn test_dashboard_unpause_selected_sandbox_updates_local_status() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes/sb-1/unpause"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "success": true })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![sandbox("sb-1", "Paused Sandbox", SandboxStatus::Paused)];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('u'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.sandboxes[0].status, SandboxStatus::Running);
}

#[tokio::test]
async fn test_dashboard_delete_selected_sandbox_removes_it_from_list() {
    let mock_server = MockServer::start().await;

    Mock::given(method("DELETE"))
        .and(path("/api/v2/sandboxes/sb-1"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = create_test_app(mock_server.uri());
    app.active_view = View::Dashboard;
    app.sandboxes = vec![
        sandbox("sb-1", "Delete Me", SandboxStatus::Stopped),
        sandbox("sb-2", "Keep Me", SandboxStatus::Stopped),
    ];
    app.selected_sandbox = 0;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('d'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.sandboxes.len(), 1);
    assert_eq!(app.sandboxes[0].id, "sb-2");
    assert_eq!(app.selected_sandbox, 0);
}
