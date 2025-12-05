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
    // OpenCode commands
    opencode_get_app_info, opencode_health_check,
    opencode_list_sessions, opencode_create_session, opencode_get_session,
    opencode_delete_session, opencode_abort_session,
    opencode_list_messages, opencode_send_message, opencode_send_message_with_files,
    opencode_get_message,
    opencode_list_files, opencode_get_file_content, opencode_find_files,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
