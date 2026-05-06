use agentpod_tui::config::Config;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn test_config_save_token() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    let mut config = Config::default();
    config.connection.api_token = Some("saved-token-123".to_string());

    config.save(&config_path).unwrap();

    // Load and verify token persists
    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_token, Some("saved-token-123".to_string()));
}

#[test]
fn test_config_clear_token() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    // First save with token
    let mut config = Config::default();
    config.connection.api_token = Some("token-to-clear".to_string());
    config.save(&config_path).unwrap();

    // Then clear token
    config.connection.api_token = None;
    config.save(&config_path).unwrap();

    // Verify token is cleared
    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_token, None);
}

#[test]
fn test_config_update_token() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    // Save initial token
    let mut config = Config::default();
    config.connection.api_token = Some("old-token".to_string());
    config.save(&config_path).unwrap();

    // Update token
    config.connection.api_token = Some("new-token".to_string());
    config.save(&config_path).unwrap();

    // Verify new token
    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_token, Some("new-token".to_string()));
}

#[test]
fn test_config_preserves_other_fields_when_saving_token() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    // Save config with custom values
    let mut config = Config::default();
    config.connection.api_url = "https://custom.example.com".to_string();
    config.defaults.flavor = "python".to_string();
    config.ui.theme = "light".to_string();
    config.save(&config_path).unwrap();

    // Update only token
    config.connection.api_token = Some("new-token".to_string());
    config.save(&config_path).unwrap();

    // Verify other fields preserved
    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_url, "https://custom.example.com");
    assert_eq!(loaded.defaults.flavor, "python");
    assert_eq!(loaded.ui.theme, "light");
    assert_eq!(loaded.connection.api_token, Some("new-token".to_string()));
}

#[test]
fn test_config_token_with_special_characters() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.toml");

    // Token with special characters (JWT-like)
    let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    let mut config = Config::default();
    config.connection.api_token = Some(token.to_string());
    config.save(&config_path).unwrap();

    let loaded = Config::load(Some(&config_path)).unwrap();
    assert_eq!(loaded.connection.api_token, Some(token.to_string()));
}
