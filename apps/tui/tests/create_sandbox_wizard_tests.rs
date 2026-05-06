use agentpod_tui::app::{App, CreateSandboxSource, CreateSandboxStep, View};
use agentpod_tui::cli::Cli;
use agentpod_tui::config::Config;
use agentpod_tui::types::SandboxStatus;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use serde_json::json;
use wiremock::matchers::{body_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn test_cli(api_url: Option<String>) -> Cli {
    Cli {
        api_url,
        token: Some("test-token".to_string()),
        config: None,
        embedded_terminal: false,
        debug: false,
        sandbox: None,
    }
}

fn test_app() -> App {
    let mut config = Config::default();
    config.defaults.flavor = "python".to_string();
    config.defaults.resource_tier = "builder".to_string();
    App::new(config, test_cli(None))
}

fn test_app_with_api_url(api_url: String) -> App {
    let mut config = Config::default();
    config.defaults.flavor = "python".to_string();
    config.defaults.resource_tier = "builder".to_string();
    App::new(config, test_cli(Some(api_url)))
}

fn created_sandbox_body(id: &str, name: &str, git_url: Option<&str>) -> serde_json::Value {
    json!({
        "id": id,
        "name": name,
        "description": null,
        "status": "creating",
        "container_id": null,
        "git_url": git_url,
        "flavor_id": "python",
        "resource_tier_id": "builder",
        "created_at": "2024-01-04T00:00:00Z",
        "updated_at": "2024-01-04T00:00:00Z"
    })
}

#[tokio::test]
async fn test_dashboard_n_opens_create_sandbox_wizard_with_config_defaults() {
    let mut app = test_app();
    app.active_view = View::Dashboard;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Scratch);
    assert_eq!(app.create_sandbox.selected_flavor, "python");
    assert_eq!(app.create_sandbox.selected_resource_tier, "builder");
    assert_eq!(
        app.create_sandbox.selected_addons,
        vec!["code-server".to_string()]
    );
    assert!(app.create_sandbox.error.is_none());
}

#[tokio::test]
async fn test_create_sandbox_esc_from_source_cancels_to_dashboard() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;

    app.handle_key_event(KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE))
        .await;

    assert_eq!(app.active_view, View::Dashboard);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(app.create_sandbox.name, "");
}

#[tokio::test]
async fn test_q_does_not_quit_inside_create_sandbox_wizard() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE))
        .await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert!(!app.should_quit);
}

#[tokio::test]
async fn test_create_sandbox_enter_advances_through_valid_steps() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);

    app.create_sandbox.name = "My Sandbox".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Runtime);

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Addons);

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Review);
}

#[tokio::test]
async fn test_create_sandbox_enter_requires_name_on_details() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);
    assert_eq!(
        app.create_sandbox.error,
        Some("name is required".to_string())
    );
}

#[tokio::test]
async fn test_create_sandbox_git_source_requires_valid_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://example.com/repo".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(
        app.create_sandbox.error,
        Some("Git URL must be a GitHub or GitLab repository URL".to_string())
    );
}

#[tokio::test]
async fn test_create_sandbox_git_source_rejects_embedded_github_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://evil.com/github.com/repo".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(
        app.create_sandbox.error,
        Some("Git URL must be a GitHub or GitLab repository URL".to_string())
    );
}

#[tokio::test]
async fn test_create_sandbox_git_source_rejects_host_root_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://github.com/".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(
        app.create_sandbox.error,
        Some("Git URL must be a GitHub or GitLab repository URL".to_string())
    );
}

#[tokio::test]
async fn test_create_sandbox_git_source_derives_name_from_repo_slug() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://github.com/acme/repo".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);
    assert_eq!(app.create_sandbox.name, "repo");
}

#[tokio::test]
async fn test_create_sandbox_git_source_derives_name_from_repo_git_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://github.com/acme/repo.git".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);
    assert_eq!(app.create_sandbox.name, "repo");
}

#[tokio::test]
async fn test_create_sandbox_git_source_rejects_repository_subpath_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://github.com/acme/repo/issues/1".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(
        app.create_sandbox.error,
        Some("Git URL must be a GitHub or GitLab repository URL".to_string())
    );
}

#[tokio::test]
async fn test_create_sandbox_esc_moves_back_one_step() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);

    app.handle_key_event(KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE))
        .await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
}

#[tokio::test]
async fn test_create_sandbox_details_text_entry_and_focus() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    for c in "my api".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE))
            .await;
    }
    assert_eq!(app.create_sandbox.name, "my api");

    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE))
        .await;
    for c in "api service".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE))
            .await;
    }
    assert_eq!(app.create_sandbox.description, "api service");

    app.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.description, "api servic");
}

#[tokio::test]
async fn test_create_sandbox_details_text_entry_preserves_vim_keys() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    for c in "jakarta".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE))
            .await;
    }
    assert_eq!(app.create_sandbox.name, "jakarta");

    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE))
        .await;
    for c in "backend".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE))
            .await;
    }
    assert_eq!(app.create_sandbox.description, "backend");
}

#[tokio::test]
async fn test_create_sandbox_git_url_text_entry() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;

    for c in "https://github.com/acme/joker".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE))
            .await;
    }

    assert_eq!(app.create_sandbox.git_url, "https://github.com/acme/joker");
}

#[tokio::test]
async fn test_create_sandbox_runtime_selection_changes_values() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;
    app.create_sandbox.name = "Runtime Test".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .await;

    app.handle_key_event(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.selected_flavor, "go");

    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE))
        .await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(app.create_sandbox.selected_resource_tier, "starter");
}

#[tokio::test]
async fn test_create_sandbox_addon_space_toggles_code_server() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.create_sandbox.step = CreateSandboxStep::Addons;

    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert!(app.create_sandbox.selected_addons.is_empty());

    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE))
        .await;
    assert_eq!(
        app.create_sandbox.selected_addons,
        vec!["code-server".to_string()]
    );
}

#[tokio::test]
async fn test_create_sandbox_ctrl_s_submits_scratch_request_and_returns_dashboard() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes"))
        .and(body_json(json!({
            "name": "Scratch Project",
            "flavor": "python",
            "resourceTier": "builder",
            "addons": ["code-server"]
        })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(created_sandbox_body(
                "sb-new",
                "Scratch Project",
                None,
            )),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = test_app_with_api_url(mock_server.uri());
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.name = "Scratch Project".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL))
        .await;

    assert_eq!(app.active_view, View::Dashboard);
    assert_eq!(app.sandboxes.len(), 1);
    assert_eq!(app.sandboxes[0].id, "sb-new");
    assert_eq!(app.sandboxes[0].status, SandboxStatus::Creating);
    assert_eq!(app.selected_sandbox, 0);
}

#[tokio::test]
async fn test_create_sandbox_ctrl_s_submits_git_request_with_derived_name() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes"))
        .and(body_json(json!({
            "name": "repo",
            "githubUrl": "https://github.com/acme/repo",
            "flavor": "python",
            "resourceTier": "builder",
            "addons": ["code-server"]
        })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(created_sandbox_body(
                "sb-git",
                "repo",
                Some("https://github.com/acme/repo"),
            )),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = test_app_with_api_url(mock_server.uri());
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.source = CreateSandboxSource::Git;
    app.create_sandbox.git_url = "https://github.com/acme/repo".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL))
        .await;

    assert_eq!(app.active_view, View::Dashboard);
    assert_eq!(app.sandboxes.len(), 1);
    assert_eq!(app.sandboxes[0].id, "sb-git");
}

#[tokio::test]
async fn test_create_sandbox_failure_stays_on_review_with_error() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/v2/sandboxes"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({ "error": "limit reached" })))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = test_app_with_api_url(mock_server.uri());
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE))
        .await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.name = "Too Many".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL))
        .await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Review);
    assert!(!app.create_sandbox.submitting);
    assert!(app.create_sandbox.error.as_ref().unwrap().contains("500"));
}
