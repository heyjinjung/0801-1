# 파일 통합 보고서 (File Consolidation Report)

## 개요 (Overview)

이 문서는 Casino-Club F2P 프로젝트의 중복 파일을 통합한 내용을 요약합니다. 코드의 중복을 최소화하고 유지보수성을 향상시키기 위해 여러 "_simple" 접미사 파일들을 통합했습니다.

## 통합된 파일 (Consolidated Files)

### 인증 시스템 (Authentication System)

1. **auth.py와 auth_simple.py 통합**
   - `auth_simple.py`의 기능을 `auth.py`로 통합
   - 간소화된 인증 메커니즘 유지
   - 토큰 기반 인증 시스템으로 통일

2. **simple_auth.py 생성 (새로운 통합 파일)**
   - `auth_simple.py`와 `dependencies_simple.py`의 필수 기능을 통합
   - 인증 관련 핵심 함수를 단일 모듈로 제공
   - 모든 API 라우터에서 일관되게 사용 가능

### 설정 관리 (Configuration Management)

1. **config.py와 config_simple.py 통합**
   - 모든 설정을 `config.py`로 통합
   - 환경 변수 관리 방식 일원화
   - 애플리케이션 전반에서 일관된 설정 사용

### 의존성 관리 (Dependency Management)

1. **dependencies.py와 dependencies_simple.py 통합**
   - 인증 및 접근 제어 관련 의존성 통합
   - 중복 코드 제거
   - 로깅 기능 강화

### 데이터 모델 (Data Models)

1. **auth_models.py와 simple_auth_models.py 통합**
   - 사용자 관련 모델을 `auth_models.py`로 통합
   - 인증 관련 모델 스키마 통일
   - 불필요한 중복 모델 제거

## 유지된 "simple" 파일 (Retained "simple" files)

다음 파일들은 특수 목적으로 사용되므로 유지됩니다:

1. **simple_logging.py**
   - 간소화된 API 로깅 기능 제공
   - main.py에서 직접 참조

2. **simple_user_service.py**
   - 특화된 사용자 서비스 기능 제공
   - 일반 user_service.py와 구별되는 목적 제공

3. **admin_simple.py**
   - 간소화된 관리자 API 제공
   - 일반 admin.py와 별도 기능 제공

## 통합 효과 (Benefits of Consolidation)

1. **코드 중복 감소**
   - 유사한 기능의 코드 중복 제거
   - 유지보수성 향상

2. **일관성 증가**
   - 인증 및 권한 부여 방식의 일관성 확보
   - 설정 및 의존성 관리 일원화

3. **프로젝트 구조 개선**
   - 명확한 파일 구조 확립
   - API 라우팅 체계 개선

4. **API 응답 표준화**
   - 일관된 인증 메커니즘을 통한 API 응답 표준화
   - 오류 처리 일관성 향상

## 다음 단계 (Next Steps)

1. **API 엔드포인트 문서화**
   - 통합된 API 엔드포인트 문서 업데이트
   - Swagger/OpenAPI 스키마 갱신

2. **테스트 코드 갱신**
   - 통합된 파일을 참조하도록 테스트 코드 업데이트
   - 회귀 테스트 수행

3. **프론트엔드 연동 검증**
   - 통합된 인증 시스템과 프론트엔드 연동 검증
   - 오류 상황 테스트

---

## 2025-09-26 Stray Alembic Migration 디렉토리 분석

### 개요
표준 경로 `cc-webapp/backend/alembic/versions/` 외에 레거시 경로 `cc-webapp/backend/migrations/versions/` 내 단일 파일 존재를 확인. Alembic 설정(`alembic.ini` `script_location = alembic`)에 의해 실행 체인에 포함되지 않는 stray.

### Stray 파일 목록
| Path | SHA256 | Revision | Down Revision | 중복 기능 여부 |
|------|--------|----------|---------------|---------------|

### 권장 조치
## 2025-09-26 업데이트
- 삭제 완료: `cc-webapp/backend/migrations/versions/20250816_add_receipt_signature.py` (Alembic 체인 외 stray). 디렉토리(`backend/migrations`)는 빈 상태 유지 또는 후속 단계에서 제거 예정.
- 근거: Alembic 표준 경로는 `cc-webapp/backend/alembic/versions` 단일 유지. heads 단일 정책과 충돌 없음.

1. 본 보고서 커밋 후 `backend/migrations/` 디렉토리 삭제 (git history 보존).
2. CI 검사 추가: 비허용 마이그레이션 디렉토리(`backend/migrations`) 존재 시 실패.
3. `개선안2.md` 에 제거 및 SHA256 기록 유지.

### 삭제 체크리스트
- [x] 보고서 병합
- [x] Alembic heads 재확인 (단일 head 유지) — 직전 세션 기준
- [x] `cc-webapp/backend/migrations/versions/20250816_add_receipt_signature.py` 파일 삭제 (디렉토리는 추후 clean 단계에서 제거)
- [ ] 컨테이너 내부 `alembic upgrade head` 재실행 PASS 확인 (운영 시간 외 수행)
- [ ] CI drift guard(heads=1 + schema_drift_guard) 파이프라인 추가

> NOTE: 상위 디렉토리는 빈 상태 확인 후 정리 예정. 현재는 stray 파일만 제거 완료.

## 2025-09-26 Alembic 리비전 추가 기록 (Auth 스키마 정합화)

- 추가: `backend/alembic/versions/20250926_auth_schema_consolidation.py`
   - 목적: 수동 DDL 핫픽스를 Alembic으로 공식화 (user_sessions 컬럼/인덱스, token_blacklist 생성/인덱스, refresh_tokens 보강, invite_codes uses→used_count 정규화)
   - 특성: 방어적/idemponent. 기존 인덱스 중복 방지(열 집합 확인) 가드 포함.
- 추가: `backend/alembic/versions/20250926_merge_heads_auth_invite.py`
   - 목적: 병렬 head(`20250926_auth_schema_consolidation`, `c36e6cbf64d2`) 병합. 스키마 변경 없음.
- 검증: 컨테이너 내부 `alembic heads` 단일 head로 수렴 확인, `alembic upgrade head` 적용 로그 확인.

