//! Debug test for send message

use std::env;
use codeopen_lib::models::{SendMessageInput, MessagePartInput, Message};
use codeopen_lib::services::api::ApiClient;

#[tokio::test]
async fn test_send_message_via_api_client() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_test_writer()
        .try_init();

    let api_url = env::var("API_URL").expect("API_URL not set");
    let api_key = env::var("API_KEY").expect("API_KEY not set");
    let project_id = env::var("PROJECT_ID").expect("PROJECT_ID not set");
    let session_id = env::var("SESSION_ID").expect("SESSION_ID not set");
    
    let config = codeopen_lib::models::ConnectionConfig {
        api_url,
        api_key: Some(api_key),
    };
    
    let client = ApiClient::new(&config).expect("Failed to create API client");
    
    let input = SendMessageInput {
        parts: vec![MessagePartInput {
            part_type: "text".to_string(),
            text: Some("Test via API client".to_string()),
            url: None,
            filename: None,
            mime: None,
        }],
    };
    
    println!("Sending message via ApiClient...");
    
    let result = client.opencode_send_message(&project_id, &session_id, input).await;
    
    match &result {
        Ok(msg) => {
            println!("SUCCESS! Message ID: {}", msg.info.id);
            for part in &msg.parts {
                if let Some(text) = &part.text {
                    println!("Response text: {}", text);
                }
            }
        }
        Err(e) => {
            println!("ERROR: {:?}", e);
        }
    }
    
    assert!(result.is_ok(), "Send message should succeed: {:?}", result.err());
}

#[tokio::test]
async fn test_deserialize_message() {
    // Test if the Message struct can deserialize the API response
    let json_response = r#"{"info":{"id":"msg_test","sessionID":"ses_test","role":"assistant","time":{"created":123,"completed":456},"parentID":"msg_parent","modelID":"claude","providerID":"anthropic","mode":"build","path":{"cwd":"/workspace","root":"/workspace"},"cost":0.001,"tokens":{"input":3,"output":24,"reasoning":0,"cache":{"read":100,"write":18}},"finish":"stop"},"parts":[{"id":"prt_test","sessionID":"ses_test","messageID":"msg_test","type":"text","text":"Hello!","time":{"start":123,"end":456}}]}"#;
    
    println!("Attempting to deserialize: {}", json_response);
    
    let result: Result<Message, _> = serde_json::from_str(json_response);
    
    match result {
        Ok(msg) => {
            println!("Deserialization SUCCESS!");
            println!("Message ID: {}", msg.info.id);
        }
        Err(e) => {
            println!("Deserialization FAILED: {}", e);
            panic!("Failed to deserialize");
        }
    }
}
