# =============================================================================
# AgentPod JavaScript Flavor
# Node.js and TypeScript development environment
# =============================================================================
# Size: ~800MB (on top of base)
# Languages: JavaScript, TypeScript
# =============================================================================

ARG BASE_IMAGE=agentpod-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="AgentPod Team"
LABEL description="JavaScript/TypeScript development environment"
LABEL flavor="js"

USER root

# =============================================================================
# Additional Node.js Tools
# =============================================================================

# Install yarn
RUN npm install -g yarn

# Install common global packages
RUN npm install -g \
    typescript \
    tsx \
    ts-node \
    esbuild \
    vite \
    turbo \
    @biomejs/biome \
    prettier \
    eslint \
    npm-check-updates

# =============================================================================
# Deno Runtime (optional, lightweight)
# =============================================================================
# Install deno to /usr/local/bin for system-wide access
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

USER developer

# =============================================================================
# Update shell configuration
# =============================================================================
RUN echo 'export PATH="/usr/local/bin:$PATH"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV AGENTPOD_FLAVOR="js"
ENV AGENTPOD_LANGUAGES="javascript,typescript"

WORKDIR /home/workspace
