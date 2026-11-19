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
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ "$(stat -f -c %T /dev/shm)" == tmpfs ]]
work=$(mktemp -d /dev/shm/ponte-backup.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
cd "$work"
previous=$(restic snapshots --host ponte --tag ponte-database --path /ponte-v3.tar --latest 1 --json | jq -er '.[0].id // "none"')
if [[ "$previous" != none ]]; then
  restic dump "$previous" /ponte-v3.tar | tar -xf - rows.sqlite
fi
export PGCLIENTENCODING=UTF8 PGDATESTYLE=ISO PGOPTIONS="-c row_security=off -c timezone=UTC -c bytea_output=hex -c intervalstyle=postgres"
python3 "$script_dir/incremental-backup.py"
restic backup --host ponte --tag ponte-database --stdin-filename ponte-v3.tar \
  --stdin-from-command -- tar -cf - core.dump rows.sqlite
restic check
