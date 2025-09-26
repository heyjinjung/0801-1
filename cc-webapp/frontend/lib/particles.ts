/**
 * SSR 결정성 + Hydration 안정화를 위한 파티클 유틸
 * - 서버: seed 기반 결정적 좌표
 * - 클라이언트: Math.random() 사용 (초기 mount 후 재생성 가능)
 */

export const isServer = typeof window === 'undefined';

// 단순 결정적 seed 난수 (LCG)
export function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface ParticlePoint {
  id: number | string;
  x: number; // 0~100 (% 기준)
  y: number; // 0~100 (% 기준)
  delay?: number;
  extra?: Record<string, any>;
}

export function generateStablePoints(count: number, seed = 42): ParticlePoint[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    x: rand() * 100,
    y: rand() * 100,
    delay: i * 0.25,
  }));
}

export function generateClientPoints(count: number): ParticlePoint[] {
  if (isServer) return generateStablePoints(count, 99);
  return Array.from({ length: count }).map((_, i) => ({
    id: `${Date.now()}-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: i * 0.25,
  }));
}

export function withViewport(points: ParticlePoint[]): ParticlePoint[] {
  if (isServer) return points; // 서버에선 % 기준 그대로
  return points.map(p => ({
    ...p,
    // 필요 시 viewport 픽셀 좌표 변형 가능 (현재는 % 유지)
  }));
}
