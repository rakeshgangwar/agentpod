# =============================================================================
# CodeOpen Polyglot Flavor
# All languages development environment
# =============================================================================
# Size: ~3GB (on top of base)
# Languages: JavaScript, TypeScript, Python, Go, Rust
# =============================================================================

ARG BASE_IMAGE=codeopen-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="Polyglot development environment with all languages"
LABEL flavor="polyglot"

USER root

# =============================================================================
# Build Dependencies (all languages)
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    build-essential \
    cmake \
    pkg-config \
    autoconf \
    automake \
    libtool \
    # Python dependencies
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    libxml2-dev \
    libxmlsec1-dev \
    liblzma-dev \
    libffi-dev \
    tk-dev \
    # Rust/SSL dependencies
    libssl-dev \
    # Database clients
    postgresql-client \
    redis-tools \
    # Network tools
    net-tools \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    # Shell
    zsh \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Python 3.12
# =============================================================================
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.12 \
        python3.12-venv \
        python3.12-dev \
        python3-pip \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 \
    && rm -rf /var/lib/apt/lists/*

# Python tools
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN pip install --break-system-packages \
    poetry \
    ruff \
    black \
    mypy \
    pytest \
    pytest-cov \
    httpie \
    jupyterlab \
    ipython

# =============================================================================
# Go
# =============================================================================
ENV GO_VERSION=1.22.4
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" | tar -C /usr/local -xzf -

ENV GOROOT=/usr/local/go
ENV GOPATH=/home/developer/go
ENV PATH="${GOROOT}/bin:${GOPATH}/bin:${PATH}"

# =============================================================================
# Node.js Additional Tools
# =============================================================================
RUN npm install -g \
    yarn \
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
# Deno
# =============================================================================
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# =============================================================================
# GitHub CLI
# =============================================================================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Docker CLI
# =============================================================================
RUN curl -fsSL https://get.docker.com | sh || true

# =============================================================================
# Switch to developer user
# =============================================================================
USER developer

# Create Go directories
RUN mkdir -p /home/developer/go/{bin,src,pkg}

# Install Go tools
RUN go install golang.org/x/tools/gopls@latest && \
    go install github.com/go-delve/delve/cmd/dlv@latest && \
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && \
    go install github.com/air-verse/air@latest

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

ENV CARGO_HOME="/home/developer/.cargo"
ENV RUSTUP_HOME="/home/developer/.rustup"
ENV PATH="${CARGO_HOME}/bin:${PATH}"

# Install Rust components and tools
RUN . "$CARGO_HOME/env" && \
    rustup component add clippy rustfmt rust-analyzer && \
    cargo install cargo-watch cargo-edit bacon just

# Copy tools to developer user
RUN mkdir -p /home/developer/.local/bin && \
    mkdir -p /home/developer/.deno/bin && \
    sudo cp /root/.local/bin/uv /home/developer/.local/bin/ 2>/dev/null || true && \
    sudo cp /root/.deno/bin/deno /home/developer/.deno/bin/ 2>/dev/null || true && \
    sudo chown -R developer:developer /home/developer/.local /home/developer/.deno

# =============================================================================
# Update shell configuration
# =============================================================================
RUN echo 'export GOROOT=/usr/local/go' >> /home/developer/.bashrc && \
    echo 'export GOPATH=/home/developer/go' >> /home/developer/.bashrc && \
    echo 'export PATH="/home/developer/.local/bin:/home/developer/.deno/bin:${GOROOT}/bin:${GOPATH}/bin:${CARGO_HOME}/bin:${PATH}"' >> /home/developer/.bashrc && \
    echo 'source "$HOME/.cargo/env"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV CODEOPEN_FLAVOR="polyglot"
ENV CODEOPEN_LANGUAGES="javascript,typescript,python,go,rust"

WORKDIR /home/developer/workspace
