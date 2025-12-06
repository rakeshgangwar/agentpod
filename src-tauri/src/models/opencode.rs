//! OpenCode data models
//!
//! These models represent the data structures used by the OpenCode API.

use serde::{Deserialize, Serialize};

// =============================================================================
// Session Models
// =============================================================================

/// Session time info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTime {
    pub created: u64,
    pub updated: u64,
}

/// OpenCode session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(rename = "projectID", skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<SessionTime>,
    // Legacy fields for compatibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
}

// =============================================================================
// Message Models
// =============================================================================

/// Message role
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
}

/// Message part type - matches OpenCode API types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum MessagePartType {
    Text,
    Tool,
    #[serde(rename = "tool-invocation")]
    ToolInvocation,
    #[serde(rename = "tool-result")]
    ToolResult,
    #[serde(rename = "step-start")]
    StepStart,
    #[serde(rename = "step-finish")]
    StepFinish,
    File,
    Patch,
    #[serde(other)]
    Unknown,
}

/// Message time info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageTime {
    pub created: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<u64>,
}

/// Message part time info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartTime {
    pub start: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<u64>,
}

/// Token cache info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenCache {
    pub read: u64,
    pub write: u64,
}

/// Token usage info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input: u64,
    pub output: u64,
    #[serde(default)]
    pub reasoning: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache: Option<TokenCache>,
}

/// Message path info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePath {
    pub cwd: String,
    pub root: String,
}

/// Message info (metadata) - matches actual OpenCode API response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub role: MessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<MessageTime>,
    #[serde(rename = "parentID", skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(rename = "modelID", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(rename = "providerID", skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<MessagePath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish: Option<String>,
}

/// Tool invocation state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInvocation {
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    #[serde(rename = "toolName")]
    pub tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
}

/// Tool state - used in "tool" type parts (current OpenCode format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<PartTime>,
}

/// A part of a message (text, tool call, file, etc.) - matches actual OpenCode API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePart {
    pub id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    #[serde(rename = "messageID")]
    pub message_id: String,
    #[serde(rename = "type")]
    pub part_type: MessagePartType,
    // Text content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    // Step tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    // Timing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<PartTime>,
    // Cost/tokens for step-finish
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<TokenUsage>,
    // Tool invocation (legacy format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_invocation: Option<ToolInvocation>,
    // Tool (current OpenCode format) - type: "tool"
    #[serde(rename = "callID", skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<ToolState>,
    // File info
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
}

/// Complete message with info and parts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub info: MessageInfo,
    pub parts: Vec<MessagePart>,
}

/// Input for creating a message part (for sending messages)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePartInput {
    #[serde(rename = "type")]
    pub part_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
}

/// Input for sending a message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageInput {
    pub parts: Vec<MessagePartInput>,
}

// =============================================================================
// File Models
// =============================================================================

/// File node type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileNodeType {
    File,
    Directory,
}

/// File system node (file or directory) - matches actual OpenCode API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: FileNodeType,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute: Option<String>,
    #[serde(default)]
    pub ignored: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// File content response - matches actual OpenCode API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub content: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

// =============================================================================
// App Info
// =============================================================================

/// OpenCode app information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

// =============================================================================
// Health Check
// =============================================================================

/// OpenCode health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeHealth {
    pub healthy: bool,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// =============================================================================
// SSE Event Models
// =============================================================================

/// SSE event from OpenCode stream
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeEvent {
    /// Event type (e.g., "session.updated", "message.part.updated", "tool.execute")
    pub event_type: String,
    /// Event data (varies by event type)
    pub data: serde_json::Value,
}

/// SSE stream connection result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamConnection {
    /// Unique stream ID for this connection
    pub stream_id: String,
    /// Project ID this stream is connected to
    pub project_id: String,
}

/// SSE stream status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamStatus {
    Connected,
    Disconnected,
    Error,
}

/// SSE stream event payload (emitted to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventPayload {
    pub stream_id: String,
    pub project_id: String,
    pub event: OpenCodeEvent,
}

/// SSE stream status payload (emitted to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatusPayload {
    pub stream_id: String,
    pub project_id: String,
    pub status: StreamStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
