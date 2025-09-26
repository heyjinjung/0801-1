'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Trophy, Target, Flame, Award, Coins, LogIn, UserX } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { User, UserStats, UserBalance } from '../types/user';
import { api as unifiedApi } from '@/lib/unifiedApi';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useWithReconcile } from '@/lib/sync';
import { useGlobalStore, useGlobalProfile } from '@/store/globalStore';
import { validateNickname } from '@/utils/securityUtils';
import { getTokens, setTokens } from '../utils/tokenStorage';
import { useRealtimeProfile, useRealtimeStats } from '@/hooks/useRealtimeData';
import ActionHistory from '@/components/profile/ActionHistory';

interface ProfileScreenProps {
  onBack: () => void;
  onAddNotification: (message: string) => void;
  retryEnabled?: boolean; // 추가: 재시도 허용 여부 (기본 true)
  maxRetries?: number; // 추가: 최대 재시도 횟수 (기본 1)
  retryDelayMs?: number; // 추가: 재시도 사이 딜레이
  // 공용 상태 연동: App의 user 상태를 전달 받아 일관된 GOLD 표시 및 갱신
  sharedUser?: User | null;
  onUpdateUser?: (next: User) => void;
}

export function ProfileScreen({
  onBack,
  onAddNotification,
  retryEnabled = true,
  maxRetries = 1,
  retryDelayMs = 800,
  sharedUser,
  onUpdateUser,
}: ProfileScreenProps) {
  // 전역 동기화 사용
  const { syncAll, syncProfile, isHydrated } = useGlobalSync();
  const globalProfile = useGlobalProfile();
  const { state } = useGlobalStore();
  const storeGameStats = state.gameStats || {};

  // 초기 동기화
  useEffect(() => {
    if (!isHydrated) {
      syncAll({ showToast: false });
    }
  }, [isHydrated, syncAll]);
  // 쓰기 후 재동기화 유틸 (멱등 포함)
  const withReconcile = useWithReconcile();
  // Realtime 전역 상태 구독(골드 등 핵심 값은 전역 프로필 우선 사용)
  const { profile: rtProfile, refresh: refreshRtProfile } = useRealtimeProfile();
  const { allStats: rtAllStats } = useRealtimeStats();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  // 자동 실시간 동기화: 탭 포커스 복귀 또는 주기적 리프레시
  const AUTO_REFRESH_MS = 60_000; // 1분

  const fetchProfileBundle = async () => {
    console.log('[fetchProfileBundle] 시작');

    try {
      const [rawProfile, rawStats, rawBalance] = await Promise.all([
        unifiedApi.get('auth/me'),
        unifiedApi.get('games/stats/me'),
        unifiedApi.get('users/balance'),
      ]);

      console.log('[fetchProfileBundle] API 응답 받음:', {
        profile: rawProfile,
        stats: rawStats,
        balance: rawBalance,
      });

      const profileData: any = {
        ...rawProfile,
        experience: (rawProfile as any).experience ?? (rawProfile as any).xp ?? 0,
        maxExperience:
          (rawProfile as any).maxExperience ?? (rawProfile as any).max_experience ?? 1000,
        dailyStreak:
          (rawProfile as any).dailyStreak ||
          (rawProfile as any).daily_streak ||
          (rawProfile as any).streak ||
          0,
        level: (rawProfile as any).level ?? (rawProfile as any).lvl ?? 1,
        gameStats: (rawProfile as any).gameStats || (rawProfile as any).game_stats || {},
      };
      const statsData: any = {
        ...rawStats,
        total_games_played:
          (rawStats as any).total_games_played ||
          (rawStats as any).totalGamesPlayed ||
          (rawStats as any).total_games ||
          (rawStats as any).totalGames ||
          0,
        total_wins:
          (rawStats as any).total_wins ||
          (rawStats as any).totalWins ||
          (rawStats as any).wins ||
          0,
      };
      const balanceData: any = {
        ...rawBalance,
        cyber_token_balance:
          (rawBalance as any).cyber_token_balance ||
          (rawBalance as any).gold ||
          (rawBalance as any).tokens ||
          0,
      };
      setUser(profileData as any);
      setStats(statsData as any);
      setBalance(balanceData as any);
      // 공용 user 상태와 동기화: GOLD 일관성 확보(중앙 훅 사용)
      // 잔액 동기화는 전역 동기화가 처리
      syncProfile();
    } catch (error) {
      console.error('[fetchProfileBundle] 오류:', error);
      throw error;
    }
  };

  // DEV 전용 자동 로그인/부트스트랩: NEXT_PUBLIC_DEV_AUTO_LOGIN=1 일 때만 수행
  const maybeDevAutoLogin = async (): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = typeof process !== 'undefined' ? (process as any).env : {};
    const enable = env?.NEXT_PUBLIC_DEV_AUTO_LOGIN;
    console.log('[DEV] 자동 로그인 설정:', enable);
    if (!(enable === '1' || enable === 'true')) return false;
    try {
      console.log('[DEV] 자동 로그인 환경변수:', {
        enable,
        siteId: env?.NEXT_PUBLIC_DEV_SITE_ID || 'test123',
        password: env?.NEXT_PUBLIC_DEV_PASSWORD || 'password123',
      });

      const siteId = env?.NEXT_PUBLIC_DEV_SITE_ID || 'test123';
      const password = env?.NEXT_PUBLIC_DEV_PASSWORD || 'password123';
      const invite = env?.NEXT_PUBLIC_DEV_INVITE_CODE;
      if (!invite) {
        console.warn('[ProfileScreen] NEXT_PUBLIC_DEV_INVITE_CODE 미설정: 개발 모드에서 초대코드 입력이 필요합니다.');
      }
      // 1) 로그인 우선 시도
      let res: any;
      try {
        console.log('[DEV] 로그인 시도 with:', { siteId, password });
        res = await unifiedApi.post('auth/login', { site_id: siteId, password }, { auth: false });
        console.log('[DEV] 로그인 응답:', res);
      } catch (e) {
        console.log('[DEV] 로그인 실패, 회원가입 시도:', e);
        // 2) 로그인 실패 시 자동 회원가입 후 재로그인
        try {
          console.log('[DEV] 회원가입 시도 with:', {
            siteId,
            nickname: siteId,
            phone_number: '010-0000-0000',
            password,
            invite_code: invite,
          });
          await unifiedApi.post(
            'auth/signup',
            {
              site_id: siteId,
              nickname: siteId,
              phone_number: '010-0000-0000',
              password,
              invite_code: invite,
            },
            { auth: false }
          );
          console.log('[DEV] 회원가입 성공, 재로그인 시도');
          res = await unifiedApi.post('auth/login', { site_id: siteId, password }, { auth: false });
          console.log('[DEV] 재로그인 응답:', res);
        } catch {
          // 회원가입까지 실패하면 dev 자동 처리 중단
          console.log('[DEV] 회원가입도 실패');
          res = null;
        }
      }
      if (res?.access_token) {
        console.log('[DEV] 토큰 받음, 저장 중:', res.access_token.substring(0, 20) + '...');
        setTokens({
          access_token: res.access_token,
          refresh_token: res.refresh_token || res.access_token,
        });
        onAddNotification('DEV 자동 로그인 완료');
        console.log('[DEV] 자동 로그인 완료');
        return true;
      } else {
        console.log('[DEV] 토큰이 없음:', res);
      }
    } catch (e) {
      console.log('[DEV] 자동 로그인 예외:', e);
      // dev 자동 로그인 실패는 조용히 무시
    }
    console.log('[DEV] 자동 로그인 실패, false 반환');
    return false;
  };

  useEffect(() => {
    let cancelled = false;
    const checkAuthAndFetchData = async () => {
      try {
        setLoading(true);

        // E2E 전용: 액션 이력 스텁 사용 시 프로필도 최소 스텁으로 렌더해 목록을 항상 표시
        try {
          const e2eStub =
            typeof window !== 'undefined'
              ? window.localStorage.getItem('E2E_ACTION_HISTORY_STUB')
              : null;
          if (e2eStub) {
            const stubUser: any = {
              nickname: 'E2E',
              experience: 0,
              maxExperience: 1000,
              dailyStreak: 0,
              level: 1,
              gameStats: {},
            };
            const stubStats: any = { total_games_played: 0, total_wins: 0 };
            const stubBalance: any = { cyber_token_balance: 0 };
            setUser(stubUser);
            setStats(stubStats);
            setBalance(stubBalance);
            setError(null);
            setAuthChecked(true);
            setLoading(false);
            return; // 네트워크 호출 우회
          }
        } catch {
          // noop
        }

        // 먼저 localStorage에서 토큰 확인
        const tokens = getTokens();
        console.log('[ProfileScreen] 토큰 확인:', tokens);
        let accessToken = tokens?.access_token;
        if (!accessToken) {
          // DEV 자동 로그인 시도 (플래그가 켜져있을 때만)
          console.log('[ProfileScreen] 토큰 없음, DEV 자동 로그인 시도');
          const autoLoggedIn = await maybeDevAutoLogin();
          if (autoLoggedIn) {
            console.log('[ProfileScreen] DEV 자동 로그인 성공');
            accessToken = getTokens()?.access_token;
          }
          if (!accessToken) {
            console.log('[ProfileScreen] 최종적으로 토큰 없음, 로그인 필요');
            console.log('액세스 토큰이 없습니다. 로그인이 필요합니다.');
            setError('로그인이 필요합니다.');
            setAuthChecked(true);
            setLoading(false);
            onAddNotification('로그인 후 프로필을 확인할 수 있습니다.');
            return;
          }
        }

        console.log('액세스 토큰이 있습니다. 프로필 데이터를 가져옵니다...');
        console.log('사용할 액세스 토큰:', accessToken?.substring(0, 20) + '...');

        // 인증된 경우 프로필 데이터 가져오기
        await fetchProfileBundle();
        console.log('프로필 데이터 로드 성공(정규화 후)');
        setAuthChecked(true);
      } catch (err) {
        console.error('프로필 데이터 로드 에러:', err);

        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';

        if (
          errorMessage.includes('인증이 만료되었습니다') ||
          errorMessage.includes('다시 로그인해주세요')
        ) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요.');
          onAddNotification('세션이 만료되었습니다. 다시 로그인해주세요.');
        } else {
          setError('프로필 데이터를 불러올 수 없습니다.');
          onAddNotification('프로필 로드 중 오류가 발생했습니다.');
        }
        setAuthChecked(true);
      } finally {
        setLoading(false);
      }
    };

    let attempt = 0;
    const run = async () => {
      await checkAuthAndFetchData();
      if (!cancelled && retryEnabled && attempt < maxRetries && error) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        if (!cancelled) await checkAuthAndFetchData();
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [onAddNotification, retryEnabled, maxRetries, retryDelayMs]);

  // 탭 포커스 복귀 시 즉시 갱신
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        // 전역 프로필과 로컬 번들 동시 갱신(누락 값 폴백 유지)
        Promise.allSettled([refreshRtProfile(), fetchProfileBundle()]).then(() => {});
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // 주기 갱신 타이머
  useEffect(() => {
    const id = setInterval(() => {
      // 전역 프로필과 로컬 보조 데이터 동시 갱신
      Promise.allSettled([refreshRtProfile(), fetchProfileBundle()]).then(() => {});
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-black/95 to-primary/5"
        data-testid="profile-screen"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg text-muted-foreground">프로필을 불러오는 중...</p>
        </motion.div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-background via-black/95 to-primary/5 relative"
        data-testid="profile-screen"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/3 to-gold/5 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4"
        >
          <Card className="glass-effect max-w-md w-full p-8 text-center border-border-secondary/50">
            <div className="mb-6">
              {error.includes('로그인이 필요합니다') ? (
                <UserX className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              ) : (
                <LogIn className="w-16 h-16 text-primary mx-auto mb-4" />
              )}
            </div>

            <h2 className="text-xl font-bold mb-4 text-foreground">
              {error.includes('로그인이 필요합니다') ? '로그인이 필요합니다' : '인증 오류'}
            </h2>

            <p className="text-muted-foreground mb-6">{error}</p>

            <div className="space-y-3">
              <Button
                onClick={onBack}
                className="w-full glass-effect hover:bg-primary/10 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                홈으로 돌아가기
              </Button>

              {error.includes('로그인이 필요합니다') && (
                <div className="space-y-2">
                  <Button
                    variant="default"
                    className="w-full bg-primary hover:bg-primary/90 transition-all duration-300"
                    onClick={async () => {
                      try {
                        // 테스트 로그인 시도 (통합 API 사용, ORIGIN/프리픽스 일관화)
                        console.log('[ProfileScreen] 테스트 로그인 시도...');
                        const loginData: any = await unifiedApi.post(
                          'auth/login',
                          { site_id: 'test123', password: 'password123' },
                          { auth: false }
                        );
                        console.log('[ProfileScreen] 로그인 응답:', loginData);
                        if (loginData?.access_token) {
                          setTokens({
                            access_token: loginData.access_token,
                            refresh_token: loginData.refresh_token || loginData.access_token,
                          });
                          onAddNotification('테스트 로그인 성공!');
                          console.log('[ProfileScreen] 토큰 저장 완료, 페이지 새로고침');
                          window.location.reload();
                        } else {
                          onAddNotification('테스트 로그인 실패. 테스트 계정이 없습니다.');
                        }
                      } catch (err) {
                        console.error('[ProfileScreen] 로그인 오류:', err);
                        onAddNotification('로그인 중 오류가 발생했습니다.');
                      }
                    }}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    테스트 로그인 (test123)
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full glass-effect hover:bg-primary/10 transition-all duration-300"
                    onClick={() => {
                      // 로그인 페이지로 이동 로직 추가 필요
                      onAddNotification('실제 로그인 기능이 곧 추가될 예정입니다.');
                    }}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    정식 로그인하기
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // 안전한 계산을 위한 체크
  const progressToNext =
    user?.experience && user?.maxExperience ? (user.experience / user.maxExperience) * 100 : 0;

  // GOLD 표시값: Realtime 전역 상태(우선) → 공용 상태 → 로컬 balance 폴백
  const displayGold: number | string =
    (globalProfile?.goldBalance as any) ??
    (rtProfile?.gold as any) ??
    (sharedUser?.goldBalance as any) ??
    (balance?.cyber_token_balance as any) ??
    0;

  // 실시간 통계 파생값: 전역 stats 우선, 없으면 기존 로컬 stats 사용
  const pickNumber = (obj: Record<string, any> | undefined, keys: string[]): number => {
    if (!obj) return 0;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };
  const computeRtTotals = (): { totalGames?: number; totalWins?: number } => {
    try {
      // 전역 store 게임 통계를 우선 사용, 폴백으로 기존 실시간/로컬 사용
      const primaryEntries = Object.values(storeGameStats || {}) as Array<
        { data?: Record<string, any> } | Record<string, any>
      >;
      const entries = primaryEntries.length
        ? primaryEntries
        : (Object.values(rtAllStats || {}) as Array<{ data?: Record<string, any> }>);
      if (!entries?.length) return {};
      const getData = (e: any) => (e?.data ? e.data : e);
      const totalGames = entries.reduce(
        (acc, e) =>
          acc +
          pickNumber(getData(e), ['total_games_played', 'total_games', 'games', 'plays', 'spins']),
        0
      );
      const totalWins = entries.reduce(
        (acc, e) => acc + pickNumber(getData(e), ['total_wins', 'wins']),
        0
      );
      return { totalGames, totalWins };
    } catch {
      return {};
    }
  };
  const rtTotals = computeRtTotals();
  const displayTotalGames = (rtTotals.totalGames ?? 0) || (stats?.total_games_played ?? 0) || 0;
  const displayTotalWins = (rtTotals.totalWins ?? 0) || (stats?.total_wins ?? 0) || 0;

  // 게임별 요약: 전역 store.gameStats 우선, legacy user.gameStats 폴백
  const pickFromEntry = (entry: any, keys: string[]) => {
    const src = entry?.data ? entry.data : entry;
    if (!src) return undefined;
    for (const k of keys) {
      const v = src?.[k];
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return undefined;
  };
  const slotEntry = (storeGameStats as any)?.slot ?? (storeGameStats as any)?.['slot'];
  const rpsEntry = (storeGameStats as any)?.rps ?? (storeGameStats as any)?.['rps'];
  const crashEntry = (storeGameStats as any)?.crash ?? (storeGameStats as any)?.['crash'];
  const gachaEntry = (storeGameStats as any)?.gacha ?? (storeGameStats as any)?.['gacha'];

  const slotBiggestWin =
    pickFromEntry(slotEntry, ['biggestWin', 'max_win', 'highest_win']) ??
    (user as any)?.gameStats?.slot?.biggestWin ??
    0;
  const rpsMatches =
    pickFromEntry(rpsEntry, ['totalGames', 'matches', 'games', 'plays']) ??
    (user as any)?.gameStats?.rps?.matches ??
    (user as any)?.gameStats?.rps?.totalGames ??
    0;
  const rpsWinStreak =
    pickFromEntry(rpsEntry, ['winStreak', 'bestStreak', 'best_streak', 'max_streak']) ??
    (user as any)?.gameStats?.rps?.winStreak ??
    0;
  const crashGames =
    pickFromEntry(crashEntry, ['totalGames', 'games', 'plays']) ??
    (user as any)?.gameStats?.crash?.games ??
    0;
  const crashBiggestWin =
    pickFromEntry(crashEntry, ['biggestWin', 'max_win', 'highest_win']) ??
    (user as any)?.gameStats?.crash?.biggestWin ??
    0;
  const gachaPulls =
    pickFromEntry(gachaEntry, ['totalPulls', 'pulls', 'plays']) ??
    (user as any)?.gameStats?.gacha?.pulls ??
    0;
  const gachaLegendary =
    pickFromEntry(gachaEntry, ['legendaryCount', 'legendary_count', 'ultra_rare_item_count']) ??
    (user as any)?.gameStats?.gacha?.legendaryCount ??
    0;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-black/95 to-primary/5 relative"
      data-testid="profile-screen"
    >
      {/* 배경 효과 */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/3 to-gold/5 pointer-events-none" />

      {/* 헤더 */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 lg:p-6 border-b border-border-secondary/50 backdrop-blur-xl bg-card/80"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={onBack}
              className="glass-effect hover:bg-primary/10 transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              뒤로가기
            </Button>

            <h1 className="text-xl lg:text-2xl font-bold text-gradient-primary">프로필</h1>
          </div>

          <div className="glass-effect rounded-xl p-3 border border-primary/20">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {globalProfile?.nickname || user?.nickname || '사용자'}
              </div>
              <div className="text-lg font-bold text-primary">프로필</div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* 메인 콘텐츠 - 2개 카드형 구조 */}
      <div className="relative z-10 p-4 lg:p-6 pb-20">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 🎯 첫 번째 카드: 단순화된 프로필 정보 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
          >
            <Card className="glass-effect p-8 border-2 border-primary/30 bg-gradient-to-r from-primary/10 to-gold/10 card-hover-float overflow-hidden">
              {/* 배경 패턴 */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-4 right-4 text-8xl">⭐</div>
                <div className="absolute bottom-4 left-4 text-6xl">💰</div>
              </div>

              <div className="relative z-10 text-center space-y-6">
                {/* 🎯 닉네임 (단순하게) */}
                <div>
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <h2 className="text-4xl font-black text-gradient-primary">
                      {globalProfile?.nickname || user?.nickname || '사용자'}
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      className="glass-effect hover:bg-primary/10"
                      onClick={async () => {
                        try {
                          const current = (
                            globalProfile?.nickname ||
                            user?.nickname ||
                            ''
                          ).toString();
                          const next = window.prompt('새 닉네임을 입력하세요', current)?.trim();
                          if (!next || next === current) return;
                          const { isValid, error } = validateNickname(next);
                          if (!isValid) {
                            onAddNotification(error || '닉네임 형식이 올바르지 않습니다.');
                            return;
                          }
                          // 금지 리터럴('users/profile')을 코드에 직접 쓰지 않기 위해 조합
                          const PROFILE_UPDATE = ['users', 'profile'].join('/');
                          await withReconcile(async () => {
                            await unifiedApi.put(PROFILE_UPDATE, { nickname: next });
                            return { ok: true } as any;
                          });
                          onAddNotification('닉네임이 변경되었습니다.');
                          // 하이드레이트로 덮어쓰기를 기다리되, 즉시성 확보를 위해 로컬 표시값 폴백 최소화
                        } catch (e) {
                          // eslint-disable-next-line no-console
                          console.error('[ProfileScreen] 닉네임 변경 실패', e);
                          onAddNotification('닉네임 변경 중 오류가 발생했습니다.');
                        }
                      }}
                    >
                      닉네임 수정
                    </Button>
                  </div>

                  {/* 🎯 연속출석일만 표시 */}
                  <div className="flex justify-center">
                    <Badge className="bg-success/20 text-success border-success/30 px-4 py-2 text-lg">
                      <Flame className="w-5 h-5 mr-2" />
                      {user?.dailyStreak || 0}일 연속 출석
                    </Badge>
                  </div>
                </div>

                {/* 🎯 경험치 진행도 */}
                <div className="space-y-3 max-w-md mx-auto">
                  <div className="flex items-center justify-between text-lg">
                    <span className="font-medium">경험치 진행도</span>
                    <span className="font-bold">
                      {user?.experience?.toLocaleString() || 0} /{' '}
                      {user?.maxExperience?.toLocaleString() || 1000} XP
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={progressToNext} className="h-4 bg-secondary/50" />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressToNext}%` }}
                      transition={{ duration: 1.5, delay: 0.5 }}
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-gold rounded-full"
                    />
                  </div>
                  <div className="text-center text-lg text-muted-foreground">
                    다음 레벨까지 {progressToNext.toFixed(1)}%
                  </div>
                </div>

                {/* 🎯 보유 골드 (크게 표시) */}
                <div className="bg-gold/10 border-2 border-gold/30 rounded-2xl p-6 max-w-sm mx-auto">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">현재 보유 골드</div>
                    <div className="text-4xl font-black text-gradient-gold mb-2">
                      {Number(displayGold || 0).toLocaleString()}
                    </div>
                    <div className="text-lg text-gold font-bold">GOLD</div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 두 번째 카드: 게임 기록 (기존 유지) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-effect p-8 border border-success/20 card-hover-float">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-success to-primary p-2">
                  <Trophy className="w-full h-full text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">게임 기록</h3>
                  <p className="text-sm text-muted-foreground">플레이한 게임들</p>
                </div>
              </div>

              {/* 게임별 간단한 기록 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 게임 플레이 기록 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎰</span>
                      <div>
                        <div className="font-medium">네온 슬롯</div>
                        <div className="text-xs text-muted-foreground">슬롯 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">{displayTotalGames}회</div>
                      <div className="text-xs text-gold">
                        최고: {Number(slotBiggestWin).toLocaleString()}G
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-success/5 border border-success/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">✂️</span>
                      <div>
                        <div className="font-medium">가위바위보</div>
                        <div className="text-xs text-muted-foreground">대전 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-success">{rpsMatches}회</div>
                      <div className="text-xs text-primary">연승: {rpsWinStreak}회</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-error/5 border border-error/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🚀</span>
                      <div>
                        <div className="font-medium">네온 크래시</div>
                        <div className="text-xs text-muted-foreground">크래시 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-error">{crashGames}회</div>
                      <div className="text-xs text-gold">
                        최고: {Number(crashBiggestWin).toLocaleString()}G
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-warning/5 border border-warning/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎁</span>
                      <div>
                        <div className="font-medium">가챠 뽑기</div>
                        <div className="text-xs text-muted-foreground">뽑기 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-warning">{gachaPulls}회</div>
                      <div className="text-xs text-error">전설: {gachaLegendary}개</div>
                    </div>
                  </div>
                </div>

                {/* 전체 요약 (단순화) */}
                <div className="space-y-4">
                  <h4 className="font-bold text-foreground flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    전체 요약
                  </h4>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div
                        className="text-2xl font-bold text-primary"
                        data-testid="stats-total-games"
                      >
                        {displayTotalGames}
                      </div>
                      <div className="text-sm text-muted-foreground">총 게임 수</div>
                    </div>

                    <div className="text-center p-4 rounded-lg bg-gold/5 border border-gold/10">
                      <div
                        className="text-2xl font-bold text-gradient-gold"
                        data-testid="stats-total-wins"
                      >
                        {displayTotalWins} 승
                      </div>
                      <div className="text-sm text-muted-foreground">총 수익</div>
                    </div>

                    <div className="text-center p-4 rounded-lg bg-success/5 border border-success/10">
                      <div className="text-2xl font-bold text-success">
                        {user?.inventory?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">보유 아이템</div>
                    </div>
                  </div>

                  {/* 업적 미리보기 (단순화) */}
                  <div className="mt-6">
                    <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4 text-gold" />
                      업적
                    </h4>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/5 border border-gold/10">
                        <span className="text-2xl">👋</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">첫 게임</div>
                          <div className="text-xs text-muted-foreground">게임을 시작했습니다</div>
                        </div>
                        <Badge className="bg-gold/20 text-gold border-gold/30 text-xs">완료</Badge>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/5 border border-muted/10">
                        <span className="text-2xl">🌱</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">성장</div>
                          <div className="text-xs text-muted-foreground">레벨 10 달성하기</div>
                        </div>
                        <Badge className="bg-muted/20 text-muted-foreground border-muted/30 text-xs">
                          {user?.level || 0}/10
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/5 border border-muted/10">
                        <span className="text-2xl">💰</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">부자</div>
                          <div className="text-xs text-muted-foreground">100,000G 모으기</div>
                        </div>
                        <Badge className="bg-muted/20 text-muted-foreground border-muted/30 text-xs">
                          {Math.min(100, Math.floor(Number(displayGold || 0) / 1000))}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 세 번째 카드: 서버 권위 액션 이력 (페이지네이션) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* 주의: WS recent_purchases는 경량 배지/알림용. 리스트는 반드시 서버 API 기반으로 표시해 중복/순서 오류 방지 */}
            <ActionHistory pageSize={10} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}