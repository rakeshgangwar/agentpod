use agentpod_tui::app::{App, CreateSandboxSource, CreateSandboxStep, View};
use agentpod_tui::cli::Cli;
use agentpod_tui::config::Config;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

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
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);

    app.create_sandbox.name = "My Sandbox".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Runtime);

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Addons);

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Review);
}

#[tokio::test]
async fn test_create_sandbox_enter_requires_name_on_details() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);
    assert_eq!(app.create_sandbox.error, Some("name is required".to_string()));
}

#[tokio::test]
async fn test_create_sandbox_git_source_requires_valid_url() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Git);

    app.create_sandbox.git_url = "https://example.com/repo".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(app.create_sandbox.error, Some("Git URL must be a GitHub or GitLab URL".to_string()));
}

#[tokio::test]
async fn test_create_sandbox_esc_moves_back_one_step() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Details);

    app.handle_key_event(KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
}
