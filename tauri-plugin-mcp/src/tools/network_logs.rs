use serde::Deserialize;
use serde_json::Value;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

#[derive(Debug, Deserialize)]
struct GetNetworkLogsPayload {
    #[serde(default = "default_window_label")]
    window_label: String,
    method: Option<String>,
    url_pattern: Option<String>,
    status: Option<u16>,
    #[serde(default = "default_limit")]
    limit: u32,
    #[serde(default)]
    clear: bool,
}

fn default_window_label() -> String {
    "main".to_string()
}

fn default_limit() -> u32 {
    100
}

pub async fn handle_get_network_logs<R: Runtime>(
    app: &AppHandle<R>,
    payload: Value,
) -> Result<crate::socket_server::SocketResponse, crate::error::Error> {
    let parsed: GetNetworkLogsPayload = serde_json::from_value(payload.clone()).map_err(|e| {
        crate::error::Error::Anyhow(format!("Invalid payload for get_network_logs: {}", e))
    })?;

    let _window = app
        .get_webview_window(&parsed.window_label)
        .ok_or_else(|| {
            crate::error::Error::Anyhow(format!("Window not found: {}", parsed.window_label))
        })?;

    let (tx, rx) = mpsc::channel();
    app.once("get-network-logs-response", move |event| {
        let payload = event.payload().to_string();
        let _ = tx.send(payload);
    });

    let js_payload = serde_json::json!({
        "method": parsed.method,
        "urlPattern": parsed.url_pattern,
        "status": parsed.status,
        "limit": parsed.limit,
        "clear": parsed.clear
    });

    app.emit_to(&parsed.window_label, "get-network-logs", &js_payload)
        .map_err(|e| {
            crate::error::Error::Anyhow(format!("Failed to emit get-network-logs event: {}", e))
        })?;

    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(response_str) => {
            let result: Value = serde_json::from_str(&response_str).map_err(|e| {
                crate::error::Error::Anyhow(format!("Failed to parse response: {}", e))
            })?;

            let success = result
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if success {
                Ok(crate::socket_server::SocketResponse {
                    success: true,
                    data: result.get("data").cloned(),
                    error: None,
                })
            } else {
                Ok(crate::socket_server::SocketResponse {
                    success: false,
                    data: None,
                    error: result
                        .get("error")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                })
            }
        }
        Err(e) => Ok(crate::socket_server::SocketResponse {
            success: false,
            data: None,
            error: Some(format!("Timeout waiting for network logs: {}", e)),
        }),
    }
}
