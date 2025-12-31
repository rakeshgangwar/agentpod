# =============================================================================
# AgentPod Full-Stack Flavor
# JavaScript + Python development environment
# =============================================================================
# Size: ~1.8GB (on top of base)
# Languages: JavaScript, TypeScript, Python
# =============================================================================

ARG BASE_IMAGE=agentpod-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="AgentPod Team"
LABEL description="Full-stack development environment (JavaScript + Python)"
LABEL flavor="fullstack"

USER root

# =============================================================================
# Python Build Dependencies
# =============================================================================
# Use retry logic and --fix-missing to handle transient mirror issues
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --no-install-recommends --fix-missing \
            software-properties-common \
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
            postgresql-client \
        && break || sleep 5; \
    done && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Python 3.12
# =============================================================================
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --no-install-recommends --fix-missing \
            python3.12 \
            python3.12-venv \
            python3.12-dev \
            python3-pip \
        && break || sleep 5; \
    done && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Python Tools
# =============================================================================
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN pip install --break-system-packages \
    poetry \
    ruff \
    black \
    mypy \
    pytest \
    httpie

# =============================================================================
# Node.js Additional Tools
# =============================================================================
RUN npm install -g \
    yarn \
    typescript \
    tsx \
    esbuild \
    vite \
    turbo \
    prettier \
    eslint

# =============================================================================
# Docker CLI (for docker-compose workflows)
# =============================================================================
RUN curl -fsSL https://get.docker.com | sh || true

# =============================================================================
# Switch to developer user
# =============================================================================
USER developer

# Copy uv to /home/.local (for HOME=/home)
RUN mkdir -p /home/.local/bin && \
    sudo cp /root/.local/bin/uv /home/.local/bin/ 2>/dev/null || true && \
    sudo chown -R developer:developer /home/.local 2>/dev/null || true

# =============================================================================
# Update shell configuration
# =============================================================================
RUN echo 'export PATH="/home/.local/bin:$PATH"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV AGENTPOD_FLAVOR="fullstack"
ENV AGENTPOD_LANGUAGES="javascript,typescript,python"

WORKDIR /home/workspace
