# =============================================================================
# Management API Dockerfile
# Multi-stage build for smaller production image
# 
# Build context: monorepo root (/)
# Dockerfile location: /apps/api/Dockerfile
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy workspace package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY apps/api/package.json apps/api/bun.lock* ./apps/api/

# Install dependencies for the API only (production)
WORKDIR /app/apps/api
RUN bun install --frozen-lockfile --production

# Copy workspace packages source (needed for types)
WORKDIR /app
COPY packages/types/ ./packages/types/
COPY packages/tsconfig/ ./packages/tsconfig/

# Copy API source code
COPY apps/api/src/ ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM oven/bun:1.1-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy dependencies from builder
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./

# Copy source code
COPY --from=builder /app/apps/api/src ./src
COPY --from=builder /app/apps/api/tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Switch to non-root user
USER appuser

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/database.sqlite

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run the application
CMD ["bun", "run", "src/index.ts"]
