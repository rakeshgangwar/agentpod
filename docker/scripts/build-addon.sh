#!/bin/bash
# =============================================================================
# Build CodeOpen Add-on Image
# =============================================================================
# Usage: ./build-addon.sh <addon> [--no-cache] [--push] [--base <base-image>]
#
# Arguments:
#   addon       - gui, code-server, gpu, databases, cloud
#   --no-cache  - Build without Docker cache
#   --push      - Push to registry after build
#   --base      - Specify base flavor image (default: codeopen-fullstack:latest)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Parse arguments
ADDON=""
NO_CACHE=""
PUSH=""
CUSTOM_BASE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH="yes"
            shift
            ;;
        --base)
            CUSTOM_BASE="$2"
            shift 2
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [ -z "$ADDON" ]; then
                ADDON="$1"
            fi
            shift
            ;;
    esac
done

# Validate addon
if [ -z "$ADDON" ]; then
    echo "Error: Add-on is required"
    echo "Usage: ./build-addon.sh <addon> [--no-cache] [--push] [--base <base-image>]"
    echo "Available addons: ${ADDONS[*]}"
    exit 1
fi

# Check if addon exists
if [[ ! " ${ADDONS[*]} " =~ " ${ADDON} " ]]; then
    echo "Error: Unknown addon '$ADDON'"
    echo "Available addons: ${ADDONS[*]}"
    exit 1
fi

ADDON_DIR="$ADDONS_DIR/$ADDON"
if [ ! -f "$ADDON_DIR/Dockerfile" ]; then
    echo "Error: Dockerfile not found for addon '$ADDON'"
    exit 1
fi

# Determine base image (extract flavor from base image name)
BASE_IMG="${CUSTOM_BASE:-${REGISTRY_URL}/codeopen-${DEFAULT_FLAVOR}:latest}"

# Extract flavor from base image for output name
# Pattern: registry/owner/codeopen-{flavor}:{version}
FLAVOR=$(echo "$BASE_IMG" | sed -E 's/.*codeopen-([^:]+):.*/\1/')
if [ -z "$FLAVOR" ]; then
    FLAVOR="$DEFAULT_FLAVOR"
fi

echo "=============================================="
echo "  CodeOpen Add-on Build: $ADDON"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_URL"
echo "  Base:     $BASE_IMG"
echo "  Flavor:   $FLAVOR"
echo "  Platform: $BUILD_PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

# Output image name includes both flavor and addon
IMAGE_NAME="${REGISTRY_URL}/codeopen-${FLAVOR}-${ADDON}"

echo "Building codeopen-${FLAVOR}-${ADDON}..."

docker build $NO_CACHE \
    --platform "$BUILD_PLATFORM" \
    -t "$IMAGE_NAME:$CONTAINER_VERSION" \
    -t "$IMAGE_NAME:latest" \
    --build-arg BASE_IMAGE="$BASE_IMG" \
    --build-arg CONTAINER_VERSION="$CONTAINER_VERSION" \
    -f "$ADDON_DIR/Dockerfile" \
    "$ADDON_DIR"

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
echo "  Add-on Build Complete: $ADDON"
echo "=============================================="
