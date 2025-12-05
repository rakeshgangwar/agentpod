//! Integration tests for the API client
//!
//! These tests verify that the API client correctly communicates with the Management API.
//! 
//! Run with: cargo test --test api_integration -- --nocapture
//!
//! Environment variables needed:
//! - API_URL: Management API URL (e.g., https://api.superchotu.com)
//! - API_KEY: API authentication token
//! - PROJECT_ID: Test project ID
//! - SESSION_ID: Test session ID (optional, will create one if not provided)

use std::env;

// Re-export types from the library
use codeopen_lib::models::{ConnectionConfig, SendMessageInput, MessagePartInput};
use codeopen_lib::services::api::ApiClient;

/// Helper to get test configuration from environment
fn get_test_config() -> Option<(ConnectionConfig, String)> {
    let api_url = env::var("API_URL").ok()?;
    let api_key = env::var("API_KEY").ok()?;
    let project_id = env::var("PROJECT_ID").ok()?;
    
    Some((
        ConnectionConfig {
            api_url,
            api_key: Some(api_key),
        },
        project_id,
    ))
}

/// Helper to get or create session ID
fn get_session_id() -> Option<String> {
    env::var("SESSION_ID").ok()
}

#[tokio::test]
async fn test_health_check() {
    // Initialize tracing for test output
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let (config, _) = match get_test_config() {
        Some(c) => c,
        None => {
            println!("Skipping test: API_URL, API_KEY, PROJECT_ID not set");
            return;
        }
    };

    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    println!("Testing health check against: {}", config.api_url);
    
    let result = client.health_check().await;
    
    match &result {
        Ok(health) => println!("Health check result: {:?}", health),
        Err(e) => println!("Health check error: {:?}", e),
    }
    
    assert!(result.is_ok(), "Health check should succeed");
    assert_eq!(result.unwrap().status, "ok");
}

#[tokio::test]
async fn test_list_sessions() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let (config, project_id) = match get_test_config() {
        Some(c) => c,
        None => {
            println!("Skipping test: environment variables not set");
            return;
        }
    };

    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    println!("Listing sessions for project: {}", project_id);
    
    let result = client.opencode_list_sessions(&project_id).await;
    
    match &result {
        Ok(sessions) => {
            println!("Found {} sessions", sessions.len());
            for session in sessions {
                println!("  - Session: {} (title: {:?})", session.id, session.title);
            }
        }
        Err(e) => println!("List sessions error: {:?}", e),
    }
    
    assert!(result.is_ok(), "List sessions should succeed");
}

#[tokio::test]
async fn test_send_message() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let (config, project_id) = match get_test_config() {
        Some(c) => c,
        None => {
            println!("Skipping test: environment variables not set");
            return;
        }
    };

    let session_id = match get_session_id() {
        Some(id) => id,
        None => {
            println!("Skipping test: SESSION_ID not set");
            return;
        }
    };

    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    println!("Sending message to session: {}", session_id);
    println!("Project: {}", project_id);
    
    let input = SendMessageInput {
        parts: vec![MessagePartInput {
            part_type: "text".to_string(),
            text: Some("What is 2+2? Answer with just the number.".to_string()),
            url: None,
            filename: None,
            mime: None,
        }],
    };
    
    println!("Request payload: {:?}", serde_json::to_string(&input));
    
    let result = client.opencode_send_message(&project_id, &session_id, input).await;
    
    match &result {
        Ok(message) => {
            println!("Message sent successfully!");
            println!("  Message ID: {}", message.info.id);
            println!("  Role: {:?}", message.info.role);
            println!("  Parts count: {}", message.parts.len());
            for part in &message.parts {
                if let Some(text) = &part.text {
                    println!("  Text: {}", text);
                }
            }
        }
        Err(e) => {
            println!("Send message error: {:?}", e);
        }
    }
    
    assert!(result.is_ok(), "Send message should succeed: {:?}", result.err());
}

#[tokio::test]
async fn test_opencode_health() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let (config, project_id) = match get_test_config() {
        Some(c) => c,
        None => {
            println!("Skipping test: environment variables not set");
            return;
        }
    };

    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    println!("Checking OpenCode health for project: {}", project_id);
    
    let result = client.opencode_health_check(&project_id).await;
    
    match &result {
        Ok(health) => {
            println!("OpenCode health: {:?}", health);
        }
        Err(e) => {
            println!("OpenCode health error: {:?}", e);
        }
    }
    
    assert!(result.is_ok(), "OpenCode health check should succeed");
}

#[tokio::test]
async fn test_sse_connection() {
    use futures::StreamExt;
    
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let (config, project_id) = match get_test_config() {
        Some(c) => c,
        None => {
            println!("Skipping test: environment variables not set");
            return;
        }
    };

    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    println!("Connecting to SSE stream for project: {}", project_id);
    
    let result = client.opencode_connect_event_stream(&project_id).await;
    
    match result {
        Ok(response) => {
            println!("SSE connection established!");
            println!("Status: {}", response.status());
            println!("Headers: {:?}", response.headers());
            
            // Read first few bytes to verify streaming works
            let mut stream = response.bytes_stream();
            let mut total_bytes = 0;
            let mut events_received = 0;
            
            println!("Reading SSE events (will timeout after 5 seconds)...");
            
            let timeout = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                async {
                    while let Some(chunk) = stream.next().await {
                        match chunk {
                            Ok(bytes) => {
                                total_bytes += bytes.len();
                                let text = String::from_utf8_lossy(&bytes);
                                println!("Received chunk ({} bytes): {}", bytes.len(), text.trim());
                                
                                // Count events (lines starting with "event:")
                                events_received += text.matches("event:").count();
                                
                                if events_received >= 2 {
                                    break;
                                }
                            }
                            Err(e) => {
                                println!("Stream error: {:?}", e);
                                break;
                            }
                        }
                    }
                }
            ).await;
            
            match timeout {
                Ok(_) => println!("Stream read completed"),
                Err(_) => println!("Stream read timed out (expected)"),
            }
            
            println!("Total bytes received: {}", total_bytes);
            println!("Events received: {}", events_received);
            
            assert!(total_bytes > 0, "Should receive some data from SSE stream");
        }
        Err(e) => {
            println!("SSE connection error: {:?}", e);
            panic!("SSE connection should succeed");
        }
    }
}
