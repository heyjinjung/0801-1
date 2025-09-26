import { User, GameItem } from '../../../types';
import { GachaItem, GachaBanner } from '../../../types/gacha';
export type { HeartParticle } from '../../../types/gacha';
import { ANIMATION_DURATIONS, SEXY_EMOJIS, GACHA_ITEMS } from './constants';
import { createStableRng } from '@/lib/stableRandom';

export interface Particle {
  id: string;
  size: number;
  left: string;
  top: string;
  animationDelay?: string;
  emoji?: string;
  animationDuration?: string;
}

/**
 * 고유 ID 생성 함수
 * @param prefix ID 앞에 붙일 접두사
 * @returns 랜덤 ID 문자열
 */
export function generateUniqueId(prefix: string = ''): string {
  const rng = createStableRng(Date.now() ^ (prefix.length << 16));
  // 7 chars base36 slice
  const randStr = Math.floor(rng.next() * 36 ** 7).toString(36).padStart(7, '0');
  return `${prefix}_${randStr}_${Date.now()}`;
}

/**
 * 반짝이는 효과를 위한 랜덤 위치의 요소들 생성
 * @param count 생성할 반짝임 효과 개수
 * @returns 반짝임 효과 배열
 */
export function generateSparkles(count = 5) {
  const rng = createStableRng(Date.now() ^ count);
  return Array.from({ length: count }).map((_, index) => ({
    id: `sparkle-${index}`,
    size: rng.next() * 10 + 5,
    left: `${rng.next() * 100}%`,
    top: `${rng.next() * 100}%`,
    animationDelay: `${rng.next() * 2}s`,
    emoji: SEXY_EMOJIS[Math.floor(rng.next() * SEXY_EMOJIS.length)],
  }));
}

/**
 * 애니메이션 딜레이 계산 (순차적 애니메이션 효과용)
 * @param index 요소의 인덱스
 * @param baseDelay 기본 딜레이 값 (초)
 * @param stagger 요소 간 간격 (초)
 * @returns 계산된 딜레이 값
 */
export function getAnimationDelay(index: number, baseDelay = 0, stagger = 0.1) {
  return baseDelay + index * stagger;
}

/**
 * 가챠 결과에 따른 파티클 효과 생성
 * @param rarity 아이템 희귀도
 * @param count 생성할 파티클 개수
 * @returns 파티클 효과 배열
 */
export function generateParticles(rarity: string, count = 20) {
  const rng = createStableRng((Date.now() ^ rarity.length) >>> 0);
  return Array.from({ length: count }).map((_, index) => ({
    id: `particle-${index}`,
    size: rng.next() * 15 + 5,
    left: `${rng.next() * 100}%`,
    top: `${rng.next() * 100}%`,
    animationDuration: `${rng.next() * 2 + 1}s`,
    animationDelay: `${rng.next() * 0.5}s`,
    rarity,
  }));
}

// Generate floating heart particles
export const generateHeartParticles = (): any[] => {
  const rng = createStableRng(Date.now() ^ 0x777);
  return Array.from({ length: 3 }, (_, i) => ({
    id: generateUniqueId('heart'),
    x: rng.next() * 100,
    y: rng.next() * 100
  }));
};

// Get random item based on rates
export const getRandomItem = (banner: GachaBanner, user: User): GachaItem => {
  // Adjust rates for premium banners
  let adjustedItems = [...GACHA_ITEMS];
  
  if (banner.guaranteedRarity === 'epic') {
    // Remove common items, increase epic/legendary rates
    adjustedItems = adjustedItems.filter(item => item.rarity !== 'common');
    adjustedItems = adjustedItems.map(item => ({
      ...item,
      rate: item.rarity === 'epic' ? item.rate * 2 : item.rate
    }));
  } else if (banner.guaranteedRarity === 'legendary') {
    // Only legendary and mythic items
    adjustedItems = adjustedItems.filter(item => ['legendary', 'mythic'].includes(item.rarity));
    adjustedItems = adjustedItems.map(item => ({
      ...item,
      rate: item.rarity === 'legendary' ? item.rate * 3 : item.rate * 2
    }));
  }

  const totalRate = adjustedItems.reduce((sum, item) => sum + item.rate, 0);
  // 가벼운 RNG: Date.now + banner id length + user id 해시 일부
  const seedBase = (Date.now() ^ (banner.id.length << 8) ^ (user?.id || 0)) >>> 0;
  const rng = createStableRng(seedBase);
  let random = rng.next() * totalRate;
  
  for (const item of adjustedItems) {
    random -= item.rate;
    if (random <= 0) {
      return { ...item, isNew: !user.inventory?.some(inv => inv.id === item.id) };
    }
  }
  
  return adjustedItems[0];
};

// Update user inventory with new item
export const updateUserInventory = (user: User, item: GachaItem): User => {
  const updatedInventory = [...(user.inventory || [])];
  const existingItemIndex = updatedInventory.findIndex(inv => inv.id === item.id);
  
  if (existingItemIndex !== -1) {
    updatedInventory[existingItemIndex].quantity += item.quantity;
  } else {
  // GachaItem may have a broader `type` than GameItem's narrower union.
  // Cast here to avoid spreading changes across global GameItem type.
  // item should be compatible with GameItem shape — cast to a safer Record type
  updatedInventory.push(item as unknown as GameItem);
  }
  
  return {
    ...user,
    inventory: updatedInventory
  };
};

// Get rarity notification message
export const getRarityMessage = (item: GachaItem): string => {
  const rarityMessages: { [key: string]: string } = {
    common: `💋 카와이 아이템: ${item.name}`,
    rare: `💎 레어 아이템: ${item.name}!`,
    epic: `🔥 에픽 아이템: ${item.name}!!`,
    legendary: `👑 레전더리 아이템: ${item.name}!!!`,
    mythic: `🌟 미식 아이템: ${item.name}!!!!`
  };
  
  return rarityMessages[item.rarity] || rarityMessages['common'];
};

// Count rarities in items array
export const countRarities = (items: GachaItem[]): Record<string, number> => {
  return items.reduce((acc, item) => {
    acc[item.rarity] = (acc[item.rarity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

// Get ten pull notification message
export const getTenPullMessage = (items: GachaItem[]): string => {
  const rarityCounts = countRarities(items);
  const notificationParts = [];
  
  if (rarityCounts.mythic) notificationParts.push(`🌟미식 ${rarityCounts.mythic}개`);
  if (rarityCounts.legendary) notificationParts.push(`👑레전더리 ${rarityCounts.legendary}개`);
  if (rarityCounts.epic) notificationParts.push(`🔥에픽 ${rarityCounts.epic}개`);
  
  return `🎁 10연 뽑기 완료! ${notificationParts.length > 0 ? notificationParts.join(', ') : '새로운 아이템들을 획득했습니다!'}`;
};

// Get banner background style
export const getBannerStyle = (banner: GachaBanner, isSelected: boolean) => {
  const colorMaps: { [key: string]: string } = {
    'pink-400': '236, 72, 153, 0.3',
    'pink-500': '236, 72, 153, 0.4', 
    'pink-600': '219, 39, 119, 0.5',
    'purple-600': '147, 51, 234, 0.5',
    'red-500': '239, 68, 68, 0.4',
    'yellow-400': '250, 204, 21, 0.4'
  };

  const gradient = banner.bgGradient.replace(/from-|via-|to-/g, '').split(' ').map(color => {
    return colorMaps[color] || '255, 255, 255, 0.1';
  }).join(', ');

  return {
    background: `linear-gradient(135deg, ${gradient})`,
    border: isSelected ? '2px solid rgba(236, 72, 153, 1)' : '1px solid rgba(236, 72, 153, 0.3)'
  };
};

// Animation timing helpers
export const createAnimationSequence = async (steps: (() => Promise<void>)[]): Promise<void> => {
  for (const step of steps) {
    await step();
  }
};

// Sexiness level helpers
export const getSexinessLevel = (item: GachaItem): number => {
  return item.sexiness || 1;
};

export const getSexinessColor = (level: number): string => {
  const colors: { [key: number]: string } = {
    1: '#ec4899', // Pink
    2: '#8b5cf6', // Purple  
    3: '#f59e0b', // Orange
    4: '#ef4444', // Red
    5: '#22d3ee'  // Cyan
  };
  return colors[level] || colors[1];
};