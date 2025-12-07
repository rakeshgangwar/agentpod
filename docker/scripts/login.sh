#!/bin/bash
# =============================================================================
# Login to Forgejo Container Registry
# =============================================================================
# Usage: ./login.sh [registry_url]
# 
# Environment Variables:
#   FORGEJO_REGISTRY - Registry URL (default: forgejo.superchotu.com)
#   FORGEJO_USER     - Username for registry
#   FORGEJO_TOKEN    - Token/password for registry
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh" 2>/dev/null || true

# Configuration
REGISTRY="${1:-${FORGEJO_REGISTRY:-forgejo.superchotu.com}}"
USER="${FORGEJO_USER:-}"
TOKEN="${FORGEJO_TOKEN:-}"

echo "=============================================="
echo "  Forgejo Container Registry Login"
echo "=============================================="
echo "  Registry: $REGISTRY"
echo ""

# Check if credentials are provided via environment
if [ -n "$USER" ] && [ -n "$TOKEN" ]; then
    echo "Using credentials from environment variables..."
    echo "$TOKEN" | docker login "$REGISTRY" -u "$USER" --password-stdin
else
    echo "No credentials in environment. Starting interactive login..."
    echo "Enter your Forgejo username and API token when prompted."
    echo ""
    docker login "$REGISTRY"
fi

echo ""
echo "Login successful!"
echo ""
