# =============================================================================
# CodeOpen Python Flavor
# Python development environment with ML/AI support
# =============================================================================
# Size: ~1.2GB (on top of base)
# Languages: Python
# =============================================================================

ARG BASE_IMAGE=codeopen-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="Python development environment with ML/AI support"
LABEL flavor="python"

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
        && break || sleep 5; \
    done && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Python 3.12 (using deadsnakes PPA)
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
# uv - Fast Python package installer
# =============================================================================
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Make uv available to developer user (in /home/.local for HOME=/home)
RUN mkdir -p /home/.local/bin && \
    cp -r /root/.local/bin/* /home/.local/bin/ 2>/dev/null || true && \
    chown -R developer:developer /home/.local

# =============================================================================
# Poetry - Dependency management
# =============================================================================
RUN pip install poetry --break-system-packages && \
    poetry config virtualenvs.in-project true

# =============================================================================
# Common Python Tools
# =============================================================================
RUN pip install --break-system-packages \
    ruff \
    black \
    isort \
    mypy \
    pytest \
    pytest-cov \
    ipython \
    httpie

# =============================================================================
# Jupyter (optional but common for ML/AI work)
# =============================================================================
RUN pip install --break-system-packages \
    jupyterlab \
    notebook \
    ipykernel

# =============================================================================
# Switch to developer user
# =============================================================================
USER developer

# Update PATH for developer user
ENV PATH="/home/.local/bin:${PATH}"

# Update shell configuration
RUN echo 'export PATH="/home/.local/bin:$PATH"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV CODEOPEN_FLAVOR="python"
ENV CODEOPEN_LANGUAGES="python"

WORKDIR /home/workspace
