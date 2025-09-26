/**
 * stableRandom 유틸
 * SSR/클라이언트 모두에서 동일한 seed + index 입력에 대해 결정적 값을 반환.
 * - 선형 합동 방식(LCG) 사용 (32-bit) → 가벼움/충분한 분산
 * - 의도치 않은 보안/암호 목적 사용 금지
 */

export interface StableRng {
  next(): number; // [0,1)
  int(maxExclusive: number): number; // 0..maxExclusive-1
  pick<T>(arr: readonly T[]): T;
}

// LCG 상수 (Numerical Recipes)
const A = 1664525;
const C = 1013904223;
const M = 2 ** 32;

export function createStableRng(seed: number): StableRng {
  let state = seed >>> 0;
  const nextRaw = () => {
    state = (A * state + C) % M;
    return state;
  };
  return {
    next: () => nextRaw() / M,
    int: (maxExclusive: number) => {
      if (maxExclusive <= 0) return 0;
      return Math.floor((nextRaw() / M) * maxExclusive);
    },
    pick: <T>(arr: readonly T[]): T => {
      if (!arr.length) throw new Error('pick: empty array');
      return arr[(nextRaw() % arr.length)] as T;
    }
  };
}

/**
 * 단발 호출: 동일 seed, index 입력에 대해 결정적 pseudo random [0,1) 값.
 * 내부적으로 간단히 index 만큼 advance.
 */
export function stableRandom(seed: number, index: number): number {
  const rng = createStableRng(seed);
  for (let i = 0; i < index; i++) rng.next();
  return rng.next();
}

/**
 * 배열을 결정적으로 섞음(Fisher–Yates). 원배열은 복사되어 불변 유지.
 */
export function stableShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rng = createStableRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 간단 Self-test (개발 중 수동 실행용) - 번들 트리쉐이킹 방해하지 않도록 조건부
if (process.env.NODE_ENV === 'test-dev') {
  const r1 = stableRandom(123, 5);
  const r2 = stableRandom(123, 5);
  if (r1 !== r2) {
    // eslint-disable-next-line no-console
    console.error('stableRandom determinism failure');
  }
}
