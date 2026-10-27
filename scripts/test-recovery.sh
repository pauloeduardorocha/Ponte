#!/usr/bin/env bash
# Invoked only inside the disposable Compose container after all migrations.
set -euo pipefail
umask 077
[[ "$PGDATABASE" =~ ^ponte_push_test_[0-9a-f]+$ && "$PGHOST" == 127.0.0.1 ]] || exit 1
started=$SECONDS
export RESTIC_REPOSITORY=rclone:local:/tmp/ponte-recovery-repository
export RESTIC_PASSWORD="$PGPASSWORD"
export RCLONE_CONFIG_LOCAL_TYPE=local
export PRIVATE_STORAGE_DRIVER=database
restic init
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO private_files (id,content) VALUES ('00000000-0000-4000-8000-000000000001',decode('255044462d312e370a00ff','hex'));
INSERT INTO volunteer_schedules (id,title,date,"updatedAt") VALUES ('00000000-0000-4000-8000-000000000002','Recovery drill',now(),now());
INSERT INTO schedule_attachments (id,"scheduleId",filename,mime,size,content) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','drill.pdf','application/pdf',11,decode('255044462d312e370a00ff','hex'));
SQL
# Fingerprint every table, including migration history and both attachment stores.
fingerprint() {
  psql -XAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT format('SELECT %L || '':'' || count(*) || '':'' || coalesce(md5(string_agg(row_to_json(t)::text,E''\n'' ORDER BY row_to_json(t)::text)),'''') FROM %I.%I t;',tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
\gexec
SQL
}
fingerprint > /tmp/before.txt
bash /tmp/backup-database.sh
if PGHOST=example-pooler.invalid bash /tmp/backup-database.sh; then exit 1; fi
if PRIVATE_STORAGE_DRIVER=filesystem bash /tmp/backup-database.sh; then exit 1; fi
export RESTORE_SNAPSHOT=$(restic snapshots --tag ponte-database --json | sed -n 's/.*"id":"\([0-9a-f]\{64\}\)".*/\1/p')
[[ "$RESTORE_SNAPSHOT" =~ ^[0-9a-f]{64}$ ]]
# A failed producer must never create a snapshot.
before=$(restic snapshots --json)
if restic backup --host ponte --tag failure-test --stdin-from-command -- sh -c 'printf incomplete; exit 1'; then exit 1; fi
[[ "$(restic snapshots --json)" == "$before" ]]
restic check --read-data
restic forget --host ponte --tag ponte-database --group-by host,paths --keep-within 7d --keep-weekly 4 --keep-monthly 3 --dry-run
createdb ponte_restore_drill
export PGDATABASE=ponte_restore_drill RESTORE_EXPECTED_HOST=127.0.0.1
if RESTIC_PASSWORD=incorrect bash /tmp/restore-database.sh; then exit 1; fi
bash /tmp/restore-database.sh
fingerprint > /tmp/after.txt
diff -u /tmp/before.txt /tmp/after.txt
# Refuse an existing database even with a valid archive.
if bash /tmp/restore-database.sh; then exit 1; fi
SNAPSHOT_PREFIX="$RESTORE_SNAPSHOT" bash /tmp/rehearse-recovery.sh
echo "All tables and binary documents recovered; elapsed=${SECONDS}s (started=${started}s)."
