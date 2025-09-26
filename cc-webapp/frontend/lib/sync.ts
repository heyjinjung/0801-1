/*
 * Sync utilities
 * - hydrateProfile: 서버 권위 프로필 로드
 * - EnsureHydrated: 최초 마운트 시 하이드레이트 트리거(렌더 차단 안함)
 * - RealtimeSyncProvider: WS 수신 → 프로필/상태 동기화 (필요 시 재하이드레이트)
 * - withReconcile: 쓰기 요청 후 재조정(hydrate)
 */
"use client";
import React, { useEffect } from "react";
import { api, API_ORIGIN, hasAccessToken } from "../lib/unifiedApi";
import { useGlobalStore, setProfile, setHydrated, applyReward } from "../store/globalStore";

export async function hydrateProfile(dispatch: ReturnType<typeof useGlobalStore>["dispatch"]) {
  try {
    // 로그인 전에는 호출을 생략해 401/403 콘솔 소음을 방지
    if (!hasAccessToken()) {
      return;
    }
    // 최초 진입 병렬 hydrate:
  // - /auth/me (필수)
    // - /users/balance (권위 잔액)
    // - /games/stats/me (통계 – 전역 저장은 아직 없으나, 워밍업/요건 충족용 호출)
    const [profileRes, balanceRes] = await Promise.all([
      api.get("auth/me"),
      api.get("users/balance").catch(() => null),
      // 통계는 실패/401 무시 (호출만 수행)
      api.get("games/stats/me").catch(() => null),
    ]);

    const data = profileRes as any;
    // balance 응답에서 가능한 키를 우선적으로 사용
    const balAny = balanceRes as any;
    const goldFromBalanceRaw = balAny?.gold ?? balAny?.gold_balance ?? balAny?.cyber_token_balance ?? balAny?.balance;
    const goldFromBalance = Number.isFinite(Number(goldFromBalanceRaw)) ? Number(goldFromBalanceRaw) : undefined;

    const mapped = {
      id: data?.id ?? data?.user_id ?? "unknown",
      nickname: data?.nickname ?? data?.name ?? "",
      goldBalance: goldFromBalance ?? Number(data?.gold ?? data?.gold_balance ?? 0),
      gemsBalance: Number(data?.gems ?? data?.gems_balance ?? 0),
      level: data?.level ?? data?.battlepass_level ?? undefined,
      xp: data?.xp ?? undefined,
      updatedAt: new Date().toISOString(),
      ...data,
    } as any;
    setProfile(dispatch, mapped);
  } catch (e) {
    // 401 등은 무시(로그인 전/토큰 만료 시점)
    // eslint-disable-next-line no-console
    console.warn("[sync] hydrateProfile 실패", e);
  } finally {
    setHydrated(dispatch, true);
  }
}

export function EnsureHydrated(props: { children?: React.ReactNode }) {
  const { dispatch } = useGlobalStore();
  useEffect(() => {
    // 최초 1회 하이드레이트 (토큰 없으면 실패하지만 harmless)
    hydrateProfile(dispatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return React.createElement(React.Fragment, null, props.children ?? null);
}

// 간단 WS 프로바이더 (프로필/구매/리워드 이벤트 수신)
export function RealtimeSyncProvider(props: { children?: React.ReactNode }) {
  const { dispatch } = useGlobalStore();
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let closed = false;
    let lastHydrate = 0;
    const minInterval = 600; // ms, 잦은 재하이드레이트 방지

    function toWs(origin: string) {
      return origin.replace(/^http/i, "ws");
    }

    function safeHydrate() {
      const now = Date.now();
      if (now - lastHydrate < minInterval) return;
      lastHydrate = now;
      hydrateProfile(dispatch);
    }

    try {
      const url = toWs(API_ORIGIN) + "/ws/updates";
      ws = new WebSocket(url);
      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log("[sync] WS connected", url);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const type = msg?.type;
          switch (type) {
            case "profile_update":
            case "purchase_update":
            case "reward_granted": {
              // 빠른 체감: 보상 즉시 적용 후 재하이드레이트로 정합화
              try {
                const data = msg?.data || {};
                const reward = data?.reward_data || data || {};
                const gold = Number(reward?.awarded_gold ?? reward?.gold ?? reward?.amount ?? 0);
                if (Number.isFinite(gold) && gold !== 0) {
                  applyReward(dispatch, { gold });
                }
              } catch { /* noop */ }

              // 유형별 토스트 발행 (ToastProvider가 중복 1.5s 억제)
              try {
                if (typeof window !== "undefined") {
                  if (type === "reward_granted") {
                    const g = (() => {
                      try {
                        const d = msg?.data?.reward_data ?? msg?.data ?? {};
                        const val = Number(d?.awarded_gold ?? d?.gold ?? d?.amount ?? 0);
                        return Number.isFinite(val) ? val : 0;
                      } catch { return 0; }
                    })();
                    const text = g !== 0 ? `보상 지급: ${g > 0 ? "+" : ""}${g}G` : "보상 지급";
                    window.dispatchEvent(new CustomEvent("app:notification", { detail: { type: "reward", payload: text } }));
                  } else if (type === "purchase_update") {
                    const st = (msg?.data?.status || "pending").toString();
                    const product = msg?.data?.product_id ? `상품 ${msg?.data?.product_id}` : "구매";
                    let t = "shop"; let text = `${product} 결제가 진행 중입니다...`;
                    if (st === "success") { t = "success"; text = `${product} 결제가 완료되었습니다.`; }
                    else if (st === "failed") { t = "error"; text = `${product} 결제가 실패했습니다.`; }
                    else if (st === "idempotent_reuse") { t = "system"; text = `${product} 결제가 이미 처리되었습니다.`; }
                    window.dispatchEvent(new CustomEvent("app:notification", { detail: { type: t, payload: text } }));
                  } else if (type === "profile_update") {
                    window.dispatchEvent(new CustomEvent("app:notification", { detail: { type: "system", payload: "프로필이 갱신되었습니다." } }));
                  }
                }
              } catch { /* noop */ }
              safeHydrate();
              break;
            }
            case "game_update":
              safeHydrate();
              break;
            case "catalog_updated":
            case "package_upserted":
              try {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new Event("cc:catalog.invalidate"));
                }
              } catch { /* noop */ }
              break;
            default:
              break;
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (closed) return;
        // eslint-disable-next-line no-console
        console.log("[sync] WS closed – retry soon");
        setTimeout(() => {
          if (!closed) {
            // 재연결
            hydrateProfile(dispatch);
          }
        }, 1500);
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[sync] WS init failed", e);
    }

    return () => {
      closed = true;
      try { ws?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return React.createElement(React.Fragment, null, props.children ?? null);
}

// 간단 UUIDv4 (crypto 기반, Math.random 제거)
function uuidv4(): string {
  // @ts-ignore
  const g: any = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : global);
  try { if (g.crypto?.randomUUID) return g.crypto.randomUUID(); } catch {}
  try {
    if (g.crypto?.getRandomValues) {
      const buf = new Uint8Array(16);
      g.crypto.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40; // version
      buf[8] = (buf[8] & 0x3f) | 0x80; // variant
      const bth: string[] = [];
      for (let i = 0; i < 256; i++) bth[i] = (i + 0x100).toString(16).substring(1);
      return (
        bth[buf[0]] + bth[buf[1]] + bth[buf[2]] + bth[buf[3]] + '-' +
        bth[buf[4]] + bth[buf[5]] + '-' + bth[buf[6]] + bth[buf[7]] + '-' +
        bth[buf[8]] + bth[buf[9]] + '-' +
        bth[buf[10]] + bth[buf[11]] + bth[buf[12]] + bth[buf[13]] + bth[buf[14]] + bth[buf[15]]
      );
    }
  } catch {}
  // 초저품질 fallback – 시간+카운터(최후 수단, Math.random 금지)
  const now = Date.now().toString(16);
  const cnt = (uuidv4 as any).__c = (((uuidv4 as any).__c || 0) + 1) & 0xffff;
  return `fallback-${now}-${cnt.toString(16).padStart(4, '0')}`;
}

type ReconcileOptions = { reconcile?: boolean };

export async function withReconcile<T>(
  dispatch: ReturnType<typeof useGlobalStore>["dispatch"],
  serverCall: (idemKey: string) => Promise<T>,
  options: ReconcileOptions = { reconcile: true }
): Promise<T> {
  const idemKey = uuidv4();
  let caught: any = null;
  let result!: T;
  try {
    result = await serverCall(idemKey);
    return result;
  } catch (e:any) {
    caught = e;
    throw e;
  } finally {
    if (options.reconcile !== false) {
      await hydrateProfile(dispatch);
    }
  }
}

export function useWithReconcile() {
  const { dispatch } = useGlobalStore();
  return React.useMemo(() => {
    return async function run<T>(serverCall: (idemKey: string) => Promise<T>, opts?: ReconcileOptions) {
      return withReconcile<T>(dispatch, serverCall, opts);
    };
  }, [dispatch]);
}

// 멱등키 부여 유틸: 서버콜에 헤더/본문 중 하나로 키를 전달할 때 사용
export async function withIdem<T>(
  fn: (idemKey: string) => Promise<T>,
  explicitKey?: string
): Promise<T> {
  const key = explicitKey || uuidv4();
  return fn(key);
}
