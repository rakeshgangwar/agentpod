# Create Sandbox Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a keyboard-first guided create-sandbox wizard in the Rust TUI.

**Architecture:** Add explicit wizard state to `App`, route Dashboard `n` into `View::CreateSandbox`, and submit through the existing `ApiClient::create_sandbox` method. Keep behavior state-driven and TDD-first; rendering is a thin read-only projection of wizard state.

**Tech Stack:** Rust 2021, tokio, ratatui, crossterm, reqwest, wiremock, cargo test.

---

## File Map

- Modify `apps/tui/src/app.rs`: add `View::CreateSandbox`, wizard enums/state, key handling, validation, request construction, and success/error transitions.
- Modify `apps/tui/src/api/sandboxes.rs`: omit optional create request fields when they are `None`.
- Modify `apps/tui/src/ui/mod.rs`: route `View::CreateSandbox` to a new renderer and include tab selection fallback.
- Create `apps/tui/src/ui/views/create_sandbox.rs`: render the vertical stepper and focused active step pane.
- Modify `apps/tui/src/ui/views/mod.rs`: export the new `create_sandbox` view module.
- Create `apps/tui/tests/create_sandbox_wizard_tests.rs`: state-machine and API request tests for the wizard.

## Static Wizard Choices

Use these static choices in `app.rs` for the first implementation slice:

```rust
const CREATE_SANDBOX_FLAVORS: [&str; 7] = ["js", "python", "go", "rust", "fullstack", "polyglot", "bare"];
const CREATE_SANDBOX_RESOURCE_TIERS: [&str; 2] = ["starter", "builder"];
const CREATE_SANDBOX_ADDONS: [&str; 1] = ["code-server"];
```

---

### Task 1: Add Wizard Types And Open/Cancel Navigation

**Files:**
- Modify: `apps/tui/src/app.rs`
- Test: `apps/tui/tests/create_sandbox_wizard_tests.rs`

- [ ] **Step 1: Write the failing tests**

Create `apps/tui/tests/create_sandbox_wizard_tests.rs` with:

```rust
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

    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(app.create_sandbox.source, CreateSandboxSource::Scratch);
    assert_eq!(app.create_sandbox.selected_flavor, "python");
    assert_eq!(app.create_sandbox.selected_resource_tier, "builder");
    assert_eq!(app.create_sandbox.selected_addons, vec!["code-server".to_string()]);
    assert!(app.create_sandbox.error.is_none());
}

#[tokio::test]
async fn test_create_sandbox_esc_from_source_cancels_to_dashboard() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;

    app.handle_key_event(KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::Dashboard);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Source);
    assert_eq!(app.create_sandbox.name, "");
}

#[tokio::test]
async fn test_q_does_not_quit_inside_create_sandbox_wizard() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;

    app.handle_key_event(KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE)).await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert!(!app.should_quit);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: FAIL to compile because `CreateSandboxSource`, `CreateSandboxStep`, `View::CreateSandbox`, and `App::create_sandbox` do not exist.

- [ ] **Step 3: Add minimal wizard types and open/cancel handling**

In `apps/tui/src/app.rs`, update imports:

```rust
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
```

Add these types after `View`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateSandboxStep {
    Source,
    Details,
    Runtime,
    Addons,
    Review,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateSandboxSource {
    Scratch,
    Git,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateSandboxWizardState {
    pub step: CreateSandboxStep,
    pub source: CreateSandboxSource,
    pub focus: usize,
    pub name: String,
    pub description: String,
    pub git_url: String,
    pub selected_flavor: String,
    pub selected_resource_tier: String,
    pub selected_addons: Vec<String>,
    pub error: Option<String>,
    pub submitting: bool,
}

impl CreateSandboxWizardState {
    fn new(config: &Config) -> Self {
        Self {
            step: CreateSandboxStep::Source,
            source: CreateSandboxSource::Scratch,
            focus: 0,
            name: String::new(),
            description: String::new(),
            git_url: String::new(),
            selected_flavor: config.defaults.flavor.clone(),
            selected_resource_tier: config.defaults.resource_tier.clone(),
            selected_addons: vec!["code-server".to_string()],
            error: None,
            submitting: false,
        }
    }
}
```

Add `CreateSandbox` to `View`:

```rust
    CreateSandbox,
```

Add this field to `App`:

```rust
    pub create_sandbox: CreateSandboxWizardState,
```

Initialize it in `App::new`:

```rust
            create_sandbox: CreateSandboxWizardState::new(&config),
```

Change the global quit guard to exclude the wizard:

```rust
            KeyCode::Char('q') if self.active_view != View::Login && self.active_view != View::CreateSandbox => {
```

Add the view route in `handle_key_event`:

```rust
            View::CreateSandbox => self.handle_create_sandbox_keys(key).await,
```

Change Dashboard `n` handling to open the wizard:

```rust
            KeyCode::Char('n') => {
                self.open_create_sandbox();
            }
```

Add these methods in `impl App` before `attempt_login`:

```rust
    fn open_create_sandbox(&mut self) {
        self.create_sandbox = CreateSandboxWizardState::new(&self.config);
        self.active_view = View::CreateSandbox;
    }

    fn cancel_create_sandbox(&mut self) {
        self.create_sandbox = CreateSandboxWizardState::new(&self.config);
        self.active_view = View::Dashboard;
    }

    async fn handle_create_sandbox_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.cancel_create_sandbox(),
            _ => {}
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: PASS for 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/tui/src/app.rs apps/tui/tests/create_sandbox_wizard_tests.rs
git commit -m "feat(tui): add create sandbox wizard state"
```

---

### Task 2: Add Step Validation And Forward/Back Navigation

**Files:**
- Modify: `apps/tui/src/app.rs`
- Modify: `apps/tui/tests/create_sandbox_wizard_tests.rs`

- [ ] **Step 1: Add failing navigation and validation tests**

Append these tests to `apps/tui/tests/create_sandbox_wizard_tests.rs`:

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: FAIL because `Enter` does not advance and space does not toggle source.

- [ ] **Step 3: Implement minimal step navigation and validation**

In `apps/tui/src/app.rs`, add helpers inside `impl App` before `handle_create_sandbox_keys`:

```rust
    fn create_sandbox_next_step(&mut self) {
        self.create_sandbox.error = None;

        match self.create_sandbox.step {
            CreateSandboxStep::Source => {
                if self.create_sandbox.source == CreateSandboxSource::Git && !self.create_sandbox_git_url_valid() {
                    self.create_sandbox.error = Some("Git URL must be a GitHub or GitLab URL".to_string());
                    return;
                }
                self.create_sandbox.step = CreateSandboxStep::Details;
                self.create_sandbox.focus = 0;
            }
            CreateSandboxStep::Details => {
                if self.create_sandbox.name.trim().is_empty() {
                    self.create_sandbox.error = Some("name is required".to_string());
                    return;
                }
                self.create_sandbox.step = CreateSandboxStep::Runtime;
                self.create_sandbox.focus = 0;
            }
            CreateSandboxStep::Runtime => {
                self.create_sandbox.step = CreateSandboxStep::Addons;
                self.create_sandbox.focus = 0;
            }
            CreateSandboxStep::Addons => {
                self.create_sandbox.step = CreateSandboxStep::Review;
                self.create_sandbox.focus = 0;
            }
            CreateSandboxStep::Review => {}
        }
    }

    fn create_sandbox_previous_step(&mut self) {
        self.create_sandbox.error = None;

        self.create_sandbox.step = match self.create_sandbox.step {
            CreateSandboxStep::Source => {
                self.cancel_create_sandbox();
                return;
            }
            CreateSandboxStep::Details => CreateSandboxStep::Source,
            CreateSandboxStep::Runtime => CreateSandboxStep::Details,
            CreateSandboxStep::Addons => CreateSandboxStep::Runtime,
            CreateSandboxStep::Review => CreateSandboxStep::Addons,
        };
        self.create_sandbox.focus = 0;
    }

    fn create_sandbox_git_url_valid(&self) -> bool {
        let url = self.create_sandbox.git_url.trim();
        !url.is_empty() && (url.contains("github.com/") || url.contains("gitlab.com/"))
    }
```

Replace `handle_create_sandbox_keys` with:

```rust
    async fn handle_create_sandbox_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.create_sandbox_previous_step(),
            KeyCode::Enter => self.create_sandbox_next_step(),
            KeyCode::Char(' ') if self.create_sandbox.step == CreateSandboxStep::Source => {
                self.create_sandbox.source = match self.create_sandbox.source {
                    CreateSandboxSource::Scratch => CreateSandboxSource::Git,
                    CreateSandboxSource::Git => CreateSandboxSource::Scratch,
                };
                self.create_sandbox.error = None;
            }
            _ => {}
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: PASS for 7 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/tui/src/app.rs apps/tui/tests/create_sandbox_wizard_tests.rs
git commit -m "feat(tui): add create wizard navigation"
```

---

### Task 3: Add Text Entry And Selection Controls

**Files:**
- Modify: `apps/tui/src/app.rs`
- Modify: `apps/tui/tests/create_sandbox_wizard_tests.rs`

- [ ] **Step 1: Add failing input tests**

Append these tests to `apps/tui/tests/create_sandbox_wizard_tests.rs`:

```rust
#[tokio::test]
async fn test_create_sandbox_details_text_entry_and_focus() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    for c in "api".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)).await;
    }
    assert_eq!(app.create_sandbox.name, "api");

    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    for c in "service".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)).await;
    }
    assert_eq!(app.create_sandbox.description, "service");

    app.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.description, "servic");
}

#[tokio::test]
async fn test_create_sandbox_git_url_text_entry() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;

    for c in "https://github.com/acme/api".chars() {
        app.handle_key_event(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)).await;
    }

    assert_eq!(app.create_sandbox.git_url, "https://github.com/acme/api");
}

#[tokio::test]
async fn test_create_sandbox_runtime_selection_changes_values() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;
    app.create_sandbox.name = "Runtime Test".to_string();
    app.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE)).await;

    app.handle_key_event(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.selected_flavor, "go");

    app.handle_key_event(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE)).await;
    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.selected_resource_tier, "starter");
}

#[tokio::test]
async fn test_create_sandbox_addon_space_toggles_code_server() {
    let mut app = test_app();
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.create_sandbox.step = CreateSandboxStep::Addons;

    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;
    assert!(app.create_sandbox.selected_addons.is_empty());

    app.handle_key_event(KeyEvent::new(KeyCode::Char(' '), KeyModifiers::NONE)).await;
    assert_eq!(app.create_sandbox.selected_addons, vec!["code-server".to_string()]);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: FAIL because text input and runtime/add-on controls are not handled.

- [ ] **Step 3: Implement minimal text and selection handling**

Add constants near the top of `apps/tui/src/app.rs` after imports:

```rust
const CREATE_SANDBOX_FLAVORS: [&str; 7] = ["js", "python", "go", "rust", "fullstack", "polyglot", "bare"];
const CREATE_SANDBOX_RESOURCE_TIERS: [&str; 2] = ["starter", "builder"];
const CREATE_SANDBOX_ADDONS: [&str; 1] = ["code-server"];
```

Add these helpers inside `impl App` before `handle_create_sandbox_keys`:

```rust
    fn create_sandbox_focus_count(&self) -> usize {
        match self.create_sandbox.step {
            CreateSandboxStep::Source => {
                if self.create_sandbox.source == CreateSandboxSource::Git { 2 } else { 1 }
            }
            CreateSandboxStep::Details => 2,
            CreateSandboxStep::Runtime => 2,
            CreateSandboxStep::Addons => CREATE_SANDBOX_ADDONS.len().max(1),
            CreateSandboxStep::Review => 1,
        }
    }

    fn create_sandbox_move_focus_forward(&mut self) {
        let count = self.create_sandbox_focus_count();
        self.create_sandbox.focus = (self.create_sandbox.focus + 1) % count;
    }

    fn create_sandbox_move_focus_backward(&mut self) {
        let count = self.create_sandbox_focus_count();
        self.create_sandbox.focus = if self.create_sandbox.focus == 0 {
            count - 1
        } else {
            self.create_sandbox.focus - 1
        };
    }

    fn create_sandbox_type_char(&mut self, c: char) {
        match self.create_sandbox.step {
            CreateSandboxStep::Source if self.create_sandbox.source == CreateSandboxSource::Git && self.create_sandbox.focus == 1 => {
                self.create_sandbox.git_url.push(c);
            }
            CreateSandboxStep::Details if self.create_sandbox.focus == 0 => {
                self.create_sandbox.name.push(c);
            }
            CreateSandboxStep::Details if self.create_sandbox.focus == 1 => {
                self.create_sandbox.description.push(c);
            }
            _ => {}
        }
    }

    fn create_sandbox_backspace(&mut self) {
        match self.create_sandbox.step {
            CreateSandboxStep::Source if self.create_sandbox.source == CreateSandboxSource::Git && self.create_sandbox.focus == 1 => {
                self.create_sandbox.git_url.pop();
            }
            CreateSandboxStep::Details if self.create_sandbox.focus == 0 => {
                self.create_sandbox.name.pop();
            }
            CreateSandboxStep::Details if self.create_sandbox.focus == 1 => {
                self.create_sandbox.description.pop();
            }
            _ => {}
        }
    }

    fn create_sandbox_move_selection(&mut self, delta: isize) {
        match self.create_sandbox.step {
            CreateSandboxStep::Runtime if self.create_sandbox.focus == 0 => {
                let current = CREATE_SANDBOX_FLAVORS
                    .iter()
                    .position(|flavor| *flavor == self.create_sandbox.selected_flavor)
                    .unwrap_or(0);
                let next = (current as isize + delta).clamp(0, (CREATE_SANDBOX_FLAVORS.len() - 1) as isize) as usize;
                self.create_sandbox.selected_flavor = CREATE_SANDBOX_FLAVORS[next].to_string();
            }
            CreateSandboxStep::Runtime if self.create_sandbox.focus == 1 => {
                let current = CREATE_SANDBOX_RESOURCE_TIERS
                    .iter()
                    .position(|tier| *tier == self.create_sandbox.selected_resource_tier)
                    .unwrap_or(0);
                let next = (current as isize + delta).clamp(0, (CREATE_SANDBOX_RESOURCE_TIERS.len() - 1) as isize) as usize;
                self.create_sandbox.selected_resource_tier = CREATE_SANDBOX_RESOURCE_TIERS[next].to_string();
            }
            _ => {}
        }
    }

    fn create_sandbox_toggle_current(&mut self) {
        match self.create_sandbox.step {
            CreateSandboxStep::Source => {
                self.create_sandbox.source = match self.create_sandbox.source {
                    CreateSandboxSource::Scratch => CreateSandboxSource::Git,
                    CreateSandboxSource::Git => CreateSandboxSource::Scratch,
                };
                self.create_sandbox.error = None;
                self.create_sandbox.focus = 0;
            }
            CreateSandboxStep::Addons => {
                let addon = CREATE_SANDBOX_ADDONS[self.create_sandbox.focus.min(CREATE_SANDBOX_ADDONS.len() - 1)];
                if self.create_sandbox.selected_addons.iter().any(|selected| selected == addon) {
                    self.create_sandbox.selected_addons.retain(|selected| selected != addon);
                } else {
                    self.create_sandbox.selected_addons.push(addon.to_string());
                }
            }
            _ => {}
        }
    }
```

Update `handle_create_sandbox_keys` to:

```rust
    async fn handle_create_sandbox_keys(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.create_sandbox_previous_step(),
            KeyCode::Enter => self.create_sandbox_next_step(),
            KeyCode::Tab => self.create_sandbox_move_focus_forward(),
            KeyCode::BackTab => self.create_sandbox_move_focus_backward(),
            KeyCode::Up | KeyCode::Char('k') => self.create_sandbox_move_selection(-1),
            KeyCode::Down | KeyCode::Char('j') => self.create_sandbox_move_selection(1),
            KeyCode::Backspace => self.create_sandbox_backspace(),
            KeyCode::Char(' ') => self.create_sandbox_toggle_current(),
            KeyCode::Char(c) if key.modifiers.is_empty() || key.modifiers == KeyModifiers::SHIFT => {
                self.create_sandbox_type_char(c);
            }
            _ => {}
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: PASS for 11 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/tui/src/app.rs apps/tui/tests/create_sandbox_wizard_tests.rs
git commit -m "feat(tui): add create wizard input controls"
```

---

### Task 4: Submit Scratch And Git Create Requests

**Files:**
- Modify: `apps/tui/src/api/sandboxes.rs`
- Modify: `apps/tui/src/app.rs`
- Modify: `apps/tui/tests/create_sandbox_wizard_tests.rs`

- [ ] **Step 1: Add failing create request tests**

Append these imports to `apps/tui/tests/create_sandbox_wizard_tests.rs`:

```rust
use agentpod_tui::types::SandboxStatus;
use serde_json::json;
use wiremock::matchers::{body_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
```

Append these helper functions and tests:

```rust
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
        .respond_with(ResponseTemplate::new(200).set_body_json(created_sandbox_body("sb-new", "Scratch Project", None)))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = test_app_with_api_url(mock_server.uri());
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.name = "Scratch Project".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL)).await;

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
            "description": null,
            "githubUrl": "https://github.com/acme/repo",
            "flavor": "python",
            "resourceTier": "builder",
            "addons": ["code-server"]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(created_sandbox_body("sb-git", "repo", Some("https://github.com/acme/repo"))))
        .expect(1)
        .mount(&mock_server)
        .await;

    let mut app = test_app_with_api_url(mock_server.uri());
    app.active_view = View::Dashboard;
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.source = CreateSandboxSource::Git;
    app.create_sandbox.git_url = "https://github.com/acme/repo".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL)).await;

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
    app.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE)).await;
    app.create_sandbox.step = CreateSandboxStep::Review;
    app.create_sandbox.name = "Too Many".to_string();

    app.handle_key_event(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::CONTROL)).await;

    assert_eq!(app.active_view, View::CreateSandbox);
    assert_eq!(app.create_sandbox.step, CreateSandboxStep::Review);
    assert!(!app.create_sandbox.submitting);
    assert!(app.create_sandbox.error.as_ref().unwrap().contains("500"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: FAIL because `Ctrl+S` does not submit create requests.

- [ ] **Step 3: Omit optional create request fields when absent**

In `apps/tui/src/api/sandboxes.rs`, update `CreateSandboxRequest`:

```rust
/// Create sandbox request
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flavor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub addons: Option<Vec<String>>,
}
```

- [ ] **Step 4: Implement request construction and submit**

In `apps/tui/src/app.rs`, update imports:

```rust
use crate::api::{sandboxes::CreateSandboxRequest, ApiClient};
```

Add helpers before `handle_create_sandbox_keys`:

```rust
    fn create_sandbox_request_name(&self) -> String {
        let entered = self.create_sandbox.name.trim();
        if !entered.is_empty() {
            return entered.to_string();
        }

        if self.create_sandbox.source == CreateSandboxSource::Git {
            if let Some(name) = self.extract_repo_name(&self.create_sandbox.git_url) {
                return name;
            }
        }

        "imported-project".to_string()
    }

    fn extract_repo_name(&self, url: &str) -> Option<String> {
        let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
        let name = trimmed.rsplit('/').next()?.trim();
        if name.is_empty() {
            None
        } else {
            Some(name.to_string())
        }
    }

    fn build_create_sandbox_request(&self) -> CreateSandboxRequest {
        CreateSandboxRequest {
            name: self.create_sandbox_request_name(),
            description: if self.create_sandbox.description.trim().is_empty() {
                None
            } else {
                Some(self.create_sandbox.description.trim().to_string())
            },
            github_url: if self.create_sandbox.source == CreateSandboxSource::Git {
                Some(self.create_sandbox.git_url.trim().to_string())
            } else {
                None
            },
            flavor: Some(self.create_sandbox.selected_flavor.clone()),
            resource_tier: Some(self.create_sandbox.selected_resource_tier.clone()),
            addons: if self.create_sandbox.selected_addons.is_empty() {
                None
            } else {
                Some(self.create_sandbox.selected_addons.clone())
            },
        }
    }

    async fn submit_create_sandbox(&mut self) {
        if self.create_sandbox.step != CreateSandboxStep::Review || self.create_sandbox.submitting {
            return;
        }

        self.create_sandbox.error = None;
        self.create_sandbox.submitting = true;
        let request = self.build_create_sandbox_request();

        match self.api.create_sandbox(request).await {
            Ok(sandbox) => {
                self.sandboxes.push(sandbox);
                self.selected_sandbox = self.sandboxes.len().saturating_sub(1);
                self.sandboxes_loaded = true;
                self.create_sandbox = CreateSandboxWizardState::new(&self.config);
                self.active_view = View::Dashboard;
            }
            Err(error) => {
                self.create_sandbox.submitting = false;
                self.create_sandbox.error = Some(error.to_string());
            }
        }
    }
```

Add this match arm before the plain `KeyCode::Char(c)` handler in `handle_create_sandbox_keys`:

```rust
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.submit_create_sandbox().await;
            }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: PASS for 14 tests.

- [ ] **Step 6: Run existing sandbox API tests**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test sandbox_tests`

Expected: PASS; the existing all-fields create test still serializes all provided values.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/tui/src/api/sandboxes.rs apps/tui/src/app.rs apps/tui/tests/create_sandbox_wizard_tests.rs
git commit -m "feat(tui): submit create sandbox wizard"
```

---

### Task 5: Render The Vertical Stepper Wizard

**Files:**
- Modify: `apps/tui/src/ui/mod.rs`
- Modify: `apps/tui/src/ui/views/mod.rs`
- Create: `apps/tui/src/ui/views/create_sandbox.rs`

- [ ] **Step 1: Inspect `views/mod.rs`**

Run: use the Read tool on `apps/tui/src/ui/views/mod.rs`.

Expected: it exports existing view modules such as `dashboard` and `login`.

- [ ] **Step 2: Add the renderer module**

Create `apps/tui/src/ui/views/create_sandbox.rs` with:

```rust
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::{App, CreateSandboxSource, CreateSandboxStep};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(22), Constraint::Min(0)])
        .split(area);

    render_steps(frame, app, chunks[0]);
    render_active_step(frame, app, chunks[1]);
}

fn render_steps(frame: &mut Frame, app: &App, area: Rect) {
    let steps = [
        (CreateSandboxStep::Source, "1 Source"),
        (CreateSandboxStep::Details, "2 Details"),
        (CreateSandboxStep::Runtime, "3 Runtime"),
        (CreateSandboxStep::Addons, "4 Add-ons"),
        (CreateSandboxStep::Review, "5 Review"),
    ];

    let items: Vec<ListItem> = steps
        .iter()
        .map(|(step, label)| {
            let active = app.create_sandbox.step == *step;
            let prefix = if active { ">" } else { " " };
            let style = if active {
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            ListItem::new(format!("{} {}", prefix, label)).style(style)
        })
        .collect();

    frame.render_widget(
        List::new(items).block(Block::default().title("Create").borders(Borders::ALL)),
        area,
    );
}

fn render_active_step(frame: &mut Frame, app: &App, area: Rect) {
    let title = match app.create_sandbox.step {
        CreateSandboxStep::Source => "Source",
        CreateSandboxStep::Details => "Details",
        CreateSandboxStep::Runtime => "Runtime",
        CreateSandboxStep::Addons => "Add-ons",
        CreateSandboxStep::Review => "Review",
    };

    let mut lines = match app.create_sandbox.step {
        CreateSandboxStep::Source => source_lines(app),
        CreateSandboxStep::Details => details_lines(app),
        CreateSandboxStep::Runtime => runtime_lines(app),
        CreateSandboxStep::Addons => addons_lines(app),
        CreateSandboxStep::Review => review_lines(app),
    };

    if let Some(error) = &app.create_sandbox.error {
        lines.push(String::new());
        lines.push(format!("Error: {error}"));
    }

    lines.push(String::new());
    lines.push("Tab focus | Enter next | Esc back | Ctrl+S create on Review".to_string());

    frame.render_widget(
        Paragraph::new(lines.join("\n"))
            .block(Block::default().title(title).borders(Borders::ALL))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn source_lines(app: &App) -> Vec<String> {
    vec![
        format!("Source: {}", match app.create_sandbox.source {
            CreateSandboxSource::Scratch => "scratch",
            CreateSandboxSource::Git => "git",
        }),
        "Space toggles scratch/git.".to_string(),
        format!("Git URL: {}", app.create_sandbox.git_url),
    ]
}

fn details_lines(app: &App) -> Vec<String> {
    vec![
        format!("Name: {}", app.create_sandbox.name),
        format!("Description: {}", app.create_sandbox.description),
    ]
}

fn runtime_lines(app: &App) -> Vec<String> {
    vec![
        format!("Flavor: {}", app.create_sandbox.selected_flavor),
        format!("Resource tier: {}", app.create_sandbox.selected_resource_tier),
        "Use Up/Down then Space to select.".to_string(),
    ]
}

fn addons_lines(app: &App) -> Vec<String> {
    vec![
        format!("code-server: {}", if app.create_sandbox.selected_addons.iter().any(|addon| addon == "code-server") { "selected" } else { "not selected" }),
        "Space toggles the focused add-on.".to_string(),
    ]
}

fn review_lines(app: &App) -> Vec<String> {
    vec![
        format!("Source: {:?}", app.create_sandbox.source),
        format!("Git URL: {}", app.create_sandbox.git_url),
        format!("Name: {}", app.create_sandbox.name),
        format!("Description: {}", app.create_sandbox.description),
        format!("Flavor: {}", app.create_sandbox.selected_flavor),
        format!("Resource tier: {}", app.create_sandbox.selected_resource_tier),
        format!("Add-ons: {}", app.create_sandbox.selected_addons.join(", ")),
    ]
}
```

- [ ] **Step 3: Export and route the renderer**

In `apps/tui/src/ui/views/mod.rs`, add:

```rust
pub mod create_sandbox;
```

In `apps/tui/src/ui/mod.rs`, add a route in the content match:

```rust
        crate::app::View::CreateSandbox => views::create_sandbox::render(frame, app, chunks[1]),
```

Update tab selection match to keep CreateSandbox under Dashboard:

```rust
        crate::app::View::CreateSandbox => 0,
```

- [ ] **Step 4: Run compile/tests**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui --test create_sandbox_wizard_tests`

Expected: PASS for create wizard tests and no compile errors from the new renderer.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/tui/src/ui/mod.rs apps/tui/src/ui/views/mod.rs apps/tui/src/ui/views/create_sandbox.rs
git commit -m "feat(tui): render create sandbox wizard"
```

---

### Task 6: Full Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full TUI test suite**

Run: `. "$HOME/.cargo/env" && cargo test -p agentpod-tui`

Expected: all tests pass. Existing scaffold/dead-code warnings may remain.

- [ ] **Step 2: Check git status**

Run: `git status --short --branch`

Expected: clean working tree on `feat/tui` after all task commits.

- [ ] **Step 3: Report verification evidence**

Report the exact test count from the command output and any remaining warnings or limitations.

---

## Self-Review Notes

- Spec coverage: source mode, details, runtime, add-ons, review, validation, omitted optional API fields, submit success, submit failure, and renderer are covered by Tasks 1-5.
- Static selector non-goal is respected: dynamic list endpoints are not introduced.
- No placeholder tasks remain; each implementation step includes concrete code.
- Type names are consistent across tasks: `CreateSandboxStep`, `CreateSandboxSource`, and `CreateSandboxWizardState`.
