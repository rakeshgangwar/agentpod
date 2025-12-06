//! CodeOpen - Portable Command Center for OpenCode
//!
//! This is the Tauri backend for the CodeOpen desktop/mobile app.
//! It provides secure connection management and API client functionality
//! for communicating with the Management API.

pub mod commands;
pub mod models;
pub mod services;

use commands::{
    // Connection commands
    connect, disconnect, get_connection_status, test_connection,
    // Project commands
    list_projects, get_project, create_project, delete_project,
    start_project, stop_project, restart_project,
    get_project_logs, deploy_project,
    // Settings commands
    get_settings, save_settings, list_providers, get_default_provider,
    export_settings, import_settings,
    // Provider commands (new)
    list_providers_with_models, configure_provider_api_key,
    init_oauth_flow, poll_oauth_flow, cancel_oauth_flow,
    remove_provider_credentials, set_default_provider,
    // OpenCode commands
    opencode_get_app_info, opencode_health_check,
    opencode_list_sessions, opencode_create_session, opencode_get_session,
    opencode_delete_session, opencode_abort_session,
    opencode_list_messages, opencode_send_message, opencode_send_message_with_files,
    opencode_get_message,
    opencode_list_files, opencode_get_file_content, opencode_find_files,
    // OpenCode streaming commands
    opencode_connect_stream, opencode_disconnect_stream,
};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber for logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("codeopen_lib=debug".parse().unwrap()))
        .init();
    
    tracing::info!("Starting CodeOpen with tracing enabled");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Connection commands
            connect,
            disconnect,
            test_connection,
            get_connection_status,
            // Project commands
            list_projects,
            get_project,
            create_project,
            delete_project,
            start_project,
            stop_project,
            restart_project,
            get_project_logs,
            deploy_project,
            // Settings commands
            get_settings,
            save_settings,
            list_providers,
            get_default_provider,
            export_settings,
            import_settings,
            // Provider commands (new)
            list_providers_with_models,
            configure_provider_api_key,
            init_oauth_flow,
            poll_oauth_flow,
            cancel_oauth_flow,
            remove_provider_credentials,
            set_default_provider,
            // OpenCode commands - App Info & Health
            opencode_get_app_info,
            opencode_health_check,
            // OpenCode commands - Sessions
            opencode_list_sessions,
            opencode_create_session,
            opencode_get_session,
            opencode_delete_session,
            opencode_abort_session,
            // OpenCode commands - Messages
            opencode_list_messages,
            opencode_send_message,
            opencode_send_message_with_files,
            opencode_get_message,
            // OpenCode commands - Files
            opencode_list_files,
            opencode_get_file_content,
            opencode_find_files,
            // OpenCode commands - Streaming
            opencode_connect_stream,
            opencode_disconnect_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
