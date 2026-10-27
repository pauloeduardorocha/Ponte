#!/usr/bin/env bash
# Linux/WSL. Credentials are inherited through libpq/restic environment variables.
set -euo pipefail
umask 077
for name in PGHOST PGDATABASE PGUSER RESTIC_REPOSITORY RESTIC_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then echo "Missing $name" >&2; exit 1; fi
done
if [[ "$PGHOST" == *-pooler.* ]]; then
  echo 'Backup requires a direct PostgreSQL connection.' >&2; exit 1
fi
if [[ "$PGHOST" != localhost && "$PGHOST" != 127.0.0.1 && "${PGSSLMODE:-}" != verify-full && "${PGSSLMODE:-}" != require ]]; then
  echo 'Remote PostgreSQL requires PGSSLMODE=require or verify-full.' >&2; exit 1
fi
if [[ "${PRIVATE_STORAGE_DRIVER:-}" != database ]]; then
  echo 'This backup requires PRIVATE_STORAGE_DRIVER=database; filesystem attachments need a coordinated copy.' >&2; exit 1
fi
export PGCONNECT_TIMEOUT=20
# No plaintext archive on disk. Unlike --stdin, this cancels the snapshot when
# pg_dump fails. Database bytea attachments are included in its consistent snapshot.
restic backup --host ponte --tag ponte-database --stdin-filename ponte.dump \
  --stdin-from-command -- pg_dump --format=custom --no-owner --no-acl --no-password --lock-wait-timeout=60s
restic check
echo 'Encrypted database backup and repository check completed.'
