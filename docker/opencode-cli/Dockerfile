# =============================================================================
# OpenCode CLI Container
# A comprehensive development environment for AI-assisted coding
# =============================================================================
# Version: 0.0.1
# Base: Ubuntu 24.04 LTS
# License: MIT
# =============================================================================

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# =============================================================================
# System Packages
# =============================================================================
RUN apt-get update && apt-get -y upgrade && apt-get install -y \
    # Essential utilities
    sudo \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    apt-transport-https \
    locales \
    tzdata \
    # Version control
    git \
    git-lfs \
    # Editors
    vim \
    nano \
    # Build essentials
    build-essential \
    cmake \
    make \
    pkg-config \
    autoconf \
    automake \
    libtool \
    # SSL/Crypto libraries
    libssl-dev \
    libffi-dev \
    # Compression
    zip \
    unzip \
    p7zip-full \
    xz-utils \
    # Network tools
    net-tools \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    openssh-client \
    # Process management
    htop \
    procps \
    # File utilities
    tree \
    file \
    less \
    # JSON/YAML processing
    jq \
    # Python build dependencies
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    libxml2-dev \
    libxmlsec1-dev \
    liblzma-dev \
    tk-dev \
    # Shell
    zsh \
    tmux \
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
    chown -R $USERNAME:$USERNAME $HOME

# =============================================================================
# Node.js 22 LTS
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# =============================================================================
# Python 3.12 (using deadsnakes PPA for latest)
# =============================================================================
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Go (latest stable)
# =============================================================================
ENV GO_VERSION=1.22.4
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="${HOME}/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# =============================================================================
# Rust (via rustup)
# =============================================================================
USER $USERNAME
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="${HOME}/.cargo/bin:${PATH}"
USER root

# =============================================================================
# Modern CLI tools
# =============================================================================
# ripgrep (fast grep alternative)
RUN curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep_14.1.0-1_amd64.deb && \
    dpkg -i ripgrep_14.1.0-1_amd64.deb && \
    rm ripgrep_14.1.0-1_amd64.deb

# fd (fast find alternative)
RUN curl -LO https://github.com/sharkdp/fd/releases/download/v10.1.0/fd_10.1.0_amd64.deb && \
    dpkg -i fd_10.1.0_amd64.deb && \
    rm fd_10.1.0_amd64.deb

# bat (cat with syntax highlighting)
RUN curl -LO https://github.com/sharkdp/bat/releases/download/v0.24.0/bat_0.24.0_amd64.deb && \
    dpkg -i bat_0.24.0_amd64.deb && \
    rm bat_0.24.0_amd64.deb

# fzf (fuzzy finder)
RUN git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf && \
    /opt/fzf/install --bin && \
    ln -s /opt/fzf/bin/fzf /usr/local/bin/fzf

# yq (YAML processor, like jq for YAML)
RUN curl -LO https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_amd64 && \
    chmod +x yq_linux_amd64 && \
    mv yq_linux_amd64 /usr/local/bin/yq

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# httpie (modern HTTP client)
RUN pip install httpie --break-system-packages

# =============================================================================
# OpenCode
# =============================================================================
RUN npm install -g opencode-ai

# =============================================================================
# Configuration directories
# =============================================================================
USER $USERNAME
WORKDIR $HOME

# Create OpenCode config directories
RUN mkdir -p $HOME/.config/opencode && \
    mkdir -p $HOME/.local/share/opencode

# Create workspace
RUN mkdir -p $WORKSPACE

# Set up shell configuration
RUN echo 'export PATH="$HOME/.cargo/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"' >> $HOME/.bashrc && \
    echo 'export EDITOR=vim' >> $HOME/.bashrc && \
    echo '[ -f /opt/fzf/shell/key-bindings.bash ] && source /opt/fzf/shell/key-bindings.bash' >> $HOME/.bashrc

# =============================================================================
# Environment variables
# =============================================================================
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0
ENV OPENCODE_CONFIG_DIR=/home/developer/.config/opencode-custom
ENV TERM=xterm-256color

# =============================================================================
# Copy entrypoint script
# =============================================================================
USER root
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/
RUN chmod +x /entrypoint.sh && \
    chmod +x /scripts/*.sh 2>/dev/null || true

# Create healthcheck script for reliable healthcheck execution
# Uses curl with fallback to wget, both should be available
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo 'PORT="${OPENCODE_PORT:-4096}"' >> /healthcheck.sh && \
    echo 'curl -sf "http://localhost:${PORT}/app" > /dev/null 2>&1 || wget -q --spider "http://localhost:${PORT}/app" > /dev/null 2>&1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

# =============================================================================
# Expose ports and set user
# =============================================================================
EXPOSE 4096

USER $USERNAME
WORKDIR $WORKSPACE

# Health check - use script for reliable execution with runtime ENV
# Increased start-period to 60s and retries to 5 for OpenCode server startup
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
    CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
