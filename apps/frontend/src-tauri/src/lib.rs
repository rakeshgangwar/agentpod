//! CodeOpen - Portable Command Center for OpenCode
//!
//! This is the Tauri backend for the CodeOpen desktop/mobile app.
//! It provides secure connection management and API client functionality
//! for communicating with the Management API.

pub mod commands;
pub mod models;
pub mod services;

use commands::{
    // Auth commands (Better Auth session tokens)
    auth_store_session, auth_get_status, auth_logout,
    auth_get_user, auth_get_token, auth_is_authenticated,
    // Connection commands
    connect, disconnect, get_connection_status, test_connection,
    // Sandbox commands (v2, direct Docker orchestration)
    docker_health, list_sandboxes, get_sandbox, create_sandbox, delete_sandbox,
    start_sandbox, stop_sandbox, restart_sandbox, pause_sandbox, unpause_sandbox,
    get_sandbox_logs, get_sandbox_stats, get_sandbox_status,
    exec_in_sandbox,
    get_sandbox_git_status, get_sandbox_git_log, commit_sandbox_changes,
    // Sandbox OpenCode commands (v2)
    sandbox_opencode_get_app_info, sandbox_opencode_health_check, sandbox_opencode_get_providers,
    sandbox_opencode_get_agents,
    sandbox_opencode_list_sessions, sandbox_opencode_create_session, sandbox_opencode_get_session,
    sandbox_opencode_delete_session, sandbox_opencode_abort_session,
    sandbox_opencode_respond_permission,
    sandbox_opencode_list_messages, sandbox_opencode_send_message, sandbox_opencode_get_message,
    sandbox_opencode_list_files, sandbox_opencode_get_file_content, sandbox_opencode_find_files,
    sandbox_opencode_connect_stream, sandbox_opencode_disconnect_stream,
    // Resource tier commands (modular containers)
    list_resource_tiers, get_default_resource_tier,
    // Container flavor commands
    list_container_flavors, get_default_container_flavor,
    // Container addon commands
    list_container_addons, list_non_gpu_addons,
    // Settings commands
    get_settings, save_settings, list_providers, get_default_provider,
    export_settings, import_settings,
    // Provider commands
    list_providers_with_models, configure_provider_api_key,
    init_oauth_flow, poll_oauth_flow, cancel_oauth_flow,
    remove_provider_credentials, set_default_provider,
    list_configured_providers,
    // Anthropic OAuth commands (PKCE flow)
    anthropic_oauth_init, anthropic_oauth_callback, anthropic_oauth_status,
    // User OpenCode config commands
    get_user_opencode_config, update_user_opencode_settings, update_user_agents_md,
    list_user_opencode_files, upsert_user_opencode_file, delete_user_opencode_file,
    // AI Assistant (Agent) commands
    list_agents, get_agent, get_agent_modes,
    spawn_agent, stop_agent,
    init_agent_auth, complete_agent_auth, get_agent_auth_status,
    add_custom_agent, remove_agent,
    set_default_agent, get_default_agent,
};
use tauri::{Manager, RunEvent, WindowEvent};
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
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            // Auth commands (Better Auth session tokens)
            auth_store_session,
            auth_get_status,
            auth_logout,
            auth_get_user,
            auth_get_token,
            auth_is_authenticated,
            // Connection commands
            connect,
            disconnect,
            test_connection,
            get_connection_status,
            // Sandbox commands (v2, direct Docker orchestration)
            docker_health,
            list_sandboxes,
            get_sandbox,
            create_sandbox,
            delete_sandbox,
            start_sandbox,
            stop_sandbox,
            restart_sandbox,
            pause_sandbox,
            unpause_sandbox,
            get_sandbox_logs,
            get_sandbox_stats,
            get_sandbox_status,
            exec_in_sandbox,
            get_sandbox_git_status,
            get_sandbox_git_log,
            commit_sandbox_changes,
            // Sandbox OpenCode commands (v2)
            sandbox_opencode_get_app_info,
            sandbox_opencode_health_check,
            sandbox_opencode_get_providers,
            sandbox_opencode_get_agents,
            sandbox_opencode_list_sessions,
            sandbox_opencode_create_session,
            sandbox_opencode_get_session,
            sandbox_opencode_delete_session,
            sandbox_opencode_abort_session,
            sandbox_opencode_respond_permission,
            sandbox_opencode_list_messages,
            sandbox_opencode_send_message,
            sandbox_opencode_get_message,
            sandbox_opencode_list_files,
            sandbox_opencode_get_file_content,
            sandbox_opencode_find_files,
            sandbox_opencode_connect_stream,
            sandbox_opencode_disconnect_stream,
            // Resource tier commands (modular containers)
            list_resource_tiers,
            get_default_resource_tier,
            // Container flavor commands
            list_container_flavors,
            get_default_container_flavor,
            // Container addon commands
            list_container_addons,
            list_non_gpu_addons,
            // Settings commands
            get_settings,
            save_settings,
            list_providers,
            get_default_provider,
            export_settings,
            import_settings,
            // Provider commands
            list_providers_with_models,
            list_configured_providers,
            configure_provider_api_key,
            init_oauth_flow,
            poll_oauth_flow,
            cancel_oauth_flow,
            remove_provider_credentials,
            set_default_provider,
            // Anthropic OAuth commands (PKCE flow)
            anthropic_oauth_init,
            anthropic_oauth_callback,
            anthropic_oauth_status,
            // User OpenCode config commands
            get_user_opencode_config,
            update_user_opencode_settings,
            update_user_agents_md,
            list_user_opencode_files,
            upsert_user_opencode_file,
            delete_user_opencode_file,
            // AI Assistant (Agent) commands
            list_agents,
            get_agent,
            get_agent_modes,
            spawn_agent,
            stop_agent,
            init_agent_auth,
            complete_agent_auth,
            get_agent_auth_status,
            add_custom_agent,
            remove_agent,
            set_default_agent,
            get_default_agent,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Handle window events
            if let RunEvent::WindowEvent { 
                label, 
                event: WindowEvent::CloseRequested { .. }, 
                .. 
            } = &event {
                // When main window close is requested, close all service windows first
                if label == "main" {
                    tracing::info!("Main window closing, closing all service windows");
                    let windows = app_handle.webview_windows();
                    for (window_label, window) in windows {
                        // Close all windows that start with "service-"
                        if window_label.starts_with("service-") {
                            tracing::debug!("Closing service window: {}", window_label);
                            let _ = window.close();
                        }
                    }
                }
            }
        });
}
