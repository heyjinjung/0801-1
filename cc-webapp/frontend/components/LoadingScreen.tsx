'use client';
// Hydration 안정화: 기존 SSR 시 Math.random()/window 기반 파티클 생성으로 서버/클라이언트 DOM 불일치 발생
// → 초기 SSR에서는 파티클을 렌더하지 않고(useState 빈 배열) 클라이언트 마운트 후 useEffect에서만 생성
// → 추후 필요 시 lib/particles 의 deterministic seed 기반으로 SSR 복구 가능

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Zap, Star, Crown, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

interface LoadingScreenProps {
  onComplete?: () => void;
  duration?: number;
  gameTitle?: string;
}

// LoadingScreen 컴포넌트 정의
function LoadingScreenComponent({
  onComplete,
  duration = 3000,
  gameTitle = 'MODEL',
}: LoadingScreenProps) {
  const router = useRouter();
  // ⭐ 모든 state 훅을 최상단에 배치 (순서 중요)
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ⭐ window 객체 접근 시 조건부 로직 사용
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  // ⭐ loadingSteps를 컴포넌트 내부로 이동하고 아이콘 정보 추가
  const loadingSteps = [
    { text: '조금만...', icon: Gamepad2 },
    { text: '기다려주세요...', icon: Zap },
    { text: '사용자 데이터 동기화...', icon: Star },
    { text: '이제 시작합니다!!', icon: Crown },
  ];

  // 모바일 디바이스 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 640);
        setWindowDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      };

      // 초기 체크
      checkMobile();

      // 리사이즈 이벤트 리스너
      window.addEventListener('resize', checkMobile);

      // 클린업
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []); // 빈 의존성 배열

  // 로딩 진행 처리
  useEffect(() => {
    let isMounted = true;

    // 진행바 업데이트
    const interval = setInterval(() => {
      if (isMounted && progress < 100) {
        setProgress((prev: number) => {
          const newProgress = Math.min(prev + 1, 100);

          // 단계 업데이트
          if (newProgress >= 25 && currentStep < 1) setCurrentStep(1);
          else if (newProgress >= 60 && currentStep < 2) setCurrentStep(2);
          else if (newProgress >= 90 && currentStep < 3) setCurrentStep(3);

          // 완료 처리
          if (newProgress === 100) {
            setTimeout(() => {
              if (isMounted) {
                setIsComplete(true);
                console.log('[LoadingScreen] 로딩 100% 완료');
                if (onComplete) {
                  console.log('[LoadingScreen] onComplete 콜백 호출');
                  onComplete();
                } else {
                  console.log('[LoadingScreen] router.push(/login)');
                  router.push('/login');
                }
              }
            }, 500);
          }

          return newProgress;
        });
      }
    }, duration / 100); // 진행 속도 조정

    // 3초 강제 타임아웃: 로딩이 끝나지 않아도 로그인 페이지로 이동
    const forceTimeout = setTimeout(() => {
      if (!isComplete) {
        console.log('[LoadingScreen] 3초 강제 타임아웃 발생');
        if (onComplete) {
          console.log('[LoadingScreen] onComplete 콜백 호출 (타임아웃)');
          onComplete();
        } else {
          console.log('[LoadingScreen] router.push(/login) (타임아웃)');
          router.push('/login');
        }
      }
    }, 3000);

    // 클린업 함수
    return () => {
      clearInterval(interval);
      clearTimeout(forceTimeout);
      isMounted = false;
    };
  }, [progress, currentStep, duration, onComplete, isComplete, router]);

  // ⭐ 애니메이션 효과 설정 (useMemo 대신 일반 변수로 전환)
  const particleCount = isMobile ? 10 : 20;
  // SSR 결정성: 초기엔 빈 배열, 클라이언트 마운트 후 생성
  const [particles, setParticles] = useState<{id:number,x:number,y:number,size:number,duration:number}[]>([]);
  useEffect(() => {
    const list = Array.from({ length: particleCount }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      duration: Math.random() * 20 + 10,
    }));
    setParticles(list);
  }, [particleCount]);

  // 컴포넌트 렌더링
  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 py-6 bg-gradient-to-br from-background via-black to-primary/20"
        >
          {/* Animated Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            {particles.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{
                  opacity: 0,
                  scale: 0,
                  x: `${p.x}%`,
                  y: `${p.y}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                  rotate: isMobile ? 0 : 360,
                }}
                transition={{
                  duration: isMobile ? 4 : 3,
                  repeat: Infinity,
                  delay: i * (isMobile ? 0.2 : 0.1),
                  ease: 'easeInOut',
                }}
                className={`absolute rounded-full ${isMobile ? 'w-1.5 h-1.5' : 'w-2 h-2'} bg-primary`}
              />
            ))}
          </div>

          {/* Main Loading Content */}
          <div className="relative z-10 text-center space-y-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
            {/* Game Logo/Title */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                duration: 1,
                type: 'spring',
                stiffness: 100,
                delay: 0.2,
              }}
              className="space-y-4"
            >
              <div className="relative mx-auto w-20 h-20 sm:w-24 sm:h-24 mb-4 sm:mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: isMobile ? 6 : 4, // 모바일에서는 회전 애니메이션 느리게
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-gold p-1"
                >
                  <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                    <Gamepad2 className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
                  </div>
                </motion.div>

                {/* Orbiting Elements - 모바일에서는 요소 수 줄이기 */}
                {/* 모바일에서는 2개, 데스크톱에서는 3개 표시 */}
                {(isMobile ? [0, 180] : [0, 120, 240]).map((angle, index) => (
                  <motion.div
                    key={index}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: isMobile ? 5 : 3, // 모바일에서는 느리게 회전
                      repeat: Infinity,
                      ease: 'linear',
                      delay: index * (isMobile ? 0.5 : 0.3), // 모바일에서는 딜레이 더 주기
                    }}
                    className="absolute inset-0"
                  >
                    <Sparkles
                      className="absolute w-2.5 h-2.5 sm:w-3 sm:h-3 text-gold"
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${isMobile ? '-32px' : '-35px'}) sm:translateY(-40px)`,
                      }}
                    />
                  </motion.div>
                ))}
              </div>

              <motion.h1
                className="text-3xl sm:text-4xl md:text-5xl font-black text-gradient-primary tracking-wider"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                {gameTitle}
              </motion.h1>
            </motion.div>

            {/* Loading Progress */}
            <div className="space-y-4 sm:space-y-6 w-full">
              {/* Progress Bar */}
              <div className="relative">
                <div className="w-full h-1.5 sm:h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="h-full bg-gradient-game relative"
                  >
                    <motion.div
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    />
                  </motion.div>
                </div>

                {/* Progress Percentage */}
                <motion.div
                  className="absolute -top-6 sm:-top-8 right-0 text-sm sm:text-base text-gold font-bold"
                  key={progress}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {progress}%
                </motion.div>
              </div>

              {/* Loading Step */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center gap-2 sm:gap-3"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    {React.createElement(loadingSteps[currentStep].icon, {
                      className: 'w-4 h-4 sm:w-5 sm:h-5 text-primary',
                    })}
                  </motion.div>
                  <span className="text-sm sm:text-base text-foreground font-medium">
                    {loadingSteps[currentStep].text}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Loading Dots */}
            <div className="flex justify-center gap-1.5 sm:gap-2">
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-primary rounded-full"
                />
              ))}
            </div>

            {/* Version Info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-[10px] sm:text-xs text-muted-foreground"
            >
              Version 1.0.0 • Made with JM
            </motion.div>
          </div>

          {/* Corner Decorations - 모바일에서는 더 작고 화면 가장자리에 가깝게 */}
          <div className="absolute top-2 sm:top-4 left-2 sm:left-4">
            <motion.div
              animate={{ rotate: isMobile ? 180 : 360 }}
              transition={{
                duration: isMobile ? 15 : 10,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="w-10 h-10 sm:w-16 sm:h-16 border border-primary/20 sm:border-2 sm:border-primary/30 rounded-full"
            />
          </div>

          <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4">
            <motion.div
              animate={{ rotate: isMobile ? -180 : -360 }}
              transition={{
                duration: isMobile ? 20 : 15,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="w-8 h-8 sm:w-12 sm:h-12 border border-gold/20 sm:border-2 sm:border-gold/30 rounded-full"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 동적 임포트를 위한 컴포넌트 - ssr: false로 클라이언트에서만 렌더링
const LoadingScreen = dynamic(() => Promise.resolve(LoadingScreenComponent), {
  ssr: false,
});

// 단일 export 사용 (중복 export 제거)
export { LoadingScreen };
