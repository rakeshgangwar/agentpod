# =============================================================================
# CodeOpen Code Server Add-on
# Adds VS Code in browser via code-server
# =============================================================================
# Size: ~300MB (on top of flavor image)
# Access: Web browser on port 8080
# =============================================================================

ARG BASE_IMAGE=codeopen-fullstack:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="Code Server add-on (VS Code in browser)"
LABEL addon="code-server"

USER root

# =============================================================================
# Code Server Installation
# =============================================================================
RUN curl -fsSL https://code-server.dev/install.sh | sh && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# Code Server Configuration
# =============================================================================
USER developer

# Create config directory
RUN mkdir -p /home/developer/.config/code-server

# Default configuration
RUN cat > /home/developer/.config/code-server/config.yaml << 'EOF'
bind-addr: 0.0.0.0:8080
auth: none
cert: false
disable-telemetry: true
EOF

# Install useful VS Code extensions
RUN code-server --install-extension ms-python.python 2>/dev/null || true && \
    code-server --install-extension bradlc.vscode-tailwindcss 2>/dev/null || true && \
    code-server --install-extension esbenp.prettier-vscode 2>/dev/null || true && \
    code-server --install-extension dbaeumer.vscode-eslint 2>/dev/null || true

# =============================================================================
# Environment variables
# =============================================================================
ENV CODE_SERVER_PORT=8080
ENV CODE_SERVER_AUTH=none

# =============================================================================
# Add-on metadata
# =============================================================================
ENV CODEOPEN_ADDON_CODE_SERVER="true"
ENV CODEOPEN_CODE_SERVER_PORT=8080

# =============================================================================
# Expose ports
# =============================================================================
# 8080: Code Server web interface
EXPOSE 8080

WORKDIR /home/developer/workspace
