#!/bin/bash
# =============================================================================
# Deploy Management API to Coolify
# =============================================================================
# 
# Prerequisites:
#   - Docker installed and running
#   - Access to container registry (or using Coolify's built-in builder)
#   - Coolify API token with deploy permissions
#   - Environment variables set (or .env file)
#
# Usage:
#   ./scripts/deploy.sh                    # Deploy using Coolify's builder
#   ./scripts/deploy.sh --registry         # Build and push to registry first
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

# Configuration
COOLIFY_URL="${COOLIFY_URL:-https://admin.superchotu.com}"
COOLIFY_TOKEN="${COOLIFY_TOKEN}"
APP_UUID="${MANAGEMENT_API_UUID:-}"  # Set this after first deployment

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Validate required environment variables
validate_env() {
    local missing=0
    
    if [ -z "$COOLIFY_TOKEN" ]; then
        log_error "COOLIFY_TOKEN is not set"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        log_error "Please set required environment variables in .env file"
        exit 1
    fi
}

# Check Coolify API health
check_coolify() {
    log_info "Checking Coolify API..."
    
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        "${COOLIFY_URL}/api/v1/servers")
    
    if [ "$response" != "200" ]; then
        log_error "Cannot connect to Coolify API (HTTP $response)"
        exit 1
    fi
    
    log_info "Coolify API is accessible"
}

# Trigger deployment via Coolify API
deploy_to_coolify() {
    if [ -z "$APP_UUID" ]; then
        log_warn "MANAGEMENT_API_UUID is not set."
        log_info "First, create the application in Coolify manually, then set MANAGEMENT_API_UUID in .env"
        log_info ""
        log_info "Steps to create in Coolify:"
        log_info "1. Go to Coolify Dashboard > Projects"
        log_info "2. Select your project or create a new one"
        log_info "3. Add New Resource > Docker Image"
        log_info "4. Configure:"
        log_info "   - Name: management-api"
        log_info "   - Image: Build from Dockerfile (or specify registry image)"
        log_info "   - Port: 3001"
        log_info "5. Copy the Application UUID and set MANAGEMENT_API_UUID in .env"
        exit 0
    fi
    
    log_info "Triggering deployment for app: ${APP_UUID}"
    
    response=$(curl -s -X GET \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/restart")
    
    echo "$response" | jq . 2>/dev/null || echo "$response"
    
    log_info "Deployment triggered!"
}

# Main deployment function
main() {
    echo "=========================================="
    echo "Deploying Management API to Coolify"
    echo "=========================================="
    echo ""
    
    validate_env
    check_coolify
    deploy_to_coolify
    
    echo ""
    echo "=========================================="
    echo "Deployment Complete!"
    echo "=========================================="
}

main "$@"
