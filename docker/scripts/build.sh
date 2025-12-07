#!/bin/bash
# =============================================================================
# Build OpenCode Container Images
# =============================================================================
# Usage: ./build.sh [image_type] [--no-cache]
# 
# Arguments:
#   image_type  - 'cli', 'desktop', or 'all' (default: all)
#   --no-cache  - Build without Docker cache
#
# Environment Variables:
#   FORGEJO_REGISTRY - Registry URL (default: forgejo.superchotu.com)
#   FORGEJO_OWNER    - Registry owner/namespace (default: rakeshgangwar)
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
PLATFORM="${BUILD_PLATFORM:-linux/amd64}"

# Parse arguments
IMAGE_TYPE="${1:-all}"
NO_CACHE=""

for arg in "$@"; do
    case $arg in
        --no-cache)
            NO_CACHE="--no-cache"
            ;;
    esac
done

echo "=============================================="
echo "  OpenCode Container Build"
echo "=============================================="
echo "  Version:  $VERSION"
echo "  Registry: $REGISTRY/$OWNER"
echo "  Type:     $IMAGE_TYPE"
echo "  Platform: $PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

# Build CLI image
build_cli() {
    echo "Building opencode-cli..."
    
    local IMAGE_NAME="$REGISTRY/$OWNER/opencode-cli"
    local CONTEXT="$DOCKER_DIR/opencode-cli"
    
    docker build $NO_CACHE \
        --platform "$PLATFORM" \
        -t "$IMAGE_NAME:$VERSION" \
        -t "$IMAGE_NAME:latest" \
        --build-arg CONTAINER_VERSION="$VERSION" \
        -f "$CONTEXT/Dockerfile" \
        "$CONTEXT"
    
    echo ""
    echo "Built: $IMAGE_NAME:$VERSION"
    echo "Built: $IMAGE_NAME:latest"
    echo ""
}

# Build Desktop image
build_desktop() {
    echo "Building opencode-desktop..."
    
    local IMAGE_NAME="$REGISTRY/$OWNER/opencode-desktop"
    local CONTEXT="$DOCKER_DIR/opencode-desktop"
    
    docker build $NO_CACHE \
        --platform "$PLATFORM" \
        -t "$IMAGE_NAME:$VERSION" \
        -t "$IMAGE_NAME:latest" \
        --build-arg CONTAINER_VERSION="$VERSION" \
        -f "$CONTEXT/Dockerfile" \
        "$CONTEXT"
    
    echo ""
    echo "Built: $IMAGE_NAME:$VERSION"
    echo "Built: $IMAGE_NAME:latest"
    echo ""
}

# Main execution
case $IMAGE_TYPE in
    cli)
        build_cli
        ;;
    desktop)
        build_desktop
        ;;
    all)
        build_cli
        build_desktop
        ;;
    *)
        echo "Error: Unknown image type '$IMAGE_TYPE'"
        echo "Usage: ./build.sh [cli|desktop|all] [--no-cache]"
        exit 1
        ;;
esac

echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo ""
echo "To push images, run: ./push.sh $IMAGE_TYPE"
echo ""
