use agentpod_tui::config::Config;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn test_config_default_values() {
    let config = Config::default();

    assert_eq!(config.connection.api_url, "http://localhost:3001");
    assert_eq!(config.connection.api_token, None);
    assert_eq!(config.defaults.flavor, "fullstack");
    assert_eq!(config.defaults.resource_tier, "builder");
    assert_eq!(config.ui.theme, "dark");
    assert_eq!(config.ui.scroll_speed, 3);
    assert_eq!(config.ui.embedded_terminal, false);
}

#[test]
fn test_config_load_from_file() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    let config_content = r#"
[connection]
api_url = "https://api.example.com"
api_token = "test-token-123"

[defaults]
flavor = "python"
resource_tier = "starter"

[ui]
theme = "light"
scroll_speed = 5
embedded_terminal = true
"#;

    std::fs::write(&config_path, config_content).unwrap();

    let config = Config::load(Some(&config_path)).unwrap();

    assert_eq!(config.connection.api_url, "https://api.example.com");
    assert_eq!(config.connection.api_token, Some("test-token-123".to_string()));
    assert_eq!(config.defaults.flavor, "python");
    assert_eq!(config.defaults.resource_tier, "starter");
    assert_eq!(config.ui.theme, "light");
    assert_eq!(config.ui.scroll_speed, 5);
    assert_eq!(config.ui.embedded_terminal, true);
}

#[test]
fn test_config_load_creates_default_if_not_exists() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("nonexistent.toml");

    let config = Config::load(Some(&config_path)).unwrap();

    // Should create default config
    assert_eq!(config.connection.api_url, "http://localhost:3001");
    assert_eq!(config.defaults.flavor, "fullstack");

    // File should now exist
    assert!(config_path.exists());
}

#[test]
fn test_config_save() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("saved.toml");

    let mut config = Config::default();
    config.connection.api_url = "https://saved.example.com".to_string();
    config.connection.api_token = Some("saved-token".to_string());

    config.save(&config_path).unwrap();

    // Load and verify
    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_url, "https://saved.example.com");
    assert_eq!(loaded.connection.api_token, Some("saved-token".to_string()));
}

#[test]
fn test_config_effective_api_url() {
    let config = Config::default();

    // Without CLI override
    assert_eq!(config.effective_api_url(None), "http://localhost:3001");

    // With CLI override
    assert_eq!(
        config.effective_api_url(Some("https://override.com")),
        "https://override.com"
    );
}

#[test]
fn test_config_effective_token() {
    let mut config = Config::default();

    // Without CLI override or config token
    assert_eq!(config.effective_token(None), None);

    // With config token
    config.connection.api_token = Some("config-token".to_string());
    assert_eq!(
        config.effective_token(None),
        Some("config-token".to_string())
    );

    // With CLI override (takes precedence)
    assert_eq!(
        config.effective_token(Some("cli-token")),
        Some("cli-token".to_string())
    );
}

#[test]
fn test_config_partial_toml() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("partial.toml");

    // Only set connection, rest should use defaults
    let config_content = r#"
[connection]
api_url = "https://partial.example.com"
"#;

    std::fs::write(&config_path, config_content).unwrap();

    let config = Config::load(Some(&config_path)).unwrap();

    assert_eq!(config.connection.api_url, "https://partial.example.com");
    assert_eq!(config.defaults.flavor, "fullstack"); // default
    assert_eq!(config.ui.theme, "dark"); // default
}
