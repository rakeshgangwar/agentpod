#!/bin/bash
# Build and push custom OpenCode image to local registry

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../docker"
REGISTRY="localhost:6000"
IMAGE_NAME="opencode-sandbox"
TAG="latest"

echo "=== Building OpenCode Sandbox Image ==="
echo ""
echo "Building image: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
echo ""

# Build the image
docker build -t "${REGISTRY}/${IMAGE_NAME}:${TAG}" "${DOCKER_DIR}/opencode-sandbox"

echo ""
echo "=== Pushing to Local Registry ==="
echo ""

# Push to local registry
docker push "${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo ""
echo "=== Done ==="
echo ""
echo "Image available at: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
echo ""
echo "You can now use this image in Daytona:"
echo "  await daytona.create({ image: '${REGISTRY}/${IMAGE_NAME}:${TAG}' })"
