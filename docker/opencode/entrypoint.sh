#!/bin/bash
set -e

echo "=== OpenCode Container Starting ==="

# Clone project if workspace is empty and repo URL is provided
if [ ! -d "/workspace/.git" ] && [ -n "$FORGEJO_REPO_URL" ]; then
    echo "Cloning repository from Forgejo..."
    
    # If credentials are provided, use them
    if [ -n "$FORGEJO_USER" ] && [ -n "$FORGEJO_TOKEN" ]; then
        # Extract host from URL and inject credentials
        REPO_URL_WITH_AUTH=$(echo "$FORGEJO_REPO_URL" | sed "s|://|://${FORGEJO_USER}:${FORGEJO_TOKEN}@|")
        git clone "$REPO_URL_WITH_AUTH" /workspace
    else
        git clone "$FORGEJO_REPO_URL" /workspace
    fi
    
    echo "Repository cloned successfully."
elif [ -d "/workspace/.git" ]; then
    echo "Existing git repository found in workspace."
else
    echo "No repository URL provided and no existing repo. Starting with empty workspace."
fi

# Configure git for commits made by OpenCode
git config --global user.email "${GIT_USER_EMAIL:-opencode@portable-command-center.local}"
git config --global user.name "${GIT_USER_NAME:-OpenCode}"
git config --global --add safe.directory /workspace

# Display startup info
echo "=== Configuration ==="
echo "Workspace: /workspace"
echo "Port: ${OPENCODE_PORT:-4096}"
echo "Host: ${OPENCODE_HOST:-0.0.0.0}"
echo "===================="

# Move to workspace and start OpenCode server
cd /workspace

echo "Starting OpenCode server..."
exec opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "${OPENCODE_HOST:-0.0.0.0}"
