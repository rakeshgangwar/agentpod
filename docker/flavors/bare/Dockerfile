# =============================================================================
# AgentPod Bare Flavor
# Minimal workspace with OpenCode only - no language runtimes
# =============================================================================
# Size: ~500MB (base image only)
# Languages: None (shell/bash only)
# Use case: AI-assisted coding, documentation, config files, scripts
# =============================================================================

ARG BASE_IMAGE=agentpod-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="AgentPod Team"
LABEL description="Minimal workspace with OpenCode only"
LABEL flavor="bare"

# =============================================================================
# Flavor metadata
# =============================================================================
ENV AGENTPOD_FLAVOR="bare"
ENV AGENTPOD_LANGUAGES=""

WORKDIR /home/workspace
