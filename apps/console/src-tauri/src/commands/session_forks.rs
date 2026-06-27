use crate::models::{
    AncestryResponse, AppError, BranchesResponse, ChildrenResponse, CreateForkInput,
    ForkInfoResponse, ForkStatistics, ListForksResponse, SessionFork, TagsResponse,
};
use crate::services::ApiClient;

fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

#[tauri::command]
pub async fn list_session_forks(sandbox_id: String) -> Result<ListForksResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/forks", sandbox_id))
        .await
}

#[tauri::command]
pub async fn get_fork_statistics(sandbox_id: String) -> Result<ForkStatistics, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/forks/statistics", sandbox_id))
        .await
}

#[tauri::command]
pub async fn create_session_fork(
    sandbox_id: String,
    session_id: String,
    message_id: Option<String>,
    message_role: Option<String>,
    reason: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<SessionFork, AppError> {
    let client = get_client()?;
    let input = CreateForkInput {
        message_id,
        message_role,
        reason,
        tags,
        agent_config: None,
    };
    client
        .post(
            &format!(
                "/api/v2/sandboxes/{}/sessions/{}/fork",
                sandbox_id, session_id
            ),
            &input,
        )
        .await
}

#[tauri::command]
pub async fn get_session_ancestry(
    sandbox_id: String,
    session_id: String,
) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    let response: AncestryResponse = client
        .get(&format!(
            "/api/v2/sandboxes/{}/sessions/{}/ancestry",
            sandbox_id, session_id
        ))
        .await?;
    Ok(response.ancestry)
}

#[tauri::command]
pub async fn get_session_children(
    sandbox_id: String,
    session_id: String,
) -> Result<Vec<SessionFork>, AppError> {
    let client = get_client()?;
    let response: ChildrenResponse = client
        .get(&format!(
            "/api/v2/sandboxes/{}/sessions/{}/children",
            sandbox_id, session_id
        ))
        .await?;
    Ok(response.children)
}

#[tauri::command]
pub async fn get_session_branches(
    sandbox_id: String,
    session_id: String,
) -> Result<BranchesResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/sessions/{}/branches",
            sandbox_id, session_id
        ))
        .await
}

#[tauri::command]
pub async fn add_session_tag(
    sandbox_id: String,
    session_id: String,
    tag: String,
) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({ "tag": tag });
    let response: TagsResponse = client
        .post(
            &format!(
                "/api/v2/sandboxes/{}/sessions/{}/tags",
                sandbox_id, session_id
            ),
            &body,
        )
        .await?;
    Ok(response.tags)
}

#[tauri::command]
pub async fn remove_session_tag(
    sandbox_id: String,
    session_id: String,
    tag: String,
) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    let encoded_tag = urlencoding::encode(&tag);
    let response: TagsResponse = client
        .delete(&format!(
            "/api/v2/sandboxes/{}/sessions/{}/tags/{}",
            sandbox_id, session_id, encoded_tag
        ))
        .await?;
    Ok(response.tags)
}

#[tauri::command]
pub async fn set_session_tags(
    sandbox_id: String,
    session_id: String,
    tags: Vec<String>,
) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({ "tags": tags });
    let response: TagsResponse = client
        .put(
            &format!(
                "/api/v2/sandboxes/{}/sessions/{}/tags",
                sandbox_id, session_id
            ),
            &body,
        )
        .await?;
    Ok(response.tags)
}

#[tauri::command]
pub async fn get_session_fork_info(
    sandbox_id: String,
    session_id: String,
) -> Result<ForkInfoResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/sessions/{}/fork-info",
            sandbox_id, session_id
        ))
        .await
}
