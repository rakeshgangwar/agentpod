use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::Frame;

use crate::api::ApiClient;
use crate::cli::Cli;
use crate::config::Config;
use crate::event::{AppEvent, ApiResult};
use crate::types::Sandbox;
use crate::ui;

/// Available views
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum View {
    Login,
    Dashboard,
    Chat,
    Terminal,
    Files,
    Git,
    Providers,
    Settings,
}

/// Application state
pub struct App {
    // Configuration
    pub config: Config,
    pub cli: Cli,

    // API
    pub api: ApiClient,
    pub connected: bool,
    pub api_url: String,

    // State
    pub should_quit: bool,
    pub active_view: View,

    // Login
    pub login_email: String,
    pub login_password: String,
    pub login_focus: usize, // 0 = email, 1 = password
    pub login_error: Option<String>,

    // Dashboard
    pub sandboxes: Vec<Sandbox>,
    pub selected_sandbox: usize,
    pub sandboxes_loaded: bool,
}

impl App {
    pub fn new(config: Config, cli: Cli) -> Self {
        let api_url = config.effective_api_url(cli.api_url.as_deref());
        let token = config.effective_token(cli.token.as_deref());
        let has_token = token.is_some();

        let api = ApiClient::new(&api_url, token);

        // Start on login if no token, otherwise dashboard
        let active_view = if has_token {
            View::Dashboard
        } else {
            View::Login
        };

        Self {
            config,
            cli,
            api,
            connected: false,
            api_url,
            should_quit: false,
            active_view,
            login_email: String::new(),
            login_password: String::new(),
            login_focus: 0,
            login_error: None,
            sandboxes: Vec::new(),
            selected_sandbox: 0,
            sandboxes_loaded: false,
        }
    }

    /// Render the application
    pub fn render(&self, frame: &mut Frame) {
        ui::render(frame, self);
    }

    /// Handle tick events (periodic updates)
    pub async fn tick(&mut self) {
        // Check connection on first tick if we have a token
        if !self.connected && self.api.has_token() {
            match self.api.test_connection().await {
                Ok(true) => {
                    self.connected = true;
                    // Load sandboxes on first connection
                    if !self.sandboxes_loaded {
                        self.load_sandboxes().await;
                    }
                }
                _ => {}
            }
        }
    }

    /// Handle keyboard input
    pub async fn handle_key_event(&mut self, key: KeyEvent) {
        // Global key handling
        match key.code {
            KeyCode::Char('q') if self.active_view != View::Login => {
                self.should_quit = true;
                return;
            }
            KeyCode::Char('?') => {
                // TODO: Show help
                return;
            }
            _ => {}
        }

        // View-specific key handling
        match self.active_view {
            View::Login => self.handle_login_keys(key).await,
            View::Dashboard => self.handle_dashboard_keys(key).await,
            View::Chat => self.handle_chat_keys(key).await,
            View::Terminal => self.handle_terminal_keys(key).await,
            View::Files => self.handle_files_keys(key).await,
            View::Git => self.handle_git_keys(key).await,
            View::Providers => self.handle_providers_keys(key).await,
            View::Settings => self.handle_settings_keys(key).await,
        }
    }

    /// Handle login view keys
    async fn handle_login_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.login_focus = (self.login_focus + 1) % 2;
            }
            KeyCode::BackTab => {
                self.login_focus = (self.login_focus + 1) % 2;
            }
            KeyCode::Enter => {
                self.attempt_login().await;
            }
            KeyCode::Esc => {
                // If we have a token, go to dashboard
                if self.api.has_token() {
                    self.active_view = View::Dashboard;
                }
            }
            KeyCode::Char(c) => {
                if self.login_focus == 0 {
                    self.login_email.push(c);
                } else {
                    self.login_password.push(c);
                }
            }
            KeyCode::Backspace => {
                if self.login_focus == 0 {
                    self.login_email.pop();
                } else {
                    self.login_password.pop();
                }
            }
            _ => {}
        }
    }

    /// Handle dashboard view keys
    async fn handle_dashboard_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('n') => {
                // TODO: Create new sandbox
            }
            KeyCode::Char('r') => {
                self.load_sandboxes().await;
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if !self.sandboxes.is_empty() {
                    self.selected_sandbox = self.selected_sandbox.saturating_sub(1);
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if !self.sandboxes.is_empty() {
                    self.selected_sandbox = (self.selected_sandbox + 1).min(self.sandboxes.len() - 1);
                }
            }
            KeyCode::Enter => {
                // TODO: Open sandbox detail
            }
            KeyCode::Tab => {
                self.active_view = View::Chat;
            }
            _ => {}
        }
    }

    /// Handle chat view keys
    async fn handle_chat_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Terminal;
            }
            KeyCode::BackTab => {
                self.active_view = View::Dashboard;
            }
            _ => {}
        }
    }

    /// Handle terminal view keys
    async fn handle_terminal_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Files;
            }
            KeyCode::BackTab => {
                self.active_view = View::Chat;
            }
            _ => {}
        }
    }

    /// Handle files view keys
    async fn handle_files_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Git;
            }
            KeyCode::BackTab => {
                self.active_view = View::Terminal;
            }
            _ => {}
        }
    }

    /// Handle git view keys
    async fn handle_git_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Providers;
            }
            KeyCode::BackTab => {
                self.active_view = View::Files;
            }
            _ => {}
        }
    }

    /// Handle providers view keys
    async fn handle_providers_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Settings;
            }
            KeyCode::BackTab => {
                self.active_view = View::Git;
            }
            _ => {}
        }
    }

    /// Handle settings view keys
    async fn handle_settings_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Tab => {
                self.active_view = View::Dashboard;
            }
            KeyCode::BackTab => {
                self.active_view = View::Providers;
            }
            _ => {}
        }
    }

    /// Handle API results
    pub fn handle_api_result(&mut self, result: ApiResult) {
        match result {
            ApiResult::LoginSuccess { token } => {
                self.api.set_token(Some(token));
                self.connected = true;
                self.active_view = View::Dashboard;
                self.login_error = None;
            }
            ApiResult::LoginError { message } => {
                self.login_error = Some(message);
            }
            ApiResult::SandboxesLoaded { sandboxes } => {
                // Parse sandboxes from JSON
                self.sandboxes = sandboxes
                    .into_iter()
                    .filter_map(|s| serde_json::from_value(s).ok())
                    .collect();
                self.sandboxes_loaded = true;
            }
            ApiResult::Success { message: _ } => {}
            ApiResult::Error { message: _ } => {}
        }
    }

    /// Handle connection status change
    pub fn handle_connection_status(&mut self, connected: bool) {
        self.connected = connected;
    }

    /// Attempt login
    async fn attempt_login(&mut self) {
        // TODO: Implement actual login
        self.login_error = Some("Login not yet implemented".to_string());
    }

    /// Load sandboxes from API
    async fn load_sandboxes(&mut self) {
        // TODO: Implement actual sandbox loading
        self.sandboxes_loaded = true;
    }
}
