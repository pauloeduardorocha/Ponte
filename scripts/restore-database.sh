#!/usr/bin/env bash
# Restore an explicit snapshot only into an empty recovery database.
set -euo pipefail
umask 077
for name in PGHOST PGDATABASE PGUSER RESTIC_REPOSITORY RESTIC_PASSWORD RESTORE_EXPECTED_HOST RESTORE_SNAPSHOT; do
  if [[ -z "${!name:-}" ]]; then echo "Missing $name" >&2; exit 1; fi
done
[[ "$PGHOST" == "$RESTORE_EXPECTED_HOST" && "$PGDATABASE" =~ ^ponte_restore_[a-z0-9_]+$ ]] || {
  echo 'Use the explicit recovery host and a ponte_restore_* database.' >&2; exit 1;
}
[[ "$RESTORE_SNAPSHOT" =~ ^[0-9a-f]{64}$ ]] || { echo 'Supply a full snapshot ID.' >&2; exit 1; }
[[ "$PGHOST" != *-pooler.* ]] || { echo 'Use a direct connection.' >&2; exit 1; }
if [[ "$PGHOST" != localhost && "$PGHOST" != 127.0.0.1 && "${PGSSLMODE:-}" != verify-full && "${PGSSLMODE:-}" != require ]]; then
  echo 'Remote PostgreSQL requires TLS.' >&2; exit 1
fi
export PGCONNECT_TIMEOUT=20
[[ "$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')")" == 0 ]] || {
  echo 'Recovery database must be empty.' >&2; exit 1;
}
# Decrypt only onto tmpfs, then restore after restic has verified the download.
[[ "$(stat -f -c %T /dev/shm)" == tmpfs ]] || { echo '/dev/shm must be tmpfs.' >&2; exit 1; }
restore_dir=$(mktemp -d /dev/shm/ponte-restore.XXXXXXXX)
trap 'rm -rf -- "$restore_dir"' EXIT
restic restore "$RESTORE_SNAPSHOT" --target "$restore_dir" --include /ponte.dump
[[ -s "$restore_dir/ponte.dump" ]] || { echo 'Missing database archive.' >&2; exit 1; }
if ! pg_restore --dbname="$PGDATABASE" --no-owner --no-acl --exit-on-error --single-transaction "$restore_dir/ponte.dump" >"$restore_dir/pg-restore.log" 2>&1; then
  echo 'pg_restore failed. Inspect the archive in a private isolated environment; source rows are omitted from logs.' >&2
  exit 1
fi
echo 'Database restored. Apply restricted runtime privileges before starting the API.'
