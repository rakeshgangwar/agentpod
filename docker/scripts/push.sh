#!/bin/bash
# =============================================================================
# Push AgentPod Container Images to Registry
# =============================================================================
# Usage: ./push.sh [type] [name]
# 
# Arguments:
#   type  - 'base', 'flavor', 'addon', or 'all' (default: all)
#   name  - Specific flavor or addon name (required for flavor/addon types)
#
# Environment Variables:
#   FORGEJO_REGISTRY - Registry URL (default: forgejo.superchotu.com)
#   FORGEJO_OWNER    - Registry owner/namespace (default: rakeshgangwar)
#
# Note: You must be logged in to the registry first. Run ./login.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Parse arguments
TYPE="${1:-all}"
NAME="${2:-}"

echo "=============================================="
echo "  AgentPod Container Push"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_URL"
echo "  Type:     $TYPE"
[ -n "$NAME" ] && echo "  Name:     $NAME"
echo "=============================================="
echo ""

push_image() {
    local IMAGE_NAME="$1"
    
    echo "Pushing $IMAGE_NAME..."
    docker push "$IMAGE_NAME:$CONTAINER_VERSION"
    docker push "$IMAGE_NAME:latest"
    echo "  Pushed: $IMAGE_NAME:$CONTAINER_VERSION"
    echo "  Pushed: $IMAGE_NAME:latest"
    echo ""
}

push_base() {
    push_image "${REGISTRY_URL}/codeopen-base"
}

push_flavor() {
    local flavor="$1"
    
    if [ -z "$flavor" ]; then
        echo "Error: Flavor name required"
        echo "Available flavors: ${FLAVORS[*]}"
        exit 1
    fi
    
    if [[ ! " ${FLAVORS[*]} " =~ " ${flavor} " ]]; then
        echo "Error: Unknown flavor '$flavor'"
        echo "Available flavors: ${FLAVORS[*]}"
        exit 1
    fi
    
    push_image "${REGISTRY_URL}/codeopen-${flavor}"
}

push_addon() {
    local addon="$1"
    local base_flavor="${2:-$DEFAULT_FLAVOR}"
    
    if [ -z "$addon" ]; then
        echo "Error: Add-on name required"
        echo "Available addons: ${ADDONS[*]}"
        exit 1
    fi
    
    if [[ ! " ${ADDONS[*]} " =~ " ${addon} " ]]; then
        echo "Error: Unknown addon '$addon'"
        echo "Available addons: ${ADDONS[*]}"
        exit 1
    fi
    
    push_image "${REGISTRY_URL}/codeopen-${base_flavor}-${addon}"
}

push_all() {
    echo "Pushing all images..."
    echo ""
    
    # Push base
    push_base
    
    # Push all flavors
    for flavor in "${FLAVORS[@]}"; do
        push_flavor "$flavor"
    done
    
    # Push all addons (with fullstack base)
    for addon in "${ADDONS[@]}"; do
        push_addon "$addon" "$DEFAULT_FLAVOR"
    done
}

# Main execution
case $TYPE in
    base)
        push_base
        ;;
    flavor)
        push_flavor "$NAME"
        ;;
    addon)
        push_addon "$NAME"
        ;;
    all)
        push_all
        ;;
    *)
        echo "Error: Unknown type '$TYPE'"
        echo "Usage: ./push.sh [base|flavor|addon|all] [name]"
        exit 1
        ;;
esac

echo "=============================================="
echo "  Push Complete!"
echo "=============================================="
echo ""
