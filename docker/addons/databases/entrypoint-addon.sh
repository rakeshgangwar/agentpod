#!/bin/bash
# =============================================================================
# Databases Add-on Entrypoint Extension
# This script is sourced by the main entrypoint to manage database services
# =============================================================================

init_postgres() {
    echo "Initializing PostgreSQL..."
    
    PGDATA="${PGDATA:-/home/developer/data/postgres}"
    
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "  First run - initializing database cluster..."
        initdb -D "$PGDATA" -E UTF8 --locale=en_US.UTF-8
    fi
    
    echo "  PostgreSQL data directory: $PGDATA"
}

start_postgres() {
    echo "Starting PostgreSQL..."
    
    PGDATA="${PGDATA:-/home/developer/data/postgres}"
    pg_ctl -D "$PGDATA" -l /tmp/postgres.log start
    
    echo "  PostgreSQL started on port ${POSTGRES_PORT:-5432}"
}

start_redis() {
    echo "Starting Redis..."
    
    redis-server --daemonize yes --port "${REDIS_PORT:-6379}"
    
    echo "  Redis started on port ${REDIS_PORT:-6379}"
}

# Export functions for main entrypoint
export -f init_postgres
export -f start_postgres
export -f start_redis
