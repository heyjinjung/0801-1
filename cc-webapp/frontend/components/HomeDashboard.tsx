'use client';
// Hydration 안정화: 대시보드 배경 포인트는 기존 렌더마다 Math.random() 호출 → SSR/CSR 불일치 + 잦은 재마운트
// → 초기 빈 state + 클라이언트 useEffect에서 1회만 생성하여 결정성 보장 (서버 출력 = 빈, 클라이언트에서만 애니메이션)
// → 필요 시 lib/particles 사용해 seed 기반 SSR 도입 가능

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rewardMessages } from '@/lib/rewardMessages';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Gift,
  Zap,
  Trophy,
  Settings,
  LogOut,
  Timer,
  ChevronRight,
  Sparkles,
  Menu,
} from 'lucide-react';
import { User } from '../types';
import { calculateExperiencePercentage, calculateWinRate, checkLevelUp } from '../utils/userUtils';
import { QUICK_ACTIONS, ACHIEVEMENTS_DATA } from '../constants/dashboardData';
import { Button } from './ui/button';
import { useGameConfig } from '../hooks/useGameConfig';
// import { Progress } from './ui/progress';
import { getTokens } from '../utils/tokenStorage';
import { useEvents } from '../hooks/useEvents';
// useAuthGate 훅: default + named export 모두 지원. 경로/타입 오류 해결 위해 명시적 import
// 경로 해석 문제로 상대경로 대신 tsconfig paths alias 사용
import useAuthGate from '@/hooks/useAuthGate';
import { BUILD_ID } from '@/lib/buildInfo';
import { api as unifiedApi } from '@/lib/unifiedApi';
// useDashboard 제거(전역 셀렉터 + 개별 엔드포인트로 대체)
import useRecentActions from '@/hooks/useRecentActions';
import { API_ORIGIN } from '@/lib/unifiedApi';
import { createWSClient, WSClient, WebSocketMessage } from '@/utils/wsClient';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useGlobalProfile } from '@/store/globalStore';
import { useUserGold, useUserLevel } from '@/hooks/useSelectors';

interface HomeDashboardProps {
  user: User;
  onLogout: () => void;
  onNavigateToGames: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToShop?: () => void;
  onNavigateToStreaming?: () => void;
  onNavigateToEvents?: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
  onToggleSideMenu: () => void;
}

export function HomeDashboard({
  user,
  onLogout,
  onNavigateToGames,
  onNavigateToSettings,
  onNavigateToShop,
  onNavigateToStreaming,
  onNavigateToEvents,
  onUpdateUser,
  onAddNotification,
  onToggleSideMenu,
}: HomeDashboardProps) {
  // 전역 동기화 사용
  const globalProfile = useGlobalProfile();
  const { syncAll, syncAfterGame, isHydrated } = useGlobalSync();
  const goldFromStore = useUserGold();
  const levelFromStore = useUserLevel();
  const router = useRouter();

  // 초기 동기화
  useEffect(() => {
    if (!isHydrated) {
      syncAll({ showToast: false });
    }
  }, [isHydrated, syncAll]);

  // 게임 설정 로드 (하드코딩 대체)
  const { config: gameConfig, loading: configLoading } = useGameConfig();

  // 통합 대시보드 데이터 (profile + events summary 등) - streak, vip/status 등 개별 일부 호출 단계적 병합 예정
  // useDashboard 제거: streak/status 등 필요한 정보는 개별 엔드포인트로 최소 조회
  // Auth Gate (클라이언트 마운트 후 토큰 판정)
  const { isReady: authReady, authenticated } = useAuthGate();
  // 이벤트: 비로그인 시 자동 로드 skip
  const { events: activeEvents } = useEvents({ autoLoad: authenticated });
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [showDailyReward, setShowDailyReward] = useState(false);
  // 랭킹 준비중 모달 상태
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [dailyClaimed, setDailyClaimed] = useState(false); // 서버 상태 기반 일일 보상 수령 여부
  const [treasureProgress, setTreasureProgress] = useState(65);
  // vipPoints: 백엔드 UserResponse 필드 vip_points → 프론트 User 타입 camelCase 매핑 필요 시 fallback
  const [vipPoints, setVipPoints] = useState(
    (user as any)?.vip_points ?? (user as any)?.vipPoints ?? 0
  );
  const [isAchievementsExpanded, setIsAchievementsExpanded] = useState(false);
  const [streak, setStreak] = useState({
    count: user?.dailyStreak ?? 0,
    ttl_seconds: null as number | null,
    next_reward: null as string | null,
  });
  // streakProtection 토글 기능 제거(요구사항: 보호 토글/표시 제거) → 관련 상태/호출 삭제
  // const [streakProtection, setStreakProtection] = useState(null as boolean | null);
  const [attendanceDays, setAttendanceDays] = useState(null as string[] | null);
  // 매 렌더마다 Math.random() 호출 → 1초마다 interval 재렌더 시 수십개의 motion div 재마운트 → passive effect stack 증가
  // 1회만 좌표를 생성하여 렌더 루프/마운트 폭증을 방지
    const [backgroundPoints, setBackgroundPoints] = useState<{x:number,y:number,size:number,opacity:number}[]>([]);
    useEffect(() => {
      const pts = Array.from({ length: isMobile ? 20 : 40 }).map(() => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * (isMobile ? 1.5 : 2.5) + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
      }));
      setBackgroundPoints(pts);
    }, [isMobile]);

  // streak state 동등성 비교 후 변경시에만 set → 동일 데이터 반복 set으로 인한 불필요 재렌더 방지
  interface StreakState {
    count: number;
    ttl_seconds: number | null;
    next_reward: string | null;
  }
  const safeSetStreak = (next: StreakState) => {
    setStreak((prev: StreakState) =>
      prev.count === next.count &&
      prev.ttl_seconds === next.ttl_seconds &&
      prev.next_reward === next.next_reward
        ? prev
        : next
    );
  };

  // 활성 이벤트 중 가장 높은 priority(또는 start_date 최신) 1개 선택 → 핫 이벤트 카드로 사용
  const hotEvent = (() => {
    if (!activeEvents || activeEvents.length === 0) return null;
    // priority desc, start_date desc 정렬 시도
    const sorted = [...(activeEvents as any[])].sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pb !== pa) return pb - pa;
      const sa = new Date(a.start_date || a.start || 0).getTime();
      const sb = new Date(b.start_date || b.start || 0).getTime();
      return sb - sa;
    });
    return sorted[0];
  })();

  useEffect(() => {
    if (!hotEvent?.end_date) return;
    const endTime = new Date(hotEvent.end_date);
    const tick = () => {
      const now = new Date();
      const diff = endTime.getTime() - now.getTime();
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds });
      } else {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hotEvent?.end_date]);

  // Auth 준비 후 streak/status 1회 조회 → TTL/다음보상 등 채움 (대시보드 훅 대체)
  useEffect(() => {
    if (!authReady || !authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const s: any = await unifiedApi.get('streak/status');
        if (cancelled) return;
        safeSetStreak({
          count: s?.count ?? 0,
          ttl_seconds: s?.ttl_seconds ?? null,
          next_reward: s?.next_reward ?? null,
        });
        if (typeof s?.claimed_today !== 'undefined') setDailyClaimed(!!s.claimed_today);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, authenticated]);

  // attendanceDays: 기존 대시보드 응답의 streak.attendance_week 활용 제거
  // 필요 시 /api/streak/history(year,month)로 확장 예정. 현재는 null 유지 시 UI 비표시.

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev: { hours: number; minutes: number; seconds: number }) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 23, minutes: 59, seconds: 59 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const experiencePercentage = calculateExperiencePercentage(user);
  const winRate = calculateWinRate(user);

  // 마운트 시 1회 권위 잔액으로 동기화(DEV 토스트 포함)
  useEffect(() => {
    syncAll({ showToast: false }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 최근 액션 로드 (user.id는 문자열로 정의되어 있어 숫자 변환 시도)
  const numericUserId = (() => {
    const n = Number((user as any)?.id);
    return Number.isFinite(n) ? n : undefined;
  })();
  const { actions: recentActions, reload: reloadRecentActions } = useRecentActions(
    numericUserId,
    10,
    true
  );

  // 선택: 실시간 반영 (NEXT_PUBLIC_REALTIME_ENABLED=1 일 때만 연결)
  useEffect(() => {
    try {
      // @ts-ignore - Node 타입 미설치 환경 대비
      const enabled =
        (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_REALTIME_ENABLED) || '0';
      if (!(enabled === '1' || enabled?.toLowerCase() === 'true')) return;
      if (!numericUserId) return;
      const tokens = getTokens();
      const token = (tokens as any)?.access_token;
      if (!token) return;

      const client: WSClient = createWSClient({
        url: `${API_ORIGIN}/api/realtime/sync`,
        token,
        onMessage: (msg: WebSocketMessage) => {
          const t = String(msg?.type || '').toLowerCase();
          if (t === 'user_action' || t === 'useraction') {
            // 동일 유저 이벤트만 반영
            const uid = (msg as any)?.data?.user_id;
            if (!uid || Number(uid) !== numericUserId) return;
            // 간단히 재조회로 동기화
            try {
              reloadRecentActions();
            } catch {}
          }
        },
        onError: () => {},
      });
      client.connect().catch(() => {});
      return () => client.disconnect();
    } catch {}
  }, [numericUserId, reloadRecentActions]);

  const renderStreakLocked = () => (
    <div className="mt-4 rounded-md border border-dashed border-neutral-600 p-4 text-sm text-neutral-400">
      🔐 로그인 후 출석(스트릭) 정보와 일일 보상을 확인할 수 있습니다.
    </div>
  );

  const claimDailyReward = async () => {
    // 기존 프로필 스냅샷(검증용)
    const prevGold = user.goldBalance;
    const prevXP = user.experience;
    const prevStreak = user.dailyStreak;
    const tokens = getTokens();
    if (!tokens?.access_token) {
      onAddNotification(rewardMessages.loginRequired);
      return;
    }
    if (dailyClaimed) {
      onAddNotification(rewardMessages.alreadyClaimed);
      // 이미 프론트 상태상 claimed → 정보 로그
      // eslint-disable-next-line no-console
      console.info('[streak.claim] skip (already claimed state=true)', {
        prevGold,
        prevXP,
        prevStreak,
      });
      return;
    }

    try {
      const data = await unifiedApi.post('streak/claim', { action_type: 'DAILY_LOGIN' });
      // data: { awarded_gold, awarded_xp, new_gold_balance, streak_count }
      const fallback = {
        ...user,
        goldBalance: data.new_gold_balance ?? user.goldBalance,
        experience: (user.experience || 0) + (data.awarded_xp || 0),
        dailyStreak: data.streak_count ?? user.dailyStreak,
      };
      const { updatedUser: finalUser, leveledUp } = checkLevelUp(fallback);
      if (leveledUp) {
        setShowLevelUpModal(true);
        onAddNotification(`🆙 레벨업! ${finalUser.level}레벨 달성!`);
      }
      try {
        const bal = await unifiedApi.get('users/balance');
        const cyber = (bal as any)?.cyber_token_balance;
        onUpdateUser({
          ...finalUser,
          goldBalance: typeof cyber === 'number' ? cyber : finalUser.goldBalance,
        });
      } catch {
        onUpdateUser(finalUser);
      }
      onAddNotification(
        rewardMessages.success(
          data.awarded_gold || 0,
          data.awarded_xp || 0,
          (streak.count || user.dailyStreak || 0) + 0
        )
      );
      setShowDailyReward(false);
      setDailyClaimed(true);
      // streak/status 재조회로 상태 동기화
      try {
        const s: any = await unifiedApi.get('streak/status');
        safeSetStreak({
          count: s?.count ?? 0,
          ttl_seconds: s?.ttl_seconds ?? null,
          next_reward: s?.next_reward ?? null,
        });
        if (typeof s?.claimed_today !== 'undefined') setDailyClaimed(!!s.claimed_today);
      } catch {}
  } catch (e: any) {
      // 상태코드/메시지 기반 분류 로깅 지원 (apiRequest는 status를 직접 던지지 않으므로 message 패턴 사용)
      if (e?.message === 'Failed to fetch') {
        onAddNotification(rewardMessages.networkFail);
        // eslint-disable-next-line no-console
        console.warn('[streak.claim] network_fail', e);
        return;
      }
      if (
        e?.message?.includes('한 회원당 하루에 1번만') ||
        /already[_\s]?claimed/i.test(e?.message || '')
      ) {
        // 요구사항: 이미 수령 케이스 문구 통일
        onAddNotification(rewardMessages.alreadyClaimed);
        setDailyClaimed(true);
        // eslint-disable-next-line no-console
        console.info('[streak.claim] already_claimed (exception path)', {
          message: e?.message,
          prevGold,
          prevXP,
        });
      } else {
        onAddNotification(rewardMessages.genericFail(e?.message || '네트워크 오류'));
        // eslint-disable-next-line no-console
        console.error('[streak.claim] failure', {
          message: e?.message,
          prevGold,
          prevXP,
        });
      }
    }
  };

  const handleSettings = () => {
    if (onNavigateToSettings) {
      onNavigateToSettings();
    } else {
      onAddNotification('⚙️ 설정 기능 준비중!');
    }
  };

  const quickActionsWithHandlers = QUICK_ACTIONS.map((action) => ({
    ...action,
    onClick: () => {
      switch (action.title) {
        case '게임 플레이':
          onNavigateToGames();
          break;
        case '상점':
          if (onNavigateToShop) {
            onNavigateToShop();
          } else {
            onAddNotification('🛍️ 상점 기능 준비중!');
          }
          break;
        case '방송보기':
          if (onNavigateToStreaming) {
            onNavigateToStreaming();
          } else {
            onAddNotification('📺 방송보기 기능 준비중!');
          }
          break;
        case '랭킹':
          setShowRankingModal(true);
          break;
      }
    },
  }));

  const achievements = ACHIEVEMENTS_DATA.map((achievement) => ({
    ...achievement,
    unlocked: (() => {
      switch (achievement.id) {
        case 'first_login':
          return true;
        case 'level_5':
          return user.level >= 5;
        case 'win_10':
          return user.stats.gamesWon >= 10;
        case 'treasure_hunt':
          return treasureProgress >= 50;
        case 'gold_100k':
          return user.goldBalance >= 100000;
        case 'daily_7':
          return (streak.count ?? user.dailyStreak) >= 7;
        default:
          return false;
      }
    })(),
  }));

  const unlockedAchievements = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-black to-primary-soft relative overflow-hidden pb-20">
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed top-0 left-0 right-0 z-50 text-[10px] font-mono tracking-wider bg-black/60 backdrop-blur-sm text-muted-foreground py-1 text-center border-b border-border/40">
          BUILD: {BUILD_ID}
        </div>
      )}
      {/* Animated Background (SSR 결정성 확보: 초기 빈 → 클라이언트 생성) */}
      <div className="absolute inset-0">
        {backgroundPoints.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, p.opacity, 0], scale: [0, 1, 0], rotate: 360 }}
            transition={{
              duration: 12,
              repeat: Infinity,
              delay: i * 0.4,
              ease: 'easeInOut',
              type: 'tween',
            }}
            className="absolute rounded-full bg-primary/70"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size * 3}px`,
              height: `${p.size * 3}px`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <AnimatePresence>
        {showRankingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-xl border border-neutral-700 bg-gradient-to-br from-background/90 to-black/80 p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(255,215,0,0.08),transparent_70%)]" />
              <div className="relative z-10 text-center space-y-4">
                <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-warning to-warning/30 border border-warning/40 shadow-inner">
                  <Trophy className="w-8 h-8 text-warning" />
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-warning to-gold bg-clip-text text-transparent">
                  랭킹 준비중
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  랭킹 시스템을 멋지게 준비하고 있어요!
                  <br />곧 시즌 보상과 실시간 순위를 만나볼 수 있습니다.
                </p>
                <div className="flex flex-col gap-2 text-xs text-neutral-400">
                  <div>예정 기능: 시즌제 포인트, 주간 TOP 100, 친구 비교</div>
                  <div>필요한 의견이 있다면 피드백을 보내주세요.</div>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowRankingModal(false)}
                  >
                    닫기
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 lg:p-6 border-b border-border-secondary backdrop-blur-sm"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            {/* 완전히 개선된 사이드메뉴 버튼 - 44px × 44px, 접근성 강화 */}
            <Button
              variant="outline"
              onClick={onToggleSideMenu}
              className="h-11 w-11 p-0 border-2 border-border-secondary hover:border-primary hover:bg-primary/10 focus:border-primary focus:bg-primary/10 transition-all duration-200 touch-manipulation"
              aria-label="메뉴 열기"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.1 }}
              >
                <Menu className="w-5 h-5" />
              </motion.div>
            </Button>

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 bg-gradient-game rounded-full flex items-center justify-center level-glow"
            >
              <Crown className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gradient-primary">
                {user.nickname}
              </h1>
              {user.isAdmin && <div className="text-xs text-error font-bold">🔐 관리자</div>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(user as any)?.is_admin || (user as any)?.isAdmin ? (
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
                className="h-10 border-border-secondary hover:border-primary text-xs px-3 hidden md:inline-flex"
              >
                Admin
              </Button>
            ) : null}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="hidden md:flex items-center gap-2 bg-error-soft px-3 py-2 rounded-lg text-error text-sm"
            >
              <Timer className="w-4 h-4" />
              <span>
                {String(timeLeft.hours).padStart(2, '0')}:
                {String(timeLeft.minutes).padStart(2, '0')}:
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
            </motion.div>

            <Button
              variant="outline"
              size="icon"
              onClick={handleSettings}
              className="h-10 w-10 border-border-secondary hover:border-primary btn-hover-lift"
              aria-label="설정"
            >
              <Settings className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              onClick={onLogout}
              className="h-10 border-border-secondary hover:border-error text-error hover:text-error btn-hover-lift"
            >
              <LogOut className="w-4 h-4 mr-2" />
              로그아웃
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 p-4 lg:p-6 max-w-7xl mx-auto">
        {/**
         * 메인 페이지 전용 "게임 통계/상태 바" 제거 요청 반영
         * - 기존: 골드/레벨/보물찾기/VIP 포인트 4블록 표시
         * - 사양: 메인 페이지에서만 제거 (다른 페이지 영향 없음)
         */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                빠른 액션
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {quickActionsWithHandlers.map((action, index) => (
                  <motion.div
                    key={action.title}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={action.onClick}
                    className={`glass-effect rounded-xl p-6 cursor-pointer relative overflow-hidden card-hover-float ${
                      action.highlight ? 'border-2 border-primary soft-glow' : ''
                    }`}
                  >
                    {action.badge && (
                      <div
                        className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold animate-pulse ${
                          action.badge === 'LIVE' ? 'bg-error text-white' : 'bg-error text-white'
                        }`}
                      >
                        {action.badge}
                      </div>
                    )}

                    <div
                      className={`w-12 h-12 bg-gradient-to-r ${action.color} rounded-lg flex items-center justify-center mb-3`}
                    >
                      <action.icon className="w-6 h-6 text-white" />
                    </div>

                    <h3 className="font-bold text-foreground mb-1">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>

                    <ChevronRight className="absolute bottom-4 right-4 w-4 h-4 text-muted-foreground" />
                  </motion.div>
                ))}
              </div>
            </motion.div>

          </div>

          {/* Right Column - Streak & Events */}
          <div className="space-y-6">
            {/* Recent Actions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
              className="glass-effect rounded-xl p-4 card-hover-float"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Timer className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">최근 액션</h2>
                </div>
              </div>
              <div className="space-y-2">
                {recentActions && recentActions.length > 0 ? (
                  recentActions.map((a: any) => (
                    <div
                      key={a.id}
                      className="bg-secondary/40 rounded-md px-3 py-2 text-sm flex items-center justify-between"
                    >
                      <span className="font-medium text-foreground">{a.action_type}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">표시할 최근 액션이 없습니다.</div>
                )}
              </div>
            </motion.div>
            {/* Streak Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-effect rounded-xl p-4 card-hover-float"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">연속 보상</h2>
                </div>
                {typeof streak.ttl_seconds === 'number' && (
                  <div className="text-xs text-muted-foreground">
                    남은 시간 ~ {Math.max(0, Math.floor(streak.ttl_seconds / 3600))}h
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-2xl font-bold text-primary">{streak.count}</div>
                  <div className="text-xs text-muted-foreground">연속일</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-sm font-bold text-gold">
                    {streak.next_reward || 'Coins + XP'}
                  </div>
                  <div className="text-xs text-muted-foreground">다음 보상</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <Button size="sm" className="w-full" onClick={() => setShowDailyReward(true)}>
                    보상 보기
                  </Button>
                </div>
              </div>
              {/* 혜택 패턴 & 월간 누적 텍스트 제거 (요구사항) */}

              {/* Minimal monthly attendance calendar (current month) */}
              {attendanceDays && (
                <div className="mt-2 border border-border-secondary/40 rounded-lg p-2">
                  {(() => {
                    // 주간(일~토) 7일 캘린더로 전환
                    const now = new Date();
                    const todayUTC = new Date(
                      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
                    );
                    const weekday = todayUTC.getUTCDay(); // 0=Sun
                    const weekStart = new Date(todayUTC);
                    weekStart.setUTCDate(todayUTC.getUTCDate() - weekday); // 일요일로 이동
                    const days: Array<{
                      label: string;
                      dateStr: string;
                      active: boolean;
                      isToday: boolean;
                    }> = [];
                    for (let i = 0; i < 7; i++) {
                      const d = new Date(
                        Date.UTC(
                          weekStart.getUTCFullYear(),
                          weekStart.getUTCMonth(),
                          weekStart.getUTCDate() + i
                        )
                      );
                      const iso = d.toISOString().slice(0, 10);
                      days.push({
                        label: String(d.getUTCDate()),
                        dateStr: iso,
                        active: attendanceDays.includes(iso),
                        isToday: iso === todayUTC.toISOString().slice(0, 10),
                      });
                    }
                    return (
                      <div>
                        <div className="text-[11px] text-muted-foreground/80 mb-1">
                          이번 주 출석: {days.filter((d) => d.active).length}일
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground/70 mb-1">
                          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                            <div key={d} className="text-center">
                              {d}
                            </div>
                          ))}
                        </div>
                        <div
                          className="grid gap-1"
                          style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
                        >
                          {days.map((c, idx) => (
                            <div
                              key={idx}
                              className={`h-6 rounded flex items-center justify-center text-[11px] relative select-none transition-colors duration-200
                                ${
                                  c.active
                                    ? 'bg-primary/30 text-foreground'
                                    : 'bg-secondary/30 text-muted-foreground'
                                }
                                ${c.isToday ? 'ring-1 ring-primary/70 font-bold' : ''}`}
                              title={c.dateStr}
                            >
                              {c.label}
                              {c.isToday && (
                                <span className="absolute -bottom-3 text-[9px] text-primary font-semibold">
                                  오늘
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
            >
              <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Gift className="w-5 h-5 text-error" />핫 이벤트
              </h2>
              <div className="space-y-3">
                {hotEvent ? (
                  <motion.div
                    whileHover={{
                      scale: 1.05,
                      y: -5,
                      boxShadow: '0 10px 25px rgba(230, 51, 107, 0.3)',
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="glass-effect rounded-xl p-4 border-2 border-error/30 soft-glow cursor-pointer card-hover-float relative overflow-hidden group"
                  >
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-r from-error/10 to-warning/10 rounded-xl"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.02, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 bg-error/20 rounded-xl group-hover:bg-error/30"
                    />
                    <div className="relative z-10">
                      <div className="flex items-center gap-3">
                        <motion.div
                          whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                          transition={{ duration: 0.5, type: 'tween' }}
                          className="w-12 h-12 bg-gradient-to-r from-error to-warning rounded-lg flex items-center justify-center"
                        >
                          <Gift className="w-6 h-6 text-white" />
                        </motion.div>
                        <div className="flex-1">
                          <motion.div whileHover={{ x: 5 }} className="font-bold text-error">
                            {hotEvent.title}
                          </motion.div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {hotEvent.description || '이벤트 진행중'}
                          </div>
                        </div>
                      </div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="mt-3 bg-error-soft rounded-lg p-2 text-center"
                      >
                        <motion.div
                          animate={{ color: ['#e6336b', '#ff4d9a', '#e6336b'] }}
                          transition={{ duration: 1.5, repeat: Infinity, type: 'tween' }}
                          className="text-error text-sm font-medium"
                        >
                          {String(timeLeft.hours).padStart(2, '0')}:
                          {String(timeLeft.minutes).padStart(2, '0')}:
                          {String(timeLeft.seconds).padStart(2, '0')} 남음
                        </motion.div>
                      </motion.div>
                    </div>
                  </motion.div>
                ) : null}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Daily Reward Modal */}
      <AnimatePresence>
        {showDailyReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDailyReward(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="glass-effect rounded-2xl p-8 max-w-md w-full text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-20 h-20 bg-gradient-gold rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <Gift className="w-10 h-10 text-black" />
              </motion.div>

              <h3 className="text-2xl font-bold text-gold mb-2">일일 보상!</h3>
              <p className="text-muted-foreground mb-6">
                연속 {streak.count ?? user.dailyStreak}일 접속 보너스를 받으세요!
              </p>

              <div className="bg-gold-soft rounded-lg p-4 mb-6">
                <div className="text-gold font-bold text-xl">
                  {/* 서버 설정 기반 일일 보너스 계산 */}
                  {(
                    gameConfig.dailyBonusBase +
                    (streak.count ?? user.dailyStreak) * gameConfig.dailyBonusPerStreak
                  ).toLocaleString()}
                  G
                </div>
                <div className="text-sm text-muted-foreground">
                  {/* 서버 설정 기반 XP 계산 */}+{' '}
                  {Math.floor(gameConfig.dailyBonusBase / 20) +
                    (streak.count ?? user.dailyStreak) *
                      Math.floor(gameConfig.dailyBonusPerStreak / 8)}{' '}
                  XP
                </div>
              </div>

              <Button
                onClick={claimDailyReward}
                disabled={dailyClaimed}
                className="w-full bg-gradient-gold hover:opacity-90 text-black font-bold py-3 btn-hover-lift disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dailyClaimed ? '이미 수령됨' : '보상 받기!'}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Up Modal */}
      <AnimatePresence>
        {showLevelUpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: 50 }}
              className="glass-effect rounded-2xl p-8 max-w-md w-full text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: 3, type: 'tween' }}
                className="text-6xl mb-4"
              >
                ⭐
              </motion.div>

              <h3 className="text-3xl font-bold text-gradient-primary mb-2">레벨업!</h3>
              <p className="text-xl text-gold font-bold mb-4">레벨 {user.level}</p>
              <p className="text-muted-foreground mb-6">축하합니다! 새로운 레벨에 도달했습니다!</p>

              <Button
                onClick={() => setShowLevelUpModal(false)}
                className="w-full bg-gradient-game hover:opacity-90 text-white font-bold py-3 btn-hover-lift"
              >
                계속하기
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}