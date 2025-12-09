FROM oven/bun:1 AS acp-builder

# Build ACP Gateway
WORKDIR /build/acp-gateway
COPY acp-gateway/package.json acp-gateway/bun.lock* ./
RUN bun install --frozen-lockfile
COPY acp-gateway/ ./

# Verify build
RUN bun run typecheck

# =============================================================================
# Final image
# =============================================================================
FROM node:20-slim

# Install required packages including bun runtime
RUN apt-get update && \
    apt-get install -y git curl jq unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    rm -rf /var/lib/apt/lists/*

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Install OpenCode globally
RUN npm install -g opencode-ai

# Copy ACP Gateway from builder
COPY --from=acp-builder /build/acp-gateway /opt/acp-gateway

# Create workspace directory
WORKDIR /workspace

# Environment variables
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0
ENV ACP_GATEWAY_PORT=4097
ENV WORKSPACE_DIR=/workspace

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports: OpenCode (4096) and ACP Gateway (4097)
EXPOSE 4096 4097

# Health check - check both OpenCode and ACP Gateway
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -sf http://localhost:${ACP_GATEWAY_PORT}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
