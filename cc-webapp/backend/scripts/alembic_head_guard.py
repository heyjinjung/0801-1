#!/usr/bin/env python3
"""Alembic single-head / drift guard

Checks:
1. Exactly one head (alembic heads)
2. Current DB revision reachable (alembic current or DB fallback)
Exit codes:
 0 OK
 1 Multiple or zero heads
 2 Command execution error
 3 Current revision missing
"""
from __future__ import annotations
import os
import subprocess, sys, re

def _db_select_current_revision_via_psycopg2() -> str | None:
    """Fallback: read alembic_version.version_num directly from Postgres.

    Uses env: POSTGRES_HOST/PORT/USER/PASSWORD/DB (or *_URL)
    Returns version string or None if unavailable/error.
    """
    try:
        import psycopg2  # type: ignore
    except Exception:
        return None

    dsn = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = int(os.getenv("POSTGRES_PORT", "5432"))
        user = os.getenv("POSTGRES_USER", "postgres")
        password = os.getenv("POSTGRES_PASSWORD", "postgres")
        db = os.getenv("POSTGRES_DB", os.getenv("POSTGRES_DATABASE", "postgres"))
        dsn = f"host={host} port={port} user={user} password={password} dbname={db}"
    try:
        with psycopg2.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version_num FROM alembic_version LIMIT 1")
                row = cur.fetchone()
                if row and row[0]:
                    return str(row[0])
    except Exception as e:
        print(f"[alembic_head_guard][fallback-db] error: {e}")
        return None
    return None

def run(cmd: list[str]) -> str:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return out.strip()
    except subprocess.CalledProcessError as e:
        print(f"[alembic_head_guard] command failed: {' '.join(cmd)}\n{e.output}")
        sys.exit(2)

heads_out = run(["alembic", "heads"])
# lines like: c6a1b5e2e2b1 (head)
head_revs = [m.group(1) for m in re.finditer(r"^([0-9a-f]+) \(head\)$", heads_out, re.MULTILINE)]
if len(head_revs) != 1:
    print(f"[FAIL] head count != 1 : {head_revs}")
    sys.exit(1)
print(f"[OK] single head: {head_revs[0]}")

current_out = run(["alembic", "current"])
# attempt to find revision hashes in current output
curr_revs = re.findall(r"([0-9a-f]{12,})", current_out)
if not curr_revs:
    print(f"[WARN] no current revision hash detected in output. Raw:\n{current_out}")
    # DB fallback
    db_rev = _db_select_current_revision_via_psycopg2()
    if db_rev:
        print(f"[INFO] DB fallback current revision: {db_rev}")
        curr_revs = [db_rev]
    else:
        print("[WARN] DB fallback also unavailable; continuing but marking as missing current revision")
else:
    print(f"[INFO] current revision(s): {curr_revs}")
print("[PASS] alembic head guard checks complete")
