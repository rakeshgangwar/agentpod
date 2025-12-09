#!/bin/bash
# =============================================================================
# CodeOpen Common Setup Functions
# Shared functions for all container entrypoints
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Wait for a service to be ready
# Usage: wait_for_service "http://localhost:4097/health" 30
# =============================================================================
wait_for_service() {
    local url="$1"
    local timeout="${2:-30}"
    local i=0
    
    while [ $i -lt $timeout ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    
    return 1
}

# =============================================================================
# Check if a command exists
# =============================================================================
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Get system info
# =============================================================================
get_system_info() {
    echo "System Information:"
    echo "  Architecture: $(uname -m)"
    echo "  Kernel: $(uname -r)"
    echo "  Memory: $(free -h | awk '/^Mem:/ {print $2}')"
    echo "  CPUs: $(nproc)"
}

# =============================================================================
# Ensure directory exists with correct ownership
# =============================================================================
ensure_dir() {
    local dir="$1"
    local user="${2:-developer}"
    
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
    fi
    
    if [ "$(stat -c '%U' "$dir" 2>/dev/null)" != "$user" ]; then
        chown -R "$user:$user" "$dir" 2>/dev/null || true
    fi
}

# =============================================================================
# Parse JSON safely
# =============================================================================
json_get() {
    local json="$1"
    local key="$2"
    echo "$json" | jq -r "$key // empty" 2>/dev/null
}

# =============================================================================
# Check if running as root
# =============================================================================
is_root() {
    [ "$(id -u)" -eq 0 ]
}

# =============================================================================
# Switch to developer user if running as root
# =============================================================================
maybe_switch_user() {
    if is_root && [ -n "$SWITCH_TO_USER" ]; then
        exec su - "$SWITCH_TO_USER" -c "$@"
    fi
}
