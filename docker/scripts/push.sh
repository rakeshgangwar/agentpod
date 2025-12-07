#!/bin/bash
# =============================================================================
# Push OpenCode Container Images to Forgejo Registry
# =============================================================================
# Usage: ./push.sh [image_type]
# 
# Arguments:
#   image_type  - 'cli', 'desktop', or 'all' (default: all)
#
# Environment Variables:
#   FORGEJO_REGISTRY - Registry URL (default: forgejo.superchotu.com)
#   FORGEJO_OWNER    - Registry owner/namespace (default: rakeshgangwar)
#
# Note: You must be logged in to the registry first. Run ./login.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$DOCKER_DIR/VERSION"

# Load configuration
source "$SCRIPT_DIR/config.sh" 2>/dev/null || true

# Configuration
REGISTRY="${FORGEJO_REGISTRY:-forgejo.superchotu.com}"
OWNER="${FORGEJO_OWNER:-rakeshgangwar}"
VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "0.0.1")

# Parse arguments
IMAGE_TYPE="${1:-all}"

echo "=============================================="
echo "  OpenCode Container Push"
echo "=============================================="
echo "  Version:  $VERSION"
echo "  Registry: $REGISTRY/$OWNER"
echo "  Type:     $IMAGE_TYPE"
echo "=============================================="
echo ""

# Push CLI image
push_cli() {
    echo "Pushing opencode-cli..."
    
    local IMAGE_NAME="$REGISTRY/$OWNER/opencode-cli"
    
    docker push "$IMAGE_NAME:$VERSION"
    docker push "$IMAGE_NAME:latest"
    
    echo ""
    echo "Pushed: $IMAGE_NAME:$VERSION"
    echo "Pushed: $IMAGE_NAME:latest"
    echo ""
}

# Push Desktop image
push_desktop() {
    echo "Pushing opencode-desktop..."
    
    local IMAGE_NAME="$REGISTRY/$OWNER/opencode-desktop"
    
    docker push "$IMAGE_NAME:$VERSION"
    docker push "$IMAGE_NAME:latest"
    
    echo ""
    echo "Pushed: $IMAGE_NAME:$VERSION"
    echo "Pushed: $IMAGE_NAME:latest"
    echo ""
}

# Main execution
case $IMAGE_TYPE in
    cli)
        push_cli
        ;;
    desktop)
        push_desktop
        ;;
    all)
        push_cli
        push_desktop
        ;;
    *)
        echo "Error: Unknown image type '$IMAGE_TYPE'"
        echo "Usage: ./push.sh [cli|desktop|all]"
        exit 1
        ;;
esac

echo "=============================================="
echo "  Push Complete!"
echo "=============================================="
echo ""
echo "Images are now available at:"
echo "  - $REGISTRY/$OWNER/opencode-cli:$VERSION"
echo "  - $REGISTRY/$OWNER/opencode-desktop:$VERSION"
echo ""
