# =============================================================================
# CodeOpen Databases Add-on
# Adds local database servers for development
# =============================================================================
# Size: ~400MB (on top of flavor image)
# Includes: PostgreSQL (with pgvector), Redis, SQLite tools, DuckDB
# =============================================================================

ARG BASE_IMAGE=codeopen-fullstack:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="Databases add-on with PostgreSQL, Redis, and vector search"
LABEL addon="databases"

USER root

# =============================================================================
# PostgreSQL with pgvector (vector similarity search)
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    postgresql-contrib \
    postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Configure PostgreSQL for local development
RUN mkdir -p /var/run/postgresql && \
    chown -R postgres:postgres /var/run/postgresql && \
    chmod 2777 /var/run/postgresql

# Allow local connections without password
RUN echo "local all all trust" > /etc/postgresql/16/main/pg_hba.conf && \
    echo "host all all 127.0.0.1/32 trust" >> /etc/postgresql/16/main/pg_hba.conf && \
    echo "host all all ::1/128 trust" >> /etc/postgresql/16/main/pg_hba.conf

# =============================================================================
# Redis (with RedisSearch for full-text and vector search)
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    redis-server \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Configure Redis for local development
RUN sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf && \
    sed -i 's/^protected-mode yes/protected-mode no/' /etc/redis/redis.conf && \
    sed -i 's/^daemonize yes/daemonize no/' /etc/redis/redis.conf

# =============================================================================
# SQLite tools
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# DuckDB (fast analytical database, great for data science)
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    DUCKDB_VERSION="1.1.3" && \
    if [ "$ARCH" = "amd64" ]; then \
        wget -q "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" -O duckdb.zip; \
    elif [ "$ARCH" = "arm64" ]; then \
        wget -q "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb_cli-linux-aarch64.zip" -O duckdb.zip; \
    fi && \
    unzip -q duckdb.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/duckdb && \
    rm -f duckdb.zip

# =============================================================================
# Database CLI tools
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # MySQL/MariaDB client
    mariadb-client \
    # PostgreSQL client tools
    postgresql-client \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# Python database libraries (for developer user)
# =============================================================================
USER developer
RUN pip install --user --break-system-packages \
    psycopg2-binary \
    redis \
    duckdb \
    sqlalchemy \
    pgvector \
    2>/dev/null || echo "Some Python DB libraries failed to install"

USER root

# =============================================================================
# Create data directories
# =============================================================================
RUN mkdir -p /home/developer/data/postgres && \
    mkdir -p /home/developer/data/redis && \
    mkdir -p /home/developer/data/duckdb && \
    chown -R developer:developer /home/developer/data

# =============================================================================
# Supervisor configuration for database services
# =============================================================================
COPY config/supervisord-databases.conf /etc/supervisor/conf.d/databases.conf

# =============================================================================
# Environment variables
# =============================================================================
ENV POSTGRES_PORT=5432
ENV REDIS_PORT=6379
ENV PGDATA=/home/developer/data/postgres

# =============================================================================
# Add-on metadata
# =============================================================================
ENV CODEOPEN_ADDON_DATABASES="true"
ENV CODEOPEN_POSTGRES_PORT=5432
ENV CODEOPEN_REDIS_PORT=6379

# =============================================================================
# Expose ports (internal only by default)
# =============================================================================
# 5432: PostgreSQL
# 6379: Redis
EXPOSE 5432 6379

USER developer
WORKDIR /home/developer/workspace
