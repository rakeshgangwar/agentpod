#!/bin/bash
# =============================================================================
# Build AgentPod Base Image
# =============================================================================
# Usage: ./build-base.sh [--no-cache] [--push]
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Parse arguments
NO_CACHE=""
PUSH=""

for arg in "$@"; do
    case $arg in
        --no-cache)
            NO_CACHE="--no-cache"
            ;;
        --push)
            PUSH="yes"
            ;;
    esac
done

# Determine image name (with or without registry prefix)
if [ -n "$CONTAINER_REGISTRY" ]; then
    IMAGE_NAME="${CONTAINER_REGISTRY}/agentpod-base"
    REGISTRY_DISPLAY="$CONTAINER_REGISTRY"
else
    IMAGE_NAME="agentpod-base"
    REGISTRY_DISPLAY="local"
fi

echo "=============================================="
echo "  AgentPod Base Image Build"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_DISPLAY"
echo "  Platform: $BUILD_PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

echo "Building agentpod-base..."

docker build $NO_CACHE \
    --platform "$BUILD_PLATFORM" \
    -t "$IMAGE_NAME:$CONTAINER_VERSION" \
    -t "$IMAGE_NAME:latest" \
    --build-arg CONTAINER_VERSION="$CONTAINER_VERSION" \
    -f "$BASE_DIR/Dockerfile" \
    "$BASE_DIR"

echo ""
echo "Built: $IMAGE_NAME:$CONTAINER_VERSION"
echo "Built: $IMAGE_NAME:latest"
echo ""

if [ "$PUSH" = "yes" ]; then
    if [ -z "$CONTAINER_REGISTRY" ]; then
        echo "Warning: CONTAINER_REGISTRY not set, skipping push"
    else
        echo "Pushing images..."
        docker push "$IMAGE_NAME:$CONTAINER_VERSION"
        docker push "$IMAGE_NAME:latest"
        echo "Pushed successfully."
    fi
fi

echo ""
echo "=============================================="
echo "  Base Image Build Complete!"
echo "=============================================="
