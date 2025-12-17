#!/bin/bash
# =============================================================================
# PostgreSQL Backup Script
# =============================================================================
# Creates compressed backups with automatic rotation
# 
# Usage:
#   ./backup-db.sh              # Run backup
#   ./backup-db.sh restore <file>  # Restore from backup
#   ./backup-db.sh list         # List available backups
#   ./backup-db.sh cleanup      # Manual cleanup of old backups
#
# Environment Variables:
#   PGHOST      - PostgreSQL host (default: postgres)
#   PGPORT      - PostgreSQL port (default: 5432)
#   PGUSER      - PostgreSQL user (default: agentpod)
#   PGPASSWORD  - PostgreSQL password (required)
#   PGDATABASE  - Database name (default: agentpod)
#   BACKUP_DIR  - Backup directory (default: /backups)
#   KEEP_DAILY  - Days to keep daily backups (default: 7)
#   KEEP_WEEKLY - Weeks to keep weekly backups (default: 4)
# =============================================================================

set -euo pipefail

# Configuration
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-agentpod}"
PGDATABASE="${PGDATABASE:-agentpod}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

# Derived values
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
BACKUP_FILE="${BACKUP_DIR}/daily/${PGDATABASE}_${TIMESTAMP}.sql.gz"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
DAILY_DIR="${BACKUP_DIR}/daily"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Backup Function
# =============================================================================
do_backup() {
    log_info "Starting PostgreSQL backup..."
    log_info "Host: ${PGHOST}:${PGPORT}"
    log_info "Database: ${PGDATABASE}"
    log_info "Backup file: ${BACKUP_FILE}"

    # Create backup directories
    mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

    # Check database connection
    if ! pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -q; then
        log_error "Cannot connect to PostgreSQL"
        exit 1
    fi

    # Create backup
    log_info "Creating backup..."
    pg_dump \
        -h "${PGHOST}" \
        -p "${PGPORT}" \
        -U "${PGUSER}" \
        -d "${PGDATABASE}" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        | gzip > "${BACKUP_FILE}"

    # Verify backup was created and has content
    if [ ! -f "${BACKUP_FILE}" ]; then
        log_error "Backup file was not created"
        exit 1
    fi

    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log_info "Backup created successfully: ${BACKUP_SIZE}"

    # Create weekly backup on Sunday (day 7)
    if [ "${DAY_OF_WEEK}" -eq 7 ]; then
        WEEKLY_FILE="${WEEKLY_DIR}/${PGDATABASE}_week_${DATE}.sql.gz"
        cp "${BACKUP_FILE}" "${WEEKLY_FILE}"
        log_info "Weekly backup created: ${WEEKLY_FILE}"
    fi

    # Cleanup old backups
    cleanup_old_backups
}

# =============================================================================
# Cleanup Function
# =============================================================================
cleanup_old_backups() {
    log_info "Cleaning up old backups..."

    # Remove daily backups older than KEEP_DAILY days
    if [ -d "${DAILY_DIR}" ]; then
        DELETED_DAILY=$(find "${DAILY_DIR}" -name "*.sql.gz" -type f -mtime +${KEEP_DAILY} -delete -print | wc -l)
        log_info "Deleted ${DELETED_DAILY} daily backup(s) older than ${KEEP_DAILY} days"
    fi

    # Remove weekly backups older than KEEP_WEEKLY weeks
    KEEP_WEEKLY_DAYS=$((KEEP_WEEKLY * 7))
    if [ -d "${WEEKLY_DIR}" ]; then
        DELETED_WEEKLY=$(find "${WEEKLY_DIR}" -name "*.sql.gz" -type f -mtime +${KEEP_WEEKLY_DAYS} -delete -print | wc -l)
        log_info "Deleted ${DELETED_WEEKLY} weekly backup(s) older than ${KEEP_WEEKLY} weeks"
    fi
}

# =============================================================================
# Restore Function
# =============================================================================
do_restore() {
    RESTORE_FILE="$1"

    if [ -z "${RESTORE_FILE}" ]; then
        log_error "Usage: $0 restore <backup_file>"
        exit 1
    fi

    if [ ! -f "${RESTORE_FILE}" ]; then
        log_error "Backup file not found: ${RESTORE_FILE}"
        exit 1
    fi

    log_warn "This will OVERWRITE the current database: ${PGDATABASE}"
    log_warn "Restoring from: ${RESTORE_FILE}"
    
    # Check if running interactively
    if [ -t 0 ]; then
        read -p "Are you sure? (yes/no): " CONFIRM
        if [ "${CONFIRM}" != "yes" ]; then
            log_info "Restore cancelled"
            exit 0
        fi
    else
        log_warn "Running non-interactively, proceeding with restore..."
    fi

    log_info "Restoring database..."
    
    # Decompress and restore
    gunzip -c "${RESTORE_FILE}" | psql \
        -h "${PGHOST}" \
        -p "${PGPORT}" \
        -U "${PGUSER}" \
        -d "${PGDATABASE}" \
        --single-transaction \
        --set ON_ERROR_STOP=on

    log_info "Database restored successfully"
}

# =============================================================================
# List Backups Function
# =============================================================================
list_backups() {
    log_info "Available backups:"
    echo ""
    echo "Daily backups:"
    if [ -d "${DAILY_DIR}" ]; then
        ls -lh "${DAILY_DIR}"/*.sql.gz 2>/dev/null || echo "  (none)"
    else
        echo "  (directory not found)"
    fi
    echo ""
    echo "Weekly backups:"
    if [ -d "${WEEKLY_DIR}" ]; then
        ls -lh "${WEEKLY_DIR}"/*.sql.gz 2>/dev/null || echo "  (none)"
    else
        echo "  (directory not found)"
    fi
}

# =============================================================================
# Verify Function
# =============================================================================
do_verify() {
    VERIFY_FILE="${1:-}"
    
    if [ -z "${VERIFY_FILE}" ]; then
        # Verify most recent backup
        if [ -d "${DAILY_DIR}" ]; then
            VERIFY_FILE=$(ls -t "${DAILY_DIR}"/*.sql.gz 2>/dev/null | head -1)
        fi
    fi
    
    if [ -z "${VERIFY_FILE}" ] || [ ! -f "${VERIFY_FILE}" ]; then
        log_error "No backup file to verify"
        exit 1
    fi
    
    log_info "Verifying backup integrity: ${VERIFY_FILE}"
    
    if gunzip -t "${VERIFY_FILE}" 2>/dev/null; then
        log_info "Backup integrity: OK"
        BACKUP_SIZE=$(du -h "${VERIFY_FILE}" | cut -f1)
        UNCOMPRESSED_SIZE=$(gunzip -c "${VERIFY_FILE}" | wc -c | numfmt --to=iec 2>/dev/null || gunzip -c "${VERIFY_FILE}" | wc -c)
        log_info "Compressed size: ${BACKUP_SIZE}"
        log_info "Uncompressed size: ${UNCOMPRESSED_SIZE}"
    else
        log_error "Backup integrity: FAILED"
        exit 1
    fi
}

# =============================================================================
# Main
# =============================================================================
case "${1:-backup}" in
    backup)
        do_backup
        ;;
    restore)
        do_restore "${2:-}"
        ;;
    list)
        list_backups
        ;;
    cleanup)
        cleanup_old_backups
        ;;
    verify)
        do_verify "${2:-}"
        ;;
    *)
        echo "Usage: $0 {backup|restore|list|cleanup|verify}"
        echo ""
        echo "Commands:"
        echo "  backup          Create a new backup (default)"
        echo "  restore <file>  Restore from a backup file"
        echo "  list            List available backups"
        echo "  cleanup         Remove old backups based on retention policy"
        echo "  verify [file]   Verify backup integrity (defaults to most recent)"
        exit 1
        ;;
esac
