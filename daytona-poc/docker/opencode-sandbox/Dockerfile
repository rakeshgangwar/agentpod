# OpenCode Sandbox Image for Daytona
# Pre-installs OpenCode for faster sandbox startup

FROM daytonaio/sandbox:0.5.0-slim

# Install OpenCode globally
RUN npm install -g opencode-ai

# Verify installation
RUN opencode --version

# Create workspace directory
WORKDIR /workspace

# Default environment
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0
