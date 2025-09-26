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

/**
 * 메모리 풀 구현 (가벼운 재사용) – 빈번한 파티클 재생성에 따른 GC 부담 감소 목적
 * 사용 패턴:
 *   const pts = getPooledPoints(n, seed?)
 *   → 렌더 후 애니메이션 종료/언마운트 시 releasePoints(pts)
 * 단순화: 풀은 크기별 버킷을 두지 않고, 요청 count 이상 길이의 배열을 찾아 슬라이스 반환(얕은 복사)
 */
interface InternalPoolEntry {
  arr: ParticlePoint[];
  inUse: boolean;
  capacity: number; // 미리 할당된 길이
}

const __particlePool: InternalPoolEntry[] = [];
const MAX_POOL_SIZE = 24; // 과도 축적 방지

function createOrGrow(entry: InternalPoolEntry | undefined, capacity: number, seed = 101): InternalPoolEntry {
  if (!entry) {
    const arr = generateStablePoints(capacity, seed);
    return { arr, inUse: false, capacity };
  }
  if (entry.capacity < capacity) {
    // capacity 확장 – 기존 참조 재사용, push 방식
    const extra = generateStablePoints(capacity - entry.capacity, seed + 7);
    for (let i = 0; i < extra.length; i++) {
      entry.arr.push({ ...extra[i], id: entry.capacity + i });
    }
    entry.capacity = capacity;
  }
  return entry;
}

export function initPointPool(capacities: number[] = [10, 20, 40], seed = 101) {
  for (const cap of capacities) {
    if (__particlePool.find(p => p.capacity === cap)) continue;
    if (__particlePool.length >= MAX_POOL_SIZE) break;
    __particlePool.push(createOrGrow(undefined, cap, seed + cap));
  }
}

export function getPooledPoints(count: number, seed = 123): ParticlePoint[] {
  if (count <= 0) return [];
  // 가장 작은 충분한 capacity 엔트리 탐색
  let candidate = __particlePool
    .filter(e => !e.inUse && e.capacity >= count)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (!candidate) {
    // 여유 슬롯 또는 재활용 엔트리 확장
    if (__particlePool.length < MAX_POOL_SIZE) {
      candidate = createOrGrow(undefined, count, seed);
      __particlePool.push(candidate);
    } else {
      // 가장 큰 inUse 아닌 엔트리 선택 후 확장
      const expandable = __particlePool.filter(e => !e.inUse).sort((a, b) => b.capacity - a.capacity)[0];
      if (expandable) {
        candidate = createOrGrow(expandable, count, seed + 11);
      } else {
        // 모두 사용 중 → 임시 배열(풀 미관리)
        return generateStablePoints(count, seed + 29);
      }
    }
  }

  candidate.inUse = true;
  // 좌표 재초기화(결정 or 클라이언트 랜덤)
  if (isServer) {
    const rand = seededRandom(seed + candidate.capacity);
    for (let i = 0; i < count; i++) {
      candidate.arr[i].x = rand() * 100;
      candidate.arr[i].y = rand() * 100;
      candidate.arr[i].delay = i * 0.25;
    }
  } else {
    for (let i = 0; i < count; i++) {
      candidate.arr[i].x = Math.random() * 100;
      candidate.arr[i].y = Math.random() * 100;
      candidate.arr[i].delay = i * 0.25;
    }
  }
  // 필요한 길이만 얕은 복사 → 외부 변경으로 풀 오염 방지
  return candidate.arr.slice(0, count).map((p, idx) => ({ ...p, id: p.id ?? idx }));
}

export function releasePoints(points: ParticlePoint[]) {
  if (!points || !points.length) return;
  // 간단: 동일 길이 이상 capacity 엔트리 중 inUse = true → false 전환
  const cap = points.length;
  const entry = __particlePool.find(e => e.inUse && e.capacity >= cap);
  if (entry) {
    entry.inUse = false;
  }
  // 추가 정리 정책(과도 축적 방지)은 추후 metric 기반 도입 가능
}

// 초기화 지연: 명시적 init 필요 (ParticleField 내 최초 호출 시 자동 보완 예정)

export function withViewport(points: ParticlePoint[]): ParticlePoint[] {
  if (isServer) return points; // 서버에선 % 기준 그대로
  return points.map(p => ({
    ...p,
    // 필요 시 viewport 픽셀 좌표 변형 가능 (현재는 % 유지)
  }));
}
