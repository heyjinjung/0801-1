"""
간단 스모크: 회원가입 → 프로필 조회 200 확인만 수행.

컨테이너 내부 실행 예:
  docker compose exec backend python -m app.scripts.smoke_signup_profile
환경변수:
  SMOKE_API: 기본 http://localhost:8000
  INVITE_CODE: 기본 5858
"""
from __future__ import annotations

import json
import os
import time
import sys
import random
import httpx


def main() -> int:  # pragma: no cover
    base = os.getenv("SMOKE_API", "http://localhost:8000")
    invite = os.getenv("INVITE_CODE")
    if not invite:
        raise SystemExit("INVITE_CODE 미설정: export INVITE_CODE=... 후 실행하세요 (하드코드 5858 제거됨)")
    site_id = f"neo{int(time.time())}"
    phone = f"010{random.randint(10000000, 99999999)}"
    body = {
        "site_id": site_id,
        "nickname": site_id,
        "password": "P@ssw0rd!",
        "invite_code": invite,
        "phone_number": phone,
    }
    try:
        r = httpx.post(f"{base}/api/auth/signup", json=body, timeout=15)
    except Exception as e:  # 네트워크 등 예외
        print("SIGNUP_REQUEST_ERROR", str(e))
        return 2
    print("signup", r.status_code)
    if r.headers.get("content-type", "").startswith("application/json"):
        preview = r.text[:240]
    else:
        preview = (r.text or "")[:240]
    print(preview)

    if r.status_code != 200:
        return 1

    tok = None
    try:
        tok = r.json().get("access_token")
    except Exception:
        pass
    if not tok:
        print("NO_TOKEN_IN_RESPONSE")
        return 1
    headers = {"Authorization": f"Bearer {tok}"}
    p = httpx.get(f"{base}/api/users/profile", headers=headers, timeout=15)
    print("profile", p.status_code)
    print((p.text or "")[:240])
    return 0 if p.status_code == 200 else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
