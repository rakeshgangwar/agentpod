# =============================================================================
# AgentPod Base Image
# Foundation layer for all AgentPod container flavors
# =============================================================================
# Version: 0.4.0
# Contains: Ubuntu 24.04, Node.js 22, Bun, OpenCode CLI, ACP Gateway, 
#           Homepage, nginx, Core Tools
# Features: Path-based routing via nginx reverse proxy
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build ACP Gateway
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS acp-builder

WORKDIR /build/acp-gateway
COPY acp-gateway/package.json acp-gateway/bun.lock* ./
RUN bun install --frozen-lockfile
COPY acp-gateway/ ./

# Verify TypeScript compiles correctly
RUN bun run typecheck

# -----------------------------------------------------------------------------
# Stage 2: Build Homepage
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS homepage-builder

WORKDIR /build/homepage
COPY homepage/package.json homepage/bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY homepage/ ./

# -----------------------------------------------------------------------------
# Stage 3: Base Image
# -----------------------------------------------------------------------------
FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# =============================================================================
# System Packages (minimal set for base)
# =============================================================================
# Use retry logic and --fix-missing to handle transient mirror issues
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get -y upgrade && \
        apt-get install -y --no-install-recommends --fix-missing \
            sudo \
            curl \
            wget \
            ca-certificates \
            gnupg \
            lsb-release \
            locales \
            tzdata \
            git \
            git-lfs \
            vim-tiny \
            nano \
            zip \
            unzip \
            xz-utils \
            openssh-client \
            procps \
            tree \
            file \
            less \
            jq \
            tmux \
            nginx \
        && break || sleep 5; \
    done && rm -rf /var/lib/apt/lists/*

# Generate locales
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# =============================================================================
# Create developer user with sudo access
# =============================================================================
ENV USERNAME=developer
ENV HOME=/home/$USERNAME
ENV WORKSPACE=/home/$USERNAME/workspace

RUN useradd -m -s /bin/bash -d $HOME $USERNAME && \
    echo "${USERNAME} ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    mkdir -p $WORKSPACE && \
    mkdir -p $HOME/.cache && \
    mkdir -p $HOME/.config && \
    mkdir -p $HOME/.local/share && \
    chown -R $USERNAME:$USERNAME $HOME

# =============================================================================
# Node.js 22 LTS
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# =============================================================================
# Bun Runtime (for ACP Gateway and Homepage)
# =============================================================================
# BUN_INSTALL tells the installer where to put bun
ENV BUN_INSTALL="/usr/local/bun"
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# =============================================================================
# OpenCode CLI
# =============================================================================
RUN npm install -g opencode-ai

# =============================================================================
# Modern CLI Tools (install from apt where available for reliability)
# =============================================================================
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --no-install-recommends --fix-missing \
            ripgrep \
            fd-find \
            bat \
            fzf \
        && break || sleep 5; \
    done && rm -rf /var/lib/apt/lists/* \
    && ln -s $(which fdfind) /usr/local/bin/fd \
    && ln -s $(which batcat) /usr/local/bin/bat

# yq (YAML processor) - not in apt, download from GitHub with retry
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then YQ_ARCH="arm64"; else YQ_ARCH="amd64"; fi && \
    for i in 1 2 3; do \
        curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_${YQ_ARCH}" -o /usr/local/bin/yq && break || sleep 5; \
    done && \
    chmod +x /usr/local/bin/yq

# =============================================================================
# Copy ACP Gateway from builder
# =============================================================================
COPY --from=acp-builder /build/acp-gateway /opt/acp-gateway

# =============================================================================
# Copy Homepage from builder
# =============================================================================
COPY --from=homepage-builder /build/homepage /opt/homepage

# =============================================================================
# Copy nginx configuration
# =============================================================================
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /var/log/nginx && \
    chown -R $USERNAME:$USERNAME /var/log/nginx && \
    chown -R $USERNAME:$USERNAME /var/lib/nginx && \
    touch /run/nginx.pid && \
    chown $USERNAME:$USERNAME /run/nginx.pid

# =============================================================================
# Copy scripts
# =============================================================================
COPY scripts/ /opt/agentpod/scripts/
RUN chmod +x /opt/agentpod/scripts/*.sh 2>/dev/null || true

# =============================================================================
# Configuration directories
# =============================================================================
USER $USERNAME
WORKDIR $HOME

# Create OpenCode config directories
RUN mkdir -p $HOME/.config/opencode && \
    mkdir -p $HOME/.config/opencode-custom && \
    mkdir -p $HOME/.local/share/opencode && \
    mkdir -p $HOME/.cache/opencode && \
    mkdir -p $WORKSPACE

# Set up shell configuration
RUN echo 'export PATH="/usr/local/bun/bin:$PATH"' >> $HOME/.bashrc && \
    echo 'export EDITOR=vim' >> $HOME/.bashrc && \
    echo '[ -f /opt/fzf/shell/key-bindings.bash ] && source /opt/fzf/shell/key-bindings.bash' >> $HOME/.bashrc

# =============================================================================
# Environment variables
# =============================================================================
# Internal service ports (not exposed directly)
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0
ENV ACP_GATEWAY_PORT=4097
ENV HOMEPAGE_PORT=3000

# nginx exposes port 80 as the main entry point
ENV NGINX_PORT=80

# OpenCode configuration
ENV OPENCODE_CONFIG_DIR=/home/developer/.config/opencode-custom
ENV TERM=xterm-256color

# =============================================================================
# Copy entrypoint script
# =============================================================================
USER root
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create healthcheck script (checks nginx on port 80)
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo 'curl -sf "http://localhost:80/health" > /dev/null 2>&1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

# =============================================================================
# Expose ports
# =============================================================================
# Port 80: nginx (main entry point)
# Port 8080: code-server (for hybrid mode - separate subdomain)
EXPOSE 80 8080

USER $USERNAME
WORKDIR $WORKSPACE

# Health check - verify nginx is running and healthy
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=5 \
    CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
