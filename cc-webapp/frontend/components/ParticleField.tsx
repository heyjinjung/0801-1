"use client";
/**
 * 클라이언트 전용 파티클 필드
 * - SSR 시 렌더되지 않도록 dynamic import 에서 ssr:false 로 로드 예정
 */
import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { generateStablePoints, getPooledPoints, releasePoints, initPointPool, ParticlePoint } from "../lib/particles";

export interface ParticleFieldProps {
  count?: number;
  variant?: "login" | "admin" | "generic";
  stableSeed?: number; // (선택) 초기 한번 seed 기반 고정값 후 mount 후 재생성
  className?: string;
  animate?: boolean;
}

const VARIANT_DEFAULT_COUNT: Record<string, number> = {
  login: 20,
  admin: 15,
  generic: 25,
};

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count,
  variant = "generic",
  stableSeed = 73,
  className = "absolute inset-0 pointer-events-none",
  animate = true,
}) => {
  const finalCount = count ?? VARIANT_DEFAULT_COUNT[variant] ?? 20;
  // 첫 SSR 대비: 초기엔 stable seed (dynamic import 이므로 사실상 클라에서만 실행되지만 방어적)
  const [points, setPoints] = useState<ParticlePoint[]>(() => generateStablePoints(finalCount, stableSeed));
  // 현재 풀에서 획득한 포인트(해제 용도)
  const [leased, setLeased] = useState<ParticlePoint[] | null>(null);

  useEffect(() => {
    // 풀 초기화(최초 1회 느슨한 호출)
    initPointPool([finalCount, Math.max(10, finalCount * 2)]);
    const pooled = getPooledPoints(finalCount, stableSeed + 17);
    setLeased(pooled);
    setPoints(pooled);
    return () => {
      if (pooled) releasePoints(pooled);
    };
  }, [finalCount, stableSeed]);

  return (
    <div className={className} aria-hidden>
      {points.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, scale: 0, x: `${p.x}%`, y: `${p.y}%` }}
          animate={animate ? { opacity: [0, 0.4, 0], scale: [0, 1.2, 0] } : undefined}
          transition={{ duration: 6, repeat: animate ? Infinity : 0, delay: p.delay ?? 0 }}
          className="absolute rounded-full bg-pink-500/30 w-2 h-2 shadow-[0_0_8px_rgba(255,0,150,0.6)]"
        />
      ))}
    </div>
  );
};

export default ParticleField;
