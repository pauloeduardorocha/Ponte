"""Incremental PostgreSQL table data, stored in a self-contained SQLite file in tmpfs."""
import json
import re
import sqlite3
import subprocess
import sys

PSQL = ["psql", "-XqAtw", "-v", "ON_ERROR_STOP=1"]
CATALOG = """
SELECT json_build_array(n.nspname, c.relname,
  ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid
        AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
        ORDER BY a.attnum))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass
                AND d.objid=c.oid AND d.deptype='e')
ORDER BY n.nspname,c.relname
"""


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def query(start, sql):
    return subprocess.check_output(PSQL + ["-c", start + sql], text=True).splitlines()


def sync_table(db, start, source, columns):
    projection = ", ".join(map(quote, columns))
    if not projection:
        raise ValueError("Table without writable columns: " + source)
    copy = f"COPY {source} ({projection}) FROM stdin;"
    db.execute("INSERT INTO tables VALUES (?)", (copy,))
    # ctid is used only within this snapshot. Matching across backups uses the
    # digest and column list, so duplicates, composite keys and keyless tables work.
    manifest = query(start, f"SELECT ctid::text || ' ' || encode(sha256(record_send(t)), 'hex') FROM ONLY {source} t")
    missing = {}
    counts = {}
    for line in manifest:
        tid, digest = line.split()
        if not re.fullmatch(r"\(\d+,\d+\)", tid) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("Invalid row manifest")
        counts[digest] = counts.get(digest, 0) + 1
        if counts[digest] == 1 and not db.execute(
            "SELECT 1 FROM rows WHERE stmt=? AND digest=?", (copy, digest)
        ).fetchone():
            missing[tid] = digest
    tids = list(missing)
    for offset in range(0, len(tids), 512):
        batch = tids[offset:offset + 512]
        items = ",".join(f"'{tid}'::tid" for tid in batch)
        sql = f"COPY (SELECT ctid, {projection} FROM ONLY {source} WHERE ctid IN ({items})) TO STDOUT"
        pending = set(batch)
        with subprocess.Popen(PSQL + ["-c", start + sql], stdout=subprocess.PIPE) as reader:
            for row in reader.stdout:
                raw_tid, data = row.split(b"\t", 1)
                tid = raw_tid.decode("ascii")
                pending.remove(tid)
                if not data.endswith(b"\n"):
                    raise ValueError("Incomplete COPY row")
                db.execute("INSERT INTO rows VALUES (?, ?, ?, 0)", (copy, missing[tid], data))
            if reader.wait() or pending:
                raise RuntimeError("Incomplete table export")
    db.executemany("UPDATE rows SET copies=? WHERE stmt=? AND digest=?",
                   ((count, copy, digest) for digest, count in counts.items()))
    print(f"{source}: {len(manifest)} rows, {len(missing)} downloaded", flush=True)


def backup(db):
    with subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          text=True, bufsize=1) as owner:
        owner.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
        owner.stdin.flush()
        snap = owner.stdout.readline().strip()
        if not re.fullmatch(r"[0-9a-fA-F-]+", snap):
            raise RuntimeError("Snapshot export failed")
        start = f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '{snap}'; "
        tables = [json.loads(s) for s in query(start, CATALOG)]
        if not tables:
            raise ValueError("No application tables found")
        sources = [(quote(schema) + "." + quote(name), cols) for schema, name, cols in tables]
        subprocess.run(["pg_dump", "-Fc", "--no-owner", "--no-acl", "--no-password",
                        "--lock-wait-timeout=60s", "--snapshot", snap, "-f", "core.dump",
                        *("--exclude-table-data=" + source for source, _ in sources)], check=True)
        db.executescript("""
            CREATE TABLE IF NOT EXISTS rows(stmt TEXT, digest TEXT, data BLOB, copies INTEGER,
                                            PRIMARY KEY(stmt,digest)) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS tables(stmt TEXT PRIMARY KEY);
            DELETE FROM tables;
            UPDATE rows SET copies=0;
        """)
        for source, cols in sources:
            sync_table(db, start, source, cols)
        db.execute("DELETE FROM rows WHERE copies=0")
        owner.stdin.close()
        if owner.wait():
            raise RuntimeError("Snapshot exporter failed")
    db.commit()
    db.execute("VACUUM")


def restore(db, output):
    for stmt, in db.execute("SELECT stmt FROM tables ORDER BY stmt"):
        output.write(stmt.encode() + b"\n")
        for row, copies in db.execute("SELECT data,copies FROM rows WHERE stmt=?", (stmt,)):
            for _ in range(copies):
                output.write(row)
        output.write(b"\\.\n")


if __name__ == "__main__":
    if sys.argv[1:] == ["restore"]:
        with sqlite3.connect("file:rows.sqlite?mode=ro", uri=True) as db:
            restore(db, sys.stdout.buffer)
    else:
        with sqlite3.connect("rows.sqlite") as db:
            backup(db)
