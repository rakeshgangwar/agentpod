# =============================================================================
# AgentPod Base Image
# Foundation layer for all AgentPod container flavors
# =============================================================================
# Version: 0.2.0
# Contains: Ubuntu 24.04, Node.js 22, Bun, OpenCode CLI, ACP Gateway, 
#           Homepage, nginx, oauth2-proxy, Core Tools
# Features: Keycloak SSO authentication, path-based routing
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
RUN apt-get update && apt-get -y upgrade && apt-get install -y --no-install-recommends \
    # Essential utilities
    sudo \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    locales \
    tzdata \
    # Version control
    git \
    git-lfs \
    # Editors (minimal)
    vim-tiny \
    nano \
    # Compression
    zip \
    unzip \
    xz-utils \
    # Network tools
    openssh-client \
    # Process management
    procps \
    # File utilities
    tree \
    file \
    less \
    # JSON processing
    jq \
    # Shell
    tmux \
    # Web server (for reverse proxy)
    nginx \
    && rm -rf /var/lib/apt/lists/*

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
ENV BUN_INSTALL="/usr/local/bun"
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/* /usr/local/bun/ || true
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# =============================================================================
# OpenCode CLI
# =============================================================================
RUN npm install -g opencode-ai

# =============================================================================
# oauth2-proxy (for Keycloak SSO authentication)
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    OAUTH2_VERSION="7.6.0" && \
    curl -fsSL "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v${OAUTH2_VERSION}/oauth2-proxy-v${OAUTH2_VERSION}.linux-${ARCH}.tar.gz" -o oauth2-proxy.tar.gz && \
    tar -xzf oauth2-proxy.tar.gz && \
    mv "oauth2-proxy-v${OAUTH2_VERSION}.linux-${ARCH}/oauth2-proxy" /usr/local/bin/ && \
    chmod +x /usr/local/bin/oauth2-proxy && \
    rm -rf oauth2-proxy.tar.gz "oauth2-proxy-v${OAUTH2_VERSION}.linux-${ARCH}" && \
    oauth2-proxy --version

# =============================================================================
# Modern CLI Tools
# =============================================================================
# ripgrep (fast grep alternative)
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep && \
    rm -rf /var/lib/apt/lists/*

# fd (fast find alternative) - architecture aware
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/sharkdp/fd/releases/download/v10.1.0/fd_10.1.0_${ARCH}.deb" -o fd.deb && \
    dpkg -i fd.deb && \
    rm -f fd.deb

# bat (cat with syntax highlighting) - architecture aware
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/sharkdp/bat/releases/download/v0.24.0/bat_0.24.0_${ARCH}.deb" -o bat.deb && \
    dpkg -i bat.deb && \
    rm -f bat.deb

# fzf (fuzzy finder)
RUN git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf && \
    /opt/fzf/install --bin && \
    ln -s /opt/fzf/bin/fzf /usr/local/bin/fzf && \
    rm -rf /opt/fzf/.git

# yq (YAML processor) - architecture aware
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then YQ_ARCH="arm64"; else YQ_ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_${YQ_ARCH}" -o /usr/local/bin/yq && \
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
# Copy oauth2-proxy configuration
# =============================================================================
COPY oauth2-proxy/oauth2-proxy.cfg /etc/oauth2-proxy/oauth2-proxy.cfg
RUN mkdir -p /etc/oauth2-proxy && \
    chown -R $USERNAME:$USERNAME /etc/oauth2-proxy

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
ENV OAUTH2_PROXY_PORT=4180

# nginx exposes port 80 as the main entry point
ENV NGINX_PORT=80

# OpenCode configuration
ENV OPENCODE_CONFIG_DIR=/home/developer/.config/opencode-custom
ENV TERM=xterm-256color

# Keycloak configuration (should be overridden via environment)
ENV OAUTH2_PROXY_PROVIDER=keycloak-oidc
ENV OAUTH2_PROXY_OIDC_ISSUER_URL=https://auth.superchotu.com/realms/agentpod
ENV OAUTH2_PROXY_CLIENT_ID=agentpod-container
# OAUTH2_PROXY_CLIENT_SECRET must be set via environment
# OAUTH2_PROXY_COOKIE_SECRET must be set via environment

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
# Port 80: nginx (main entry point with auth)
# Port 8080: code-server (for hybrid mode - separate subdomain)
EXPOSE 80 8080

USER $USERNAME
WORKDIR $WORKSPACE

# Health check - verify nginx is running and healthy
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=5 \
    CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
