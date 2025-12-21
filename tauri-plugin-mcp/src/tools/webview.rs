use serde::Deserialize;
use serde_json::Value;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

fn default_window_label() -> String {
    "main".to_string()
}

#[derive(Debug, Deserialize)]
struct GetElementPositionPayload {
    #[serde(default = "default_window_label")]
    window_label: String,
    selector_type: String,
    selector_value: String,
    #[serde(default)]
    should_click: bool,
    #[serde(default)]
    raw_coordinates: bool,
}

pub async fn handle_get_element_position<R: Runtime>(
    app: &AppHandle<R>,
    payload: Value,
) -> Result<crate::socket_server::SocketResponse, crate::error::Error> {
    let payload = serde_json::from_value::<GetElementPositionPayload>(payload).map_err(|e| {
        crate::error::Error::Anyhow(format!("Invalid payload for get_element_position: {}", e))
    })?;

    let (tx, rx) = mpsc::channel();

    app.once("get-element-position-response", move |event| {
        let payload = event.payload().to_string();
        let _ = tx.send(payload);
    });

    let js_payload = serde_json::json!({
        "windowLabel": payload.window_label,
        "selectorType": payload.selector_type,
        "selectorValue": payload.selector_value,
        "shouldClick": payload.should_click,
        "rawCoordinates": payload.raw_coordinates
    });

    app.emit_to(&payload.window_label, "get-element-position", js_payload)
        .map_err(|e| {
            crate::error::Error::Anyhow(format!("Failed to emit get-element-position event: {}", e))
        })?;

    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(result) => {
            let result_value: Value = serde_json::from_str(&result).map_err(|e| {
                crate::error::Error::Anyhow(format!("Failed to parse result: {}", e))
            })?;

            let success = result_value
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if success {
                Ok(crate::socket_server::SocketResponse {
                    success: true,
                    data: Some(result_value.get("data").cloned().unwrap_or(Value::Null)),
                    error: None,
                })
            } else {
                let error = result_value
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error occurred");

                Ok(crate::socket_server::SocketResponse {
                    success: false,
                    data: None,
                    error: Some(error.to_string()),
                })
            }
        }
        Err(e) => Ok(crate::socket_server::SocketResponse {
            success: false,
            data: None,
            error: Some(format!(
                "Timeout waiting for element position result: {}",
                e
            )),
        }),
    }
}

#[derive(Debug, Deserialize)]
struct SendTextToElementPayload {
    #[serde(default = "default_window_label")]
    window_label: String,
    selector_type: String,
    selector_value: String,
    text: String,
    #[serde(default = "default_delay_ms")]
    delay_ms: u32,
}

fn default_delay_ms() -> u32 {
    20
}

pub async fn handle_send_text_to_element<R: Runtime>(
    app: &AppHandle<R>,
    payload: Value,
) -> Result<crate::socket_server::SocketResponse, crate::error::Error> {
    let payload = serde_json::from_value::<SendTextToElementPayload>(payload).map_err(|e| {
        crate::error::Error::Anyhow(format!("Invalid payload for send_text_to_element: {}", e))
    })?;

    let (tx, rx) = mpsc::channel();

    app.once("send-text-to-element-response", move |event| {
        let payload = event.payload().to_string();
        let _ = tx.send(payload);
    });

    let js_payload = serde_json::json!({
        "selectorType": payload.selector_type,
        "selectorValue": payload.selector_value,
        "text": payload.text,
        "delayMs": payload.delay_ms
    });

    app.emit_to(&payload.window_label, "send-text-to-element", js_payload)
        .map_err(|e| {
            crate::error::Error::Anyhow(format!("Failed to emit send-text-to-element event: {}", e))
        })?;

    match rx.recv_timeout(std::time::Duration::from_secs(30)) {
        Ok(result) => {
            let result_value: Value = serde_json::from_str(&result).map_err(|e| {
                crate::error::Error::Anyhow(format!("Failed to parse result: {}", e))
            })?;

            let success = result_value
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if success {
                Ok(crate::socket_server::SocketResponse {
                    success: true,
                    data: Some(result_value.get("data").cloned().unwrap_or(Value::Null)),
                    error: None,
                })
            } else {
                let error = result_value
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error occurred");

                Ok(crate::socket_server::SocketResponse {
                    success: false,
                    data: None,
                    error: Some(error.to_string()),
                })
            }
        }
        Err(e) => Ok(crate::socket_server::SocketResponse {
            success: false,
            data: None,
            error: Some(format!("Timeout waiting for text input completion: {}", e)),
        }),
    }
}
