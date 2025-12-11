#!/bin/bash
set -e

echo "=============================================="
echo "  AgentPod Container v${CONTAINER_VERSION:-0.2.0}"
echo "=============================================="

# =============================================================================
# Environment Variables (expected)
# =============================================================================
# MANAGEMENT_API_URL    - URL of the Management API
# AUTH_TOKEN            - Bearer token for Management API authentication
# USER_ID               - User identifier for fetching config
# PROJECT_NAME          - Project display name
# PROJECT_SLUG          - Project slug for URLs
# FORGEJO_REPO_URL      - Git repository URL
# FORGEJO_USER          - Git username for auth
# FORGEJO_TOKEN         - Git token for auth
# OPENCODE_AUTH_JSON    - Pre-built auth.json content (for LLM providers)
# OPENCODE_CONFIG_JSON  - Pre-built opencode.json content (optional, fallback)
# OPENCODE_PORT         - Port for OpenCode server (default: 4096)
# OPENCODE_HOST         - Host for OpenCode server (default: 0.0.0.0)
# ACP_GATEWAY_PORT      - Port for ACP Gateway (default: 4097)
# ADDON_IDS             - Comma-separated list of addon IDs to install
# WILDCARD_DOMAIN       - Domain for URL generation (default: superchotu.com)
# SSO_URL               - Central SSO URL (default: https://sso.superchotu.com)
# =============================================================================

HOME_DIR="/home/developer"
WORKSPACE="${HOME_DIR}/workspace"
OPENCODE_CONFIG_DIR="${HOME_DIR}/.config/opencode"
OPENCODE_CUSTOM_CONFIG_DIR="${HOME_DIR}/.config/opencode-custom"
OPENCODE_DATA_DIR="${HOME_DIR}/.local/share/opencode"

# Source common functions if available
if [ -f /opt/agentpod/scripts/common-setup.sh ]; then
    source /opt/agentpod/scripts/common-setup.sh
fi

# =============================================================================
# Fetch User Configuration from Management API
# =============================================================================
fetch_user_config() {
    if [ -z "$MANAGEMENT_API_URL" ] || [ -z "$USER_ID" ]; then
        echo "No MANAGEMENT_API_URL or USER_ID provided. Skipping remote config fetch."
        return 1
    fi
    
    echo "Fetching user configuration from Management API..."
    
    # Build the correct API endpoint URL
    CONFIG_URL="${MANAGEMENT_API_URL}/api/users/${USER_ID}/opencode/config"
    echo "  URL: $CONFIG_URL"
    
    # Build curl command with optional auth header
    CURL_OPTS="-sf --connect-timeout 10 --max-time 30"
    if [ -n "$AUTH_TOKEN" ]; then
        CURL_OPTS="$CURL_OPTS -H 'Authorization: Bearer ${AUTH_TOKEN}'"
    fi
    
    # Fetch config
    RESPONSE=$(eval curl $CURL_OPTS "'$CONFIG_URL'" 2>/dev/null) || {
        echo "  Warning: Failed to fetch config from Management API. Using defaults."
        return 1
    }
    
    # Validate JSON response
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
        echo "  Warning: Invalid JSON response from Management API. Using defaults."
        return 1
    fi
    
    echo "  Configuration fetched successfully."
    
    # Extract and write AGENTS.md (global instructions)
    AGENTS_CONTENT=$(echo "$RESPONSE" | jq -r '.agents_md // empty')
    if [ -n "$AGENTS_CONTENT" ] && [ "$AGENTS_CONTENT" != "null" ]; then
        echo "  Writing AGENTS.md to $OPENCODE_CONFIG_DIR/AGENTS.md"
        mkdir -p "$OPENCODE_CONFIG_DIR"
        echo "$AGENTS_CONTENT" > "$OPENCODE_CONFIG_DIR/AGENTS.md"
    fi
    
    # Extract and write user settings to opencode.json
    SETTINGS=$(echo "$RESPONSE" | jq -r '.settings // {}')
    if [ "$SETTINGS" != "{}" ] && [ "$SETTINGS" != "null" ]; then
        echo "  Writing user settings to $OPENCODE_CONFIG_DIR/opencode.json"
        mkdir -p "$OPENCODE_CONFIG_DIR"
        echo "$SETTINGS" > "$OPENCODE_CONFIG_DIR/opencode.json"
    fi
    
    # Extract and write custom config files
    mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"/{agent,command,tool,plugin}
    
    for FILE_TYPE in agent command tool plugin; do
        echo "$RESPONSE" | jq -c ".files[]? | select(.type==\"$FILE_TYPE\")" 2>/dev/null | while IFS= read -r file_json; do
            if [ -n "$file_json" ]; then
                NAME=$(echo "$file_json" | jq -r '.name // empty')
                EXT=$(echo "$file_json" | jq -r '.extension // "md"')
                CONTENT=$(echo "$file_json" | jq -r '.content // empty')
                
                if [ -n "$NAME" ] && [ -n "$CONTENT" ]; then
                    FILENAME="${NAME}.${EXT}"
                    echo "  Writing custom config: $OPENCODE_CUSTOM_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                    echo "$CONTENT" > "$OPENCODE_CUSTOM_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                fi
            fi
        done
    done
    
    export OPENCODE_CONFIG_DIR="$OPENCODE_CUSTOM_CONFIG_DIR"
    return 0
}

# =============================================================================
# Fallback: Use Environment Variables for Configuration
# =============================================================================
setup_fallback_config() {
    echo "Setting up configuration from environment variables..."
    
    # Auth configuration (LLM provider credentials)
    if [ -n "$OPENCODE_AUTH_JSON" ]; then
        echo "  Writing auth.json from OPENCODE_AUTH_JSON"
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "$OPENCODE_AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    else
        echo "  No auth configuration provided. Starting with empty auth."
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "{}" > "$OPENCODE_DATA_DIR/auth.json"
    fi
    
    # OpenCode project config
    if [ -n "$OPENCODE_CONFIG_JSON" ]; then
        echo "  Writing opencode.json from OPENCODE_CONFIG_JSON"
        mkdir -p "$WORKSPACE"
        echo "$OPENCODE_CONFIG_JSON" > "$WORKSPACE/opencode.json"
    else
        echo "  Creating default opencode.json with permissions"
        mkdir -p "$WORKSPACE"
        cat > "$WORKSPACE/opencode.json" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow",
    "bash": "allow",
    "webfetch": "allow",
    "external_directory": "allow"
  }
}
EOF
    fi
}

# =============================================================================
# Setup Auth from Environment
# =============================================================================
setup_auth() {
    if [ -n "$OPENCODE_AUTH_JSON" ]; then
        echo "  Writing auth.json from OPENCODE_AUTH_JSON"
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "$OPENCODE_AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    fi
}

# =============================================================================
# Clone Repository
# =============================================================================
clone_repository() {
    if [ -d "$WORKSPACE/.git" ]; then
        echo "Existing git repository found in workspace."
        echo "  Pulling latest changes..."
        cd "$WORKSPACE"
        git pull --ff-only 2>/dev/null || echo "  Note: Could not pull (may have local changes or be detached)"
        cd - > /dev/null
        return 0
    fi
    
    if [ -z "$FORGEJO_REPO_URL" ]; then
        echo "No repository URL provided. Starting with empty workspace."
        return 0
    fi
    
    if [ -d "$WORKSPACE" ] && [ "$(ls -A $WORKSPACE 2>/dev/null)" ]; then
        echo "Workspace exists but is not a git repository. Cleaning up..."
        rm -rf "$WORKSPACE"
        mkdir -p "$WORKSPACE"
    fi
    
    echo "Cloning repository from Forgejo..."
    echo "  URL: $FORGEJO_REPO_URL"
    
    if [ -n "$FORGEJO_USER" ] && [ -n "$FORGEJO_TOKEN" ]; then
        REPO_URL_WITH_AUTH=$(echo "$FORGEJO_REPO_URL" | sed "s|://|://${FORGEJO_USER}:${FORGEJO_TOKEN}@|")
        git clone "$REPO_URL_WITH_AUTH" "$WORKSPACE" 2>&1 || {
            echo "  Error: Failed to clone repository"
            return 1
        }
    else
        git clone "$FORGEJO_REPO_URL" "$WORKSPACE" 2>&1 || {
            echo "  Error: Failed to clone repository"
            return 1
        }
    fi
    
    echo "  Repository cloned successfully."
}

# =============================================================================
# Configure Git
# =============================================================================
configure_git() {
    echo "Configuring git..."
    git config --global user.email "${GIT_USER_EMAIL:-opencode@container.local}"
    git config --global user.name "${GIT_USER_NAME:-OpenCode}"
    git config --global --add safe.directory "$WORKSPACE"
    git config --global init.defaultBranch main
    git config --global credential.helper 'cache --timeout=86400'
}

# =============================================================================
# Install Addons
# =============================================================================
install_addons() {
    if [ -z "$ADDON_IDS" ]; then
        echo "No addons to install."
        return 0
    fi
    
    echo "Installing addons: $ADDON_IDS"
    
    # Split comma-separated list
    IFS=',' read -ra ADDONS <<< "$ADDON_IDS"
    
    for addon in "${ADDONS[@]}"; do
        addon=$(echo "$addon" | xargs)  # Trim whitespace
        echo "  Installing addon: $addon"
        
        case "$addon" in
            code-server)
                echo "    Installing code-server..."
                curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/usr/local 2>/dev/null || {
                    echo "    Warning: Failed to install code-server"
                    continue
                }
                mkdir -p ~/.config/code-server
                cat > ~/.config/code-server/config.yaml << 'EOF'
bind-addr: 0.0.0.0:8080
auth: none
cert: false
EOF
                echo "    code-server installed successfully"
                ;;
                
            gui)
                echo "    GUI addon requires pre-built image layer (not runtime installation)"
                ;;
                
            databases)
                echo "    Installing database clients..."
                sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends \
                    postgresql-client redis-tools sqlite3 2>/dev/null || {
                    echo "    Warning: Failed to install database clients"
                    continue
                }
                echo "    Database clients installed successfully"
                ;;
                
            cloud)
                echo "    Cloud CLI addon requires pre-built image layer (not runtime installation)"
                ;;
                
            gpu)
                echo "    GPU addon - no installation required (uses NVIDIA runtime)"
                ;;
                
            *)
                echo "    Unknown addon: $addon"
                ;;
        esac
    done
    
    echo "Addon installation complete."
}

# =============================================================================
# Start Homepage Service
# =============================================================================
start_homepage() {
    echo "Starting Homepage service on port ${HOMEPAGE_PORT:-3000}..."
    cd /opt/homepage
    
    # Export environment for homepage
    export PROJECT_NAME="${PROJECT_NAME:-AgentPod Project}"
    export PROJECT_SLUG="${PROJECT_SLUG:-project}"
    export WILDCARD_DOMAIN="${WILDCARD_DOMAIN:-superchotu.com}"
    
    bun run src/index.ts &
    HOMEPAGE_PID=$!
    cd "$WORKSPACE"
    
    # Wait for Homepage to be ready
    for i in {1..15}; do
        if curl -sf "http://localhost:${HOMEPAGE_PORT:-3000}/health" > /dev/null 2>&1; then
            echo "  Homepage is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: Homepage health check timed out."
    return 0
}

# =============================================================================
# Start nginx
# =============================================================================
start_nginx() {
    echo "Starting nginx on port ${NGINX_PORT:-80}..."
    
    # nginx needs to run as root to bind to port 80
    sudo nginx -g 'daemon off;' &
    NGINX_PID=$!
    
    # Wait for nginx to be ready
    for i in {1..15}; do
        if curl -sf "http://localhost:${NGINX_PORT:-80}/health" > /dev/null 2>&1; then
            echo "  nginx is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: nginx health check timed out."
    return 0
}

# =============================================================================
# Start Addon Services (Code Server on port 8080 for hybrid mode)
# =============================================================================
start_addon_services() {
    if [ -z "$ADDON_IDS" ]; then
        return 0
    fi
    
    IFS=',' read -ra ADDONS <<< "$ADDON_IDS"
    
    for addon in "${ADDONS[@]}"; do
        addon=$(echo "$addon" | xargs)
        
        case "$addon" in
            code-server)
                if command -v code-server &> /dev/null; then
                    echo "Starting code-server on port 8080 (hybrid mode - separate subdomain)..."
                    # Override PORT env var and explicitly pass bind-addr to ensure port 8080
                    # code-server respects PORT env var which may conflict with OPENCODE_PORT
                    PORT=8080 code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry &
                    CODE_SERVER_PID=$!
                fi
                ;;
        esac
    done
}

# =============================================================================
# Start OpenCode Server
# =============================================================================
start_opencode_server() {
    echo "Starting OpenCode server on port ${OPENCODE_PORT:-4096}..."
    cd "$WORKSPACE"
    opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "${OPENCODE_HOST:-0.0.0.0}" &
    OPENCODE_PID=$!
    
    # Wait for OpenCode to be ready
    echo "Waiting for OpenCode server to start..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${OPENCODE_PORT:-4096}/session" > /dev/null 2>&1; then
            echo "  OpenCode server is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: OpenCode server health check timed out."
    return 0
}

# =============================================================================
# Start ACP Gateway
# =============================================================================
start_acp_gateway() {
    echo "Starting ACP Gateway on port ${ACP_GATEWAY_PORT:-4097}..."
    cd /opt/acp-gateway
    bun run src/index.ts &
    ACP_PID=$!
    cd "$WORKSPACE"
    
    # Wait for ACP Gateway to be ready
    echo "Waiting for ACP Gateway to start..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${ACP_GATEWAY_PORT:-4097}/health" > /dev/null 2>&1; then
            echo "  ACP Gateway is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: ACP Gateway health check timed out."
    return 0
}

# =============================================================================
# Display Startup Information
# =============================================================================
show_startup_info() {
    local BASE_URL="https://${PROJECT_SLUG:-project}.${WILDCARD_DOMAIN:-superchotu.com}"
    local CODE_URL="https://code-${PROJECT_SLUG:-project}.${WILDCARD_DOMAIN:-superchotu.com}"
    
    echo ""
    echo "=============================================="
    echo "  Environment Ready"
    echo "=============================================="
    echo "  Project:   ${PROJECT_NAME:-AgentPod Project}"
    echo "  User:      developer"
    echo "  Workspace: $WORKSPACE"
    echo ""
    echo "  URLs (with Centralized SSO at ${SSO_URL:-https://sso.superchotu.com}):"
    echo "    - Homepage:    $BASE_URL/"
    echo "    - OpenCode:    $BASE_URL/opencode/"
    echo "    - ACP Gateway: $BASE_URL/acp/"
    echo "    - Code Server: $BASE_URL/code/"
    echo "    - VNC Desktop: $BASE_URL/vnc/"
    if [ -n "$CODE_SERVER_PID" ]; then
        echo "    - Code Server (direct): $CODE_URL/"
    fi
    echo ""
    echo "  Internal Services:"
    echo "    - nginx:        http://localhost:${NGINX_PORT:-80}"
    echo "    - Homepage:     http://localhost:${HOMEPAGE_PORT:-3000}"
    echo "    - OpenCode:     http://localhost:${OPENCODE_PORT:-4096}"
    echo "    - ACP Gateway:  http://localhost:${ACP_GATEWAY_PORT:-4097}"
    echo ""
    echo "  Tools installed:"
    echo "    - Node.js $(node --version 2>/dev/null || echo 'N/A')"
    echo "    - Bun $(bun --version 2>/dev/null || echo 'N/A')"
    echo "    - Git $(git --version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
    echo "=============================================="
    echo ""
}

# =============================================================================
# Handle shutdown gracefully
# =============================================================================
cleanup() {
    echo "Shutting down..."
    [ -n "$NGINX_PID" ] && sudo kill "$NGINX_PID" 2>/dev/null || true
    [ -n "$HOMEPAGE_PID" ] && kill "$HOMEPAGE_PID" 2>/dev/null || true
    [ -n "$CODE_SERVER_PID" ] && kill "$CODE_SERVER_PID" 2>/dev/null || true
    [ -n "$OPENCODE_PID" ] && kill "$OPENCODE_PID" 2>/dev/null || true
    [ -n "$ACP_PID" ] && kill "$ACP_PID" 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# =============================================================================
# Main Execution
# =============================================================================

# Ensure config directories exist
mkdir -p "$OPENCODE_CONFIG_DIR"
mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"
mkdir -p "$OPENCODE_DATA_DIR"

# Clone repository first
clone_repository

# Ensure workspace exists
mkdir -p "$WORKSPACE"

# Try to fetch config from Management API, fall back to env vars
fetch_user_config || setup_fallback_config

# Always setup auth from OPENCODE_AUTH_JSON
setup_auth

# Configure git
configure_git

# Install addons (based on ADDON_IDS env var)
install_addons

# Show startup info early
show_startup_info

# Change to workspace directory
cd "$WORKSPACE"

# =============================================================================
# Start services in order:
# 1. Internal services first (OpenCode, ACP Gateway, Homepage)
# 2. nginx (main entry point, authenticates via central SSO at sso.superchotu.com)
# 3. Addon services (code-server on port 8080)
#
# Note: Authentication is now handled by centralized SSO at sso.superchotu.com
# nginx calls out to SSO to validate sessions, no local oauth2-proxy needed
# =============================================================================

echo "Starting internal services..."
echo "  SSO URL: ${SSO_URL:-https://sso.superchotu.com}"

# Start OpenCode server (port 4096)
start_opencode_server

# Start ACP Gateway (port 4097)
start_acp_gateway

# Start Homepage (port 3000)
start_homepage

# Start nginx (port 80 - main entry point, auth via central SSO)
start_nginx

# Start addon services (e.g., code-server on port 8080)
start_addon_services

# =============================================================================
# Keep container running
# =============================================================================
echo ""
echo "All services started. Container is ready."
echo "  Main entry point: http://localhost:${NGINX_PORT:-80}"
echo ""

# Wait for nginx to exit (main process)
wait $NGINX_PID 2>/dev/null || wait
