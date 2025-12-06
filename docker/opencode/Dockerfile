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

# Health check - use /app endpoint which is simpler and always available
# Increased start-period to give OpenCode time to fully initialize
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -sf http://localhost:${OPENCODE_PORT}/app || exit 1

ENTRYPOINT ["/entrypoint.sh"]
