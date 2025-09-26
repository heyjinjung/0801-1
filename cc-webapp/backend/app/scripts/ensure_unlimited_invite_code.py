"""Ensure UNLIMITED_INVITE_CODE row exists (idempotent).

Usage:
  docker compose exec backend python -m app.scripts.ensure_unlimited_invite_code
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

from app.database import SessionLocal
from app.models.auth_models import InviteCode
from app.core.config import settings


def _get_inspector(conn: Connection) -> Inspector:
    return sa.inspect(conn)


def main() -> None:
    # 기본값 하드코드 제거: 환경/설정에서만 읽어오며, 미설정 시 명시적 오류를 유도
    code = settings.UNLIMITED_INVITE_CODE or os.getenv("UNLIMITED_INVITE_CODE")
    if not code:
        raise SystemExit("UNLIMITED_INVITE_CODE 미설정: 환경변수 또는 settings에서 값을 지정하세요.")
    sess = SessionLocal()
    try:
        conn = sess.connection()
        insp = _get_inspector(conn)
        cols = {c["name"] for c in insp.get_columns("invite_codes")}

        # 안전한 조회: 전체 매핑 대신 최소 컬럼만 선택
        inv_row = conn.execute(
            sa.text("SELECT id, code, is_active FROM invite_codes WHERE code=:code LIMIT 1"),
            {"code": code},
        ).m.fetchone() if hasattr(conn.execute(sa.text("SELECT 1")), 'm') else conn.execute(
            sa.text("SELECT id, code, is_active FROM invite_codes WHERE code=:code LIMIT 1"),
            {"code": code},
        ).fetchone()

        created = False
        if inv_row is None:
            # INSERT 시 존재하는 컬럼만 사용하여 동적 구성
            data: Dict[str, Any] = {"code": code}
            if "is_active" in cols:
                data["is_active"] = True
            if "is_used" in cols:
                data["is_used"] = False
            if "used_count" in cols:
                data["used_count"] = 0
            placeholders = ", ".join(data.keys())
            values = ", ".join([f":{k}" for k in data.keys()])
            conn.execute(sa.text(f"INSERT INTO invite_codes ({placeholders}) VALUES ({values})"), data)
            created = True
        else:
            # Normalize 최소 필드
            if "is_active" in cols and inv_row[2] is False:
                conn.execute(sa.text("UPDATE invite_codes SET is_active=1 WHERE code=:code"), {"code": code})
            if "expires_at" in cols:
                # 만료가 과거면 NULL
                row = conn.execute(
                    sa.text("SELECT expires_at FROM invite_codes WHERE code=:code"), {"code": code}
                ).fetchone()
                if row and row[0] is not None:
                    try:
                        exp: datetime = row[0]
                        if exp < datetime.utcnow():
                            conn.execute(
                                sa.text("UPDATE invite_codes SET expires_at=NULL WHERE code=:code"),
                                {"code": code},
                            )
                    except Exception:
                        pass
        sess.commit()
        print({"code": code, "status": "created" if created else "ok"})
    except Exception:
        sess.rollback()
        raise
    finally:
        sess.close()


if __name__ == "__main__":  # pragma: no cover
    main()
