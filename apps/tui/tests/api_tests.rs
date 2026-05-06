use agentpod_tui::api::ApiClient;

#[tokio::test]
async fn test_api_client_new() {
    let client = ApiClient::new("http://localhost:3001", None);
    assert_eq!(client.base_url(), "http://localhost:3001");
    assert!(!client.has_token());
}

#[tokio::test]
async fn test_api_client_new_with_token() {
    let client = ApiClient::new("http://localhost:3001", Some("test-token".to_string()));
    assert!(client.has_token());
}

#[tokio::test]
async fn test_api_client_set_token() {
    let mut client = ApiClient::new("http://localhost:3001", None);
    assert!(!client.has_token());

    client.set_token(Some("new-token".to_string()));
    assert!(client.has_token());

    client.set_token(None);
    assert!(!client.has_token());
}

#[tokio::test]
async fn test_api_client_base_url_trailing_slash() {
    let client = ApiClient::new("http://localhost:3001/", None);
    assert_eq!(client.base_url(), "http://localhost:3001");
}

#[tokio::test]
async fn test_api_client_test_connection_failure() {
    let client = ApiClient::new("http://localhost:9999", None);
    let result = client.test_connection().await.unwrap();
    assert!(!result);
}
