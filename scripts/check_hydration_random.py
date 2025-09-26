#!/usr/bin/env python3
"""SSR Hydration Random 검사 스크립트

규칙:
 1. .tsx / .ts / .jsx 파일 스캔 (node_modules, .next, dist, build, coverage, scripts 제외)
 2. 'Math.random(' 문자열 존재 시:
    - 파일 상단(첫 5개의 non-empty line) 중 'use client' 포함 → PASS (클라이언트 전용)
    - 해당 라인 또는 바로 위 라인에 '@allow-ssr-random' 주석 존재 → PASS (명시 허용)
    - 그 외 → VIOLATION 기록
 3. 위반 존재 시: 리스트 출력 후 종료 코드 1
 4. 옵션: --json 출력 (CI 파이프라인에서 파싱 용이)
"""
from __future__ import annotations
import sys, json, re, os
from pathlib import Path

ALLOW_TAG = '@allow-ssr-random'
CLIENT_DIRECTIVE = 'use client'
TARGET_EXT = {'.tsx', '.ts', '.jsx'}
EXCLUDE_DIRS = {'node_modules', '.next', 'dist', 'build', 'coverage', 'scripts/__pycache__'}

pattern = re.compile(r'Math\.random\(')

violations = []
root = Path(__file__).resolve().parent.parent  # repo root 기준 (scripts/ 상위)

for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.suffix not in TARGET_EXT:
        continue
    parts = set(p.name for p in path.parents)
    if any(d in parts for d in EXCLUDE_DIRS):
        continue
    rel = path.relative_to(root).as_posix()
    try:
        text = path.read_text(encoding='utf-8')
    except Exception as e:
        print(f'[warn] 읽기 실패 {rel}: {e}', file=sys.stderr)
        continue

    lines = text.splitlines()
    # 상위 5 non-empty line 내 use client 여부
    first_non_empty = [l.strip().strip('\ufeff') for l in lines if l.strip()][:5]
    is_client = any(l == CLIENT_DIRECTIVE or l.startswith(f'"{CLIENT_DIRECTIVE}"') or l.startswith(f"'{CLIENT_DIRECTIVE}'") for l in first_non_empty)

    for idx, line in enumerate(lines, start=1):
        if 'Math.random(' not in line:
            continue
        # 허용 태그 검사
        allow = False
        if ALLOW_TAG in line:
            allow = True
        elif idx > 1 and ALLOW_TAG in lines[idx-2]:  # 바로 위 라인
            allow = True
        if allow:
            continue
        if is_client:
            continue
        # 위반 기록
        snippet = line.strip()
        violations.append({
            'file': rel,
            'line': idx,
            'code': snippet
        })

if '--json' in sys.argv:
    print(json.dumps({'violations': violations}, ensure_ascii=False, indent=2))
else:
    if violations:
        print('✖ SSR 위험 Math.random 사용 감지:', file=sys.stderr)
        for v in violations:
            print(f"  - {v['file']}:{v['line']} :: {v['code']}")
    else:
        print('✔ SSR random 검사 통과 (위반 없음)')

if violations:
    sys.exit(1)
