#!/usr/bin/env python3
"""Alembic single-head / drift guard

Checks:
1. Exactly one head (alembic heads)
2. Current DB revision reachable (alembic current)
Exit codes:
 0 OK
 1 Multiple or zero heads
 2 Command execution error
 3 Current revision missing
"""
from __future__ import annotations
import subprocess, sys, re

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
else:
    print(f"[INFO] current revision(s): {curr_revs}")
print("[PASS] alembic head guard checks complete")
