#!/usr/bin/env bash
# Read an external backup into a disposable PostgreSQL cluster in this container.
set -euo pipefail
umask 077
[[ "${SNAPSHOT_PREFIX:-}" =~ ^[0-9a-f]{8,64}$ ]] || {
  echo 'Supply a snapshot ID or unique hexadecimal prefix of at least 8 characters.' >&2; exit 1;
}
for name in RESTIC_REPOSITORY RESTIC_PASSWORD; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 1; }
done
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ "$(stat -f -c %T /var/lib/postgresql)" == tmpfs ]] || { echo 'Database storage must be tmpfs.' >&2; exit 1; }
export PGDATA=/var/lib/postgresql/recovery-drill
[[ ! -e "$PGDATA/PG_VERSION" ]] || { echo 'Recovery cluster already exists.' >&2; exit 1; }
# Never inherit a production database connection, even if supplied accidentally.
unset PGSERVICE PGSERVICEFILE PGHOSTADDR PGOPTIONS PGPASSFILE
export PGHOST=127.0.0.1 PGPORT=55432 PGDATABASE=ponte_restore_drive PGUSER=church_restore
export PGSSLMODE=disable RESTORE_EXPECTED_HOST=127.0.0.1
export POSTGRES_DB="$PGDATABASE" POSTGRES_USER="$PGUSER"
POSTGRES_PASSWORD=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
export POSTGRES_PASSWORD
export PGPASSWORD="$POSTGRES_PASSWORD"
started=$SECONDS
snapshots=$(restic snapshots --host ponte --tag ponte-database --json "$SNAPSHOT_PREFIX")
RESTORE_SNAPSHOT=$(printf '%s' "$snapshots" | jq -er 'if length == 1 and (.[0].paths == ["/ponte.dump"] or .[0].paths == ["/ponte-v2.tar"] or .[0].paths == ["/ponte-v3.tar"]) and .[0].hostname == "ponte" and ((.[0].tags // []) | index("ponte-database") != null) then .[0].id else error("Snapshot must identify exactly one Ponte database backup") end')
export RESTORE_SNAPSHOT
restic check
# Bootstrap the isolated cluster directly. This works both in a fresh recovery
# container and in CI where another postmaster already serves the source DB.
install -d -m 700 -o postgres -g postgres "$PGDATA"
pwfile=$(mktemp /dev/shm/ponte-initdb.XXXXXXXX)
trap 'rm -f -- "$pwfile"' EXIT
printf '%s\n' "$PGPASSWORD" >"$pwfile"
chown postgres "$pwfile"
su -s /bin/sh postgres -c 'exec initdb -D "$PGDATA" -U church_restore --pwfile="$1" --auth=scram-sha-256' sh "$pwfile" >/dev/null
rm -f -- "$pwfile"
su -s /bin/sh postgres -c 'exec pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -o "-p 55432 -h 127.0.0.1 -k $PGDATA" -w start'
stop_cluster() {
  su -s /bin/sh postgres -c 'pg_ctl -D "$PGDATA" -m fast -w stop'
}
trap stop_cluster EXIT
createdb --maintenance-db=postgres "$PGDATABASE"
bash "$script_dir/restore-database.sh"
# Avoid printing source rows or attachment names, including on a failed check.
if ! psql -X -v ON_ERROR_STOP=1 >/tmp/ponte-recovery-validation.log 2>&1 <<'SQL'
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Migration history is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM public.private_files WHERE octet_length(content)=0)
    OR EXISTS (SELECT 1 FROM public.schedule_attachments WHERE "uploadComplete" AND size <> octet_length(content))
  THEN RAISE EXCEPTION 'Invalid recovered attachment content'; END IF;
END $verify$;
SQL
then echo 'Recovered database validation failed; no source rows are written to logs.' >&2; exit 1; fi
if ! psql -X -v ON_ERROR_STOP=1 -f /opt/ponte/runtime-privileges.sql >/tmp/ponte-recovery-privileges.log 2>&1; then
  echo 'Failed to apply restricted runtime privileges.' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v runtime_password="$POSTGRES_PASSWORD" >/tmp/ponte-recovery-login.log 2>&1 <<'SQL'
CREATE ROLE church_restore_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'runtime_password';
GRANT church_runtime TO church_restore_app;
SQL
PGUSER=church_restore_app psql -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*) FILTER (WHERE md5(content) IS NOT NULL) AS recovered_private_documents FROM public.private_files;
SELECT count(*) FILTER (WHERE md5(content) IS NOT NULL) AS recovered_schedule_attachments FROM public.schedule_attachments;
DO $verify$
BEGIN
  IF has_table_privilege(current_user,'public._prisma_migrations','UPDATE')
    OR has_table_privilege(current_user,'public.audit_logs','DELETE')
  THEN RAISE EXCEPTION 'Runtime permissions are excessive'; END IF;
END $verify$;
SQL
echo "Recovered snapshot $RESTORE_SNAPSHOT; database/documents/runtime login verified; elapsed=$((SECONDS-started))s."
