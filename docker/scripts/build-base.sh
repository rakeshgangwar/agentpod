#!/bin/bash
# =============================================================================
# Build CodeOpen Base Image
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

echo "=============================================="
echo "  CodeOpen Base Image Build"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_URL"
echo "  Platform: $BUILD_PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

IMAGE_NAME="${REGISTRY_URL}/codeopen-base"

echo "Building codeopen-base..."

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
    echo "Pushing images..."
    docker push "$IMAGE_NAME:$CONTAINER_VERSION"
    docker push "$IMAGE_NAME:latest"
    echo "Pushed successfully."
fi

echo ""
echo "=============================================="
echo "  Base Image Build Complete!"
echo "=============================================="
