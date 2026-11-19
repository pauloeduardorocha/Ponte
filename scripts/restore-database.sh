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
paths=$(restic snapshots "$RESTORE_SNAPSHOT" --host ponte --tag ponte-database --json | jq -er 'if length == 1 then .[0].paths | join(",") else error("Unknown snapshot") end')
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$restore_dir"
case "$paths" in
  /ponte.dump)
    restic restore "$RESTORE_SNAPSHOT" --target . --include /ponte.dump
    pg_restore --dbname="$PGDATABASE" --no-owner --no-acl --exit-on-error --single-transaction ponte.dump >pg-restore.log 2>&1
    ;;
  /ponte-v2.tar|/ponte-v3.tar)
    restic dump "$RESTORE_SNAPSHOT" "$paths" | tar -xf -
    [[ -s core.dump ]]
    export PGCLIENTENCODING=UTF8 PGDATESTYLE=ISO PGOPTIONS="-c timezone=UTC -c intervalstyle=postgres"
    # COMMIT is emitted only after all three pg_restore sections and COPYs succeed.
    (
      set -e
      echo BEGIN\;
      pg_restore -f - --no-owner --no-acl --section=pre-data core.dump || exit 1
      pg_restore -f - --no-owner --no-acl --section=data core.dump || exit 1
      if [[ "$paths" == /ponte-v3.tar ]]; then
        python3 "$script_dir/incremental-backup.py" restore || exit 1
      else
        [[ -d rows ]] || exit 1
        shopt -s nullglob
        for table in private_files schedule_attachments; do
          echo "COPY public.$table FROM stdin;"
          for row in rows/"$table"-*; do cat "$row" || exit 1; done
          printf '%s\n' '\.'
        done
      fi
      pg_restore -f - --no-owner --no-acl --section=post-data core.dump || exit 1
      echo COMMIT\;
    ) | psql -Xq -v ON_ERROR_STOP=1 >pg-restore.log 2>&1
    ;;
  *) echo 'Unknown backup format.' >&2; exit 1 ;;
esac
echo 'Database restored. Apply restricted runtime privileges before starting the API.'
