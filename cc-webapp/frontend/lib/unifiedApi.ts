/*
 * Unified API Client
 * - 단일 BASE ORIGIN (NEXT_PUBLIC_API_ORIGIN)
 * - 모든 경로 인자는 '/api/' prefix 없이(ex: 'auth/login', 'events/123/claim')
 * - 자동 /api 접두사 부착
 * - 토큰 번들(storage: cc_auth_tokens via utils/tokenStorage.js)
 * - 401 -> refresh 1회 재시도, 실패 시 토큰 제거
 * - 재시도: 네트워크/일부 5xx/429 지수백오프 (기본 2회) 옵션화
 * - 개발 환경 로깅(console.groupCollapsed)
 */

import { getTokens, setTokens, clearTokens } from '../utils/tokenStorage';

// 간단 토큰 유무 확인 유틸
export function hasAccessToken(): boolean {
  try { return !!getTokens()?.access_token; } catch { return false; }
}

// Node 타입 미설치 환경 대비 간단 선언
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const process: any;

export interface UnifiedRequestOptions<T=any> {
  method?: string;
  body?: any;
  auth?: boolean;            // 기본 true (false면 Authorization 미부착)
  retry?: number;            // 재시도 횟수 (기본 2)
  backoffBaseMs?: number;    // 초기 backoff (기본 300)
  headers?: Record<string,string>;
  signal?: AbortSignal;
  parseJson?: boolean;       // false면 text 그대로 반환
  transform?: (data:any)=>T; // 결과 후처리
}

// 재시도 대상 상태코드: 네트워크 지연/과부하/일시적 경합(409 포함)
const DEFAULT_RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function resolveOrigin(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const penv: any = (typeof process !== 'undefined' ? (process as any).env : undefined);
  const envOrigin = penv?.NEXT_PUBLIC_API_ORIGIN;
  const envInternal = penv?.NEXT_PUBLIC_API_URL_INTERNAL;
  const isServer = typeof window === 'undefined';

  if (isServer) {
    if (envInternal && /^https?:\/\//.test(envInternal)) return envInternal.replace(/\/$/, '');
    if (envOrigin && /^https?:\/\//.test(envOrigin)) return envOrigin.replace(/\/$/, '');
    return 'http://backend:8000';
  }

  if (envOrigin && /^https?:\/\//.test(envOrigin)) return envOrigin.replace(/\/$/, '');
  const fallback = (window.location.port === '3000' || window.location.port === '3001') ? 'http://localhost:8000' : `${window.location.origin}`;
  if (!envOrigin) console.warn('[unifiedApi] NEXT_PUBLIC_API_ORIGIN 미설정 → fallback:', fallback);
  return fallback.replace(/\/$/, '');
}

const ORIGIN = resolveOrigin();
// 다른 모듈에서 재사용할 수 있도록 공개
export const API_ORIGIN = ORIGIN;

// 초기화 로그(실행 컨텍스트/빌드 ID 포함)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __env: any = (typeof process !== 'undefined' ? (process as any).env : undefined) || {};
const __build = __env.NEXT_PUBLIC_BUILD_ID || 'dev';
const __ctx = (typeof window === 'undefined') ? 'SSR' : 'CSR';
// 런타임 로컬스토리지 게이트(테스트 용도): localStorage.UNIFIEDAPI_LOG === '0' 이면 로그 억제
function __logGateEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('UNIFIEDAPI_LOG');
      if (ls === '0') return false;
    }
  } catch {}
  return (__env.NEXT_PUBLIC_UNIFIEDAPI_LOG ?? '1') !== '0';
}
if (__logGateEnabled()) {
  console.log(`[unifiedApi] 초기화 - ctx=${__ctx} build=${__build} origin=${ORIGIN}`);
}

// 안전/결정적 UUIDv4 생성 (SSR Math.random 제거)
// 1) 브라우저/Node 모두 지원 시 crypto.randomUUID 우선
// 2) 미지원 환경은 crypto.getRandomValues + RFC4122 포맷
// 3) 최후 fallback: 시간 + 증가 카운터 기반 (테스트/희귀 환경)
let __fallbackCounter = 0;
function __uuidv4(): string {
  // @ts-ignore
  const g: any = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : global);
  try {
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  } catch {}
  try {
    if (g.crypto?.getRandomValues) {
      const buf = new Uint8Array(16);
      g.crypto.getRandomValues(buf);
      // RFC4122 variant 처리
      buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
      buf[8] = (buf[8] & 0x3f) | 0x80; // variant
      const bth: string[] = [];
      for (let i = 0; i < 256; i++) bth[i] = (i + 0x100).toString(16).substring(1);
      const id = (
        bth[buf[0]] + bth[buf[1]] + bth[buf[2]] + bth[buf[3]] + '-' +
        bth[buf[4]] + bth[buf[5]] + '-' +
        bth[buf[6]] + bth[buf[7]] + '-' +
        bth[buf[8]] + bth[buf[9]] + '-' +
        bth[buf[10]] + bth[buf[11]] + bth[buf[12]] + bth[buf[13]] + bth[buf[14]] + bth[buf[15]]
      );
      return id;
    }
  } catch {}
  // 초저품질 fallback (Math.random 사용 금지 규칙 → 시간 & 증가값 조합)
  // 충돌 가능성 낮지만 멱등키 목적에 충분, 운영 환경에서는 crypto 경로 사용됨
  __fallbackCounter = (__fallbackCounter + 1) & 0xffff;
  const now = Date.now().toString(16);
  const cnt = __fallbackCounter.toString(16).padStart(4, '0');
  return `fallback-${now}-${cnt}`;
}

async function refreshOnce(): Promise<boolean> {
  try {
    const tokens = getTokens();
    if (!tokens?.refresh_token) return false;
    const res = await fetch(`${ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token })
    });
    if (!res.ok) return false;
    const data = await res.json().catch(()=>null);
    if (data?.access_token) {
      setTokens({ access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function apiCall<T=any>(path: string, opts: UnifiedRequestOptions<T> = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = true,
    retry = 2,
    backoffBaseMs = 300,
    headers = {},
    signal,
    parseJson = true,
    transform
  } = opts;

  if (path.startsWith('/')) path = path.slice(1); // normalize
  const url = `${ORIGIN}/api/${path}`;

  // 개발환경 전용 가드: 정수 ID가 필요한 경로에 비정수(me 등) 전달 감지 → URL 및 스택 로깅
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const __dev = (typeof process !== 'undefined' ? (process as any).env?.NODE_ENV : 'development') !== 'production';
    if (__dev) {
      const checks: Array<{ re: RegExp; name: string }> = [
        { re: /^admin\/users\/([^\/\?]+)(?:[\/\?]|$)/i, name: 'admin/users/:user_id' },
        { re: /^actions\/recent\/([^\/\?]+)(?:[\/\?]|$)/i, name: 'actions/recent/:user_id' },
        { re: /^rewards\/users\/([^\/\?]+)(?:[\/\?]|$)/i, name: 'rewards/users/:user_id' },
      ];
      for (const c of checks) {
        const m = path.match(c.re);
        if (m) {
          const seg = decodeURIComponent(m[1]);
          if (!/^\d+$/.test(seg)) {
            const err = new Error(`[unifiedApi][dev-guard] 비정수 user_id 세그먼트 감지: '${seg}' @ ${c.name}`);
            // URL/경로/스택을 경고 로그로 출력하여 호출 지점 추적
            // eslint-disable-next-line no-console
            console.warn('[unifiedApi][dev-guard] Non-numeric user_id detected', {
              matched: c.name,
              segment: seg,
              path,
              url,
            });
            // eslint-disable-next-line no-console
            if (err.stack) console.warn('[unifiedApi][stack]', err.stack.split('\n').slice(0, 8).join('\n'));
            break; // 한 경로만 경고
          }
        }
      }
    }
  } catch {
    // no-op: 가드 로깅 실패는 무시
  }

  let attempt = 0;
  let didRefresh = false;

  while (true) {
    const tokens = getTokens();
    const finalHeaders: Record<string,string> = {
      'Accept': 'application/json',
      ...headers,
    };
    // 무토큰 인증 상황 보정: auth=true인데 토큰이 없으면 네트워크 호출 자체를 생략
    // - GET: 조용히 null 반환 (호출 측에서 data null 처리)
    // - 쓰기 계열: 표준화 에러(code/status 포함) 던짐
    if (auth && !tokens?.access_token) {
      const upper = method.toUpperCase();
      const logEnabled = __logGateEnabled();
      if (upper === 'GET') {
        if (logEnabled) console.info(`[unifiedApi] skip GET (no token, silent)`);
        // @ts-ignore
        return (null) as T;
      }
      const unauthErr: any = new Error('UNAUTHENTICATED_NO_TOKEN');
      unauthErr.code = 'UNAUTHENTICATED_NO_TOKEN';
      unauthErr.status = 401;
      if (logEnabled) console.warn(`[unifiedApi] skip ${upper} (no token)`);
      throw unauthErr;
    }
    if (auth && tokens?.access_token) {
      finalHeaders['Authorization'] = `Bearer ${tokens.access_token}`;
    }
    if (body && !(body instanceof FormData)) {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    }

    // 멱등키 자동 주입: 쓰기 계열(POST/PUT/PATCH/DELETE)이고, 헤더에 없으면 생성
    const m = method.toUpperCase();
    if (m !== 'GET' && !finalHeaders['X-Idempotency-Key']) {
      finalHeaders['X-Idempotency-Key'] = __uuidv4();
    }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devLog = (typeof process !== 'undefined' ? (process as any).env?.NODE_ENV : 'development') !== 'production';
  const logEnabled = __logGateEnabled();
    if (devLog && attempt === 0 && logEnabled) {
      console.groupCollapsed(`[unifiedApi] ${method} ${url}`);
      console.log('opts', { method, body, auth, retry });
      console.log('headers', finalHeaders);
      console.groupEnd();
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
        signal,
        credentials: 'include',
      });
    } catch (networkErr:any) {
      if (attempt < retry) {
        const delay = backoffBaseMs * Math.pow(2, attempt);
        await new Promise(r=>setTimeout(r, delay));
        attempt++; continue;
      }
      throw networkErr;
    }

    if (response.status === 401 && auth && !didRefresh) {
      const refreshed = await refreshOnce();
      didRefresh = true;
      if (refreshed) { attempt++; continue; }
      clearTokens();
    }

    if (!response.ok) {
      if (attempt < retry && DEFAULT_RETRY_STATUS.has(response.status)) {
        const delay = backoffBaseMs * Math.pow(2, attempt);
        await new Promise(r=>setTimeout(r, delay));
        attempt++; continue;
      }
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      // 403 Not authenticated & 토큰 없음 → 이전 동작은 에러 throw였으나,
      // 상단 무토큰 가드가 선제 처리하므로 일반적으로 도달하지 않음. 방어적 처리만 유지.
      if (response.status === 403 && !getTokens()?.access_token) {
        if (logEnabled) console.warn(`[unifiedApi] 403 Not authenticated (no token)`, errText);
        const unauthErr: any = new Error('UNAUTHENTICATED_NO_TOKEN');
        unauthErr.code = 'UNAUTHENTICATED_NO_TOKEN';
        unauthErr.status = 403;
        throw unauthErr;
      }
      // 일일보상 중복(400) 메시지 한국어/영문 패턴 정규화
      if (response.status === 400 && /하루에 1번|already\s*claimed/i.test(errText)) {
        const normalized = '{"detail":"한 회원당 하루에 1번만 연속 보상을 받을 수 있습니다"}';
        if (logEnabled) console.warn(`[unifiedApi] 400 daily-claim duplicate`, errText);
        throw new Error(`already_claimed ${normalized}`);
      }
      if (logEnabled) console.error(`[unifiedApi] API 오류 - ${response.status} ${response.statusText}:`, errText);
      throw new Error(`[unifiedApi] ${response.status} ${errText}`);
    }

    if (!parseJson) {
      // @ts-ignore
      return (await response.text()) as T;
    }
    const json = await response.json().catch(()=>null);
    // @ts-ignore
    return transform ? transform(json) : json;
  }
}

// 편의 메서드
export const api = {
  get: <T=any>(p:string, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method: 'GET' }),
  post:<T=any>(p:string, body?:any, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'POST', body }),
  put: <T=any>(p:string, body?:any, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'PUT', body }),
  del: <T=any>(p:string, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'DELETE' }),
};

// 대시보드 전용 shorthand (미사용이면 제거 가능)
export const dashboardApi = {
  fetch: () => api.get('dashboard'),
};
