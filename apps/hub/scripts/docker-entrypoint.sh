#!/bin/sh
# =============================================================================
# Docker Entrypoint Script
# =============================================================================
# This script handles Docker socket permissions before running the app.
# It runs as root initially, configures permissions, then drops to appuser.
#
# Why this approach:
# - The Docker socket GID varies between hosts (e.g., 999, 998, docker)
# - We detect the actual GID at runtime and add appuser to a matching group
# - This is the standard production pattern for containers that need Docker access
# =============================================================================

set -e

# Only configure Docker socket if it exists (container orchestration is enabled)
if [ -S /var/run/docker.sock ]; then
    # Get the GID of the Docker socket
    DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null)
    
    if [ -n "$DOCKER_SOCK_GID" ]; then
        echo "Docker socket found with GID: $DOCKER_SOCK_GID"
        
        # Check if a group with this GID already exists
        EXISTING_GROUP=$(getent group "$DOCKER_SOCK_GID" 2>/dev/null | cut -d: -f1 || true)
        
        if [ -z "$EXISTING_GROUP" ]; then
            # Create a new group with the Docker socket's GID
            echo "Creating docker group with GID $DOCKER_SOCK_GID"
            addgroup -g "$DOCKER_SOCK_GID" -S docker 2>/dev/null || true
            DOCKER_GROUP="docker"
        else
            DOCKER_GROUP="$EXISTING_GROUP"
            echo "Using existing group: $DOCKER_GROUP"
        fi
        
        # Add appuser to the docker group
        echo "Adding appuser to group: $DOCKER_GROUP"
        addgroup appuser "$DOCKER_GROUP" 2>/dev/null || true
    fi
fi

# Ensure data directories are writable by appuser
chown -R appuser:appgroup /app/data /data 2>/dev/null || true

# Drop privileges and run the command as appuser
echo "Starting application as appuser..."
exec su-exec appuser "$@"
