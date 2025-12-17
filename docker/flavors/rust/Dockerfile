# =============================================================================
# AgentPod Rust Flavor
# Rust development environment
# =============================================================================
# Size: ~1.1GB (on top of base)
# Languages: Rust
# =============================================================================

ARG BASE_IMAGE=agentpod-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="AgentPod Team"
LABEL description="Rust development environment"
LABEL flavor="rust"

USER root

# =============================================================================
# Rust Build Dependencies
# =============================================================================
# Use retry logic and --fix-missing to handle transient mirror issues
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --no-install-recommends --fix-missing \
            build-essential \
            pkg-config \
            libssl-dev \
        && break || sleep 5; \
    done && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Rust Installation (via rustup)
# =============================================================================
USER developer

# Install rustup and stable toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

# Set up environment
ENV CARGO_HOME="/home/.cargo"
ENV RUSTUP_HOME="/home/.rustup"
ENV PATH="${CARGO_HOME}/bin:${PATH}"

# =============================================================================
# Rust Components & Tools
# =============================================================================
RUN . "$CARGO_HOME/env" && \
    rustup component add \
        clippy \
        rustfmt \
        rust-analyzer && \
    cargo install \
        cargo-watch \
        cargo-edit \
        cargo-audit \
        cargo-outdated \
        cargo-nextest \
        bacon \
        just \
        tokio-console

# =============================================================================
# Update shell configuration
# =============================================================================
RUN echo 'source "$HOME/.cargo/env"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV AGENTPOD_FLAVOR="rust"
ENV AGENTPOD_LANGUAGES="rust"

WORKDIR /home/workspace
