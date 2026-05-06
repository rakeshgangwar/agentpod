use agentpod_tui::app::{App, View};
use agentpod_tui::cli::Cli;
use agentpod_tui::config::Config;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

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

#[test]
fn test_app_new_without_token() {
    let app = create_test_app();
    assert_eq!(app.active_view, View::Login);
    assert!(!app.connected);
    assert!(!app.should_quit);
}

#[test]
fn test_app_new_with_token() {
    let config = Config::default();
    let cli = Cli {
        api_url: None,
        token: Some("test-token".to_string()),
        config: None,
        embedded_terminal: false,
        debug: false,
        sandbox: None,
    };
    let app = App::new(config, cli);
    assert_eq!(app.active_view, View::Dashboard);
    assert!(app.api.has_token());
}

#[tokio::test]
async fn test_app_quit_on_q() {
    let mut app = create_test_app();
    app.active_view = View::Dashboard;

    let key = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
    app.handle_key_event(key).await;

    assert!(app.should_quit);
}

#[tokio::test]
async fn test_app_tab_navigation() {
    let mut app = create_test_app();
    app.active_view = View::Dashboard;

    // Tab should move to Chat
    let key = KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE);
    app.handle_key_event(key).await;
    assert_eq!(app.active_view, View::Chat);

    // Tab should move to Terminal
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Terminal);

    // Tab should move to Files
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Files);

    // Tab should move to Git
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Git);

    // Tab should move to Providers
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Providers);

    // Tab should move to Settings
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Settings);

    // Tab should wrap back to Dashboard
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.active_view, View::Dashboard);
}

#[tokio::test]
async fn test_app_backtab_navigation() {
    let mut app = create_test_app();
    app.active_view = View::Dashboard;

    // BackTab from Dashboard should go to Settings (wraps around)
    let key = KeyEvent::new(KeyCode::BackTab, KeyModifiers::SHIFT);
    app.handle_key_event(key).await;
    assert_eq!(app.active_view, View::Settings);
}

#[tokio::test]
async fn test_app_login_field_navigation() {
    let mut app = create_test_app();
    app.active_view = View::Login;

    // Initially focused on email
    assert_eq!(app.login_focus, 0);

    // Tab should switch to password
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.login_focus, 1);

    // Tab should switch back to email
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    assert_eq!(app.login_focus, 0);
}

#[tokio::test]
async fn test_app_login_typing() {
    let mut app = create_test_app();
    app.active_view = View::Login;

    // Type email
    for c in "test@example.com".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)).await;
    }
    assert_eq!(app.login_email, "test@example.com");

    // Switch to password
    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;

    // Type password
    for c in "password123".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)).await;
    }
    assert_eq!(app.login_password, "password123");
}

#[tokio::test]
async fn test_app_login_backspace() {
    let mut app = create_test_app();
    app.active_view = View::Login;
    app.login_email = "test".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE)).await;
    assert_eq!(app.login_email, "tes");
}

#[tokio::test]
async fn test_app_dashboard_navigation() {
    let mut app = create_test_app();
    app.active_view = View::Dashboard;
    app.selected_sandbox = 0;

    // Down should increase selected
    app.handle_key_event(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE)).await;
    // Still 0 because no sandboxes
    assert_eq!(app.selected_sandbox, 0);
}

#[test]
fn test_app_handle_connection_status() {
    let mut app = create_test_app();
    assert!(!app.connected);

    app.handle_connection_status(true);
    assert!(app.connected);

    app.handle_connection_status(false);
    assert!(!app.connected);
}
