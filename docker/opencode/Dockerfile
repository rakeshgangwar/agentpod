FROM node:20-slim

# Install required packages
RUN apt-get update && \
    apt-get install -y git curl jq && \
    rm -rf /var/lib/apt/lists/*

# Install OpenCode globally
RUN npm install -g opencode-ai

# Create workspace directory
WORKDIR /workspace

# Environment variables
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose OpenCode port
EXPOSE 4096

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${OPENCODE_PORT}/app || exit 1

ENTRYPOINT ["/entrypoint.sh"]
