#!/bin/bash
# =============================================================================
# Build Docker Image Locally
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="management-api"
IMAGE_TAG="${1:-latest}"

echo "=========================================="
echo "Building Management API Docker Image"
echo "=========================================="
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Context: ${PROJECT_DIR}"
echo ""

cd "$PROJECT_DIR"

# Build the image
docker build \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -f Dockerfile \
    .

echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To run locally:"
echo "  docker run -p 3001:3001 --env-file .env ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "Or use docker-compose:"
echo "  docker compose up -d"
