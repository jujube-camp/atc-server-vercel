#!/usr/bin/env bash
# Migrate data from RDS (source) to Neon (target).
# Requires: SOURCE_DATABASE_URL and TARGET_DATABASE_URL in environment.
# Uses pg_dump/pg_restore from PATH, or Docker (postgres:16) if not found.
#
# Example:
#   export SOURCE_DATABASE_URL="postgresql://user:pass@rds-host:5432/smart-atc"
#   export TARGET_DATABASE_URL="postgresql://user:pass@neon-host/neondb?sslmode=require"
#   ./scripts/migrate-rds-to-neon.sh
#
# If RDS connection times out: RDS is often in a VPC. Run this script from a host
# that can reach RDS (e.g. EC2 in the same VPC, or after VPN/bastion to the VPC).
# Ensure libpq is in PATH: export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

set -e

if [ -z "$SOURCE_DATABASE_URL" ] || [ -z "$TARGET_DATABASE_URL" ]; then
  echo "Usage: SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... $0"
  echo "  SOURCE_DATABASE_URL  - RDS PostgreSQL connection string"
  echo "  TARGET_DATABASE_URL  - Neon PostgreSQL connection string (pooled)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_FILE="${SCRIPT_DIR}/.migration-backup.dump"
USE_DOCKER=false

# pg_dump/pg_restore don't support ?schema=public; strip it for the dump/restore
SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL%%\?*}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL%%\?*}"
# Neon requires SSL; re-append sslmode for target
if [[ "$TARGET_DATABASE_URL" == *"neon.tech"* ]]; then
  TARGET_DATABASE_URL="${TARGET_DATABASE_URL}?sslmode=require"
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not in PATH; using Docker (postgres:16)..."
  USE_DOCKER=true
fi

run_pg_dump() {
  if [ "$USE_DOCKER" = true ]; then
    docker run --rm \
      -v "${SCRIPT_DIR}:/backup" \
      --network host \
      -e PGDATABASE="" \
      postgres:16-alpine \
      pg_dump "$SOURCE_DATABASE_URL" "$@"
  else
    pg_dump "$SOURCE_DATABASE_URL" "$@"
  fi
}

run_pg_restore() {
  if [ "$USE_DOCKER" = true ]; then
    docker run --rm \
      -v "${SCRIPT_DIR}:/backup" \
      --network host \
      postgres:16-alpine \
      pg_restore -d "$TARGET_DATABASE_URL" "$@"
  else
    pg_restore -d "$TARGET_DATABASE_URL" "$@"
  fi
}

echo "Step 1: Ensuring target (Neon) schema is up to date..."
cd "$SCRIPT_DIR/.."
DATABASE_URL="$TARGET_DATABASE_URL" pnpm prisma migrate deploy

echo "Step 2: Dumping data from RDS (data-only, custom format)..."
if [ "$USE_DOCKER" = true ]; then
  run_pg_dump -F c --data-only --no-owner --no-acl -f /backup/.migration-backup.dump
else
  run_pg_dump -F c --data-only --no-owner --no-acl -f "$BACKUP_FILE"
fi

echo "Step 3: Restoring data into Neon..."
if [ "$USE_DOCKER" = true ]; then
  run_pg_restore --data-only --no-owner --no-acl /backup/.migration-backup.dump || true
else
  run_pg_restore --data-only --no-owner --no-acl "$BACKUP_FILE" || true
fi

echo "Step 4: Cleaning up backup file..."
rm -f "$BACKUP_FILE"

echo "Migration complete."
