import { CITY_CATALOG, ECONOMY_CONFIG } from '@/contracts/data';
import type { CourseId, DistrictId, LandscapeId, ResearchId, SynergyId, TopicId } from '@/contracts/types';
import { formatMicro, MICRO } from '@/economy/math';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { CityAchievementSnapshot } from '@/progression/achievementEngine';

export const COURSE_LABELS: Record<CourseId, string> = {
  relaxed: 'ゆったり',
  standard: 'ふつう',
  challenge: '挑戦',
};

export const COURSE_DESCRIPTIONS: Record<CourseId, string> = {
  relaxed: '短くて打ちやすいことば中心',
  standard: '日常のことばをバランスよく配達',
  challenge: '長いことばや促音・拗音に挑戦',
};

export const TOPIC_LABELS: Record<TopicId, string> = {
  daily: '日常',
  food: '食',
  living: '暮らし',
  town: '街',
  nature: '自然',
  people: '人',
};

export const LANDSCAPE_LABELS: Record<LandscapeId, string> = {
  riverside: '川沿いの街',
  seaside: '海辺の街',
  highland: '高原の街',
};

export const RESEARCH_LABELS: Record<ResearchId, string> = {
  materials: '資材研究',
  logistics: '物流研究',
  commerce: '商業研究',
};

export const DISTRICT_ORDER: readonly DistrictId[] = [
  'residential',
  'market',
  'workshop',
  'park',
  'station',
  'harbor',
];

export const DISTRICT_NAME_MAP: Record<DistrictId, string> = Object.fromEntries(
  CITY_CATALOG.districts.map((d) => [d.id as DistrictId, d.name]),
) as Record<DistrictId, string>;

export const SYNERGY_NAME_MAP: Record<SynergyId, string> = Object.fromEntries(
  ECONOMY_CONFIG.synergies.map((s) => [s.id as SynergyId, s.name]),
) as Record<SynergyId, string>;

export function formatCoins(micro: bigint | string): string {
  const val = typeof micro === 'string' ? BigInt(micro) : micro;
  const whole = val / MICRO;
  return whole.toLocaleString('ja-JP');
}

export function formatMaterials(micro: bigint | string): string {
  const val = typeof micro === 'string' ? BigInt(micro) : micro;
  const whole = val / MICRO;
  return whole.toLocaleString('ja-JP');
}

export function formatMaterialsRemaining(micro: bigint | string): string {
  const val = typeof micro === 'string' ? BigInt(micro) : micro;
  if (val <= 0n) {
    return '0';
  }
  const ceilWhole = (val + MICRO - 1n) / MICRO;
  return ceilWhole.toLocaleString('ja-JP');
}

export function formatRatePerSec(perSecondMicro: bigint | string): string {
  const val = typeof perSecondMicro === 'string' ? BigInt(perSecondMicro) : perSecondMicro;
  return `${formatMicro(val, MICRO)}/s`;
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}時間${minutes}分${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

export function formatCountdownSec(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '∞';
  }
  const sec = Math.max(0, ms / 1000);
  return `${sec.toFixed(1)}秒`;
}

export function buildCityAchievementSnapshot(
  economy: CityEconomy,
  paidEquipmentPurchaseCount: number,
  seriesEligible = true,
): CityAchievementSnapshot {
  const snap = economy.snapshot();
  const districts = {} as CityAchievementSnapshot['districts'];
  let openedRoutesCount = 0;
  let railRoutesCount = 0;

  for (const dId of DISTRICT_ORDER) {
    const d = snap.districts[dId];
    districts[dId] = { stage: d.stage, shops: d.shops, crews: d.crews };
    if (d.open) {
      openedRoutesCount += 1;
    }
    if (d.railway) {
      railRoutesCount += 1;
    }
  }

  return {
    districts,
    seriesEligible,
    openedRoutesCount,
    railRoutesCount,
    currentCityArrivedMaterials: Number(BigInt(snap.city_arrived_micro) / MICRO),
    lifetimeArrivedMaterials: Number(BigInt(snap.lifetime.arrived_micro) / MICRO),
    paidEquipmentPurchaseCount,
    packagingLevel: snap.packaging_level,
    purchasedSynergies: [...snap.synergies],
    cityRestartCount: snap.lifetime.cities_restarted,
    researchRanks: { ...snap.research },
  };
}

export interface AffordableUpgradeFlags {
  packaging: boolean;
  crews: boolean;
  shops: boolean;
  any: boolean;
}

export function getAffordableUpgradeFlags(
  economy: CityEconomy,
  districtId: DistrictId,
): AffordableUpgradeFlags {
  const packaging = economy.quotePurchase('packaging', 1, null).count > 0;
  const district = economy.districts[districtId];
  const crews = district.open ? economy.quotePurchase('crews', 1, districtId).count > 0 : false;
  const shops = district.open ? economy.quotePurchase('shops', 1, districtId).count > 0 : false;
  return {
    packaging,
    crews,
    shops,
    any: packaging || crews || shops,
  };
}

/**
 * Resolves the raster diorama sprite path for a district at a given stage,
 * showing construction scaffolding when stage 0 has an active build plan.
 */
export function getDistrictBuildingSprite(
  districtId: DistrictId,
  stage: number,
  hasActivePlan = false,
): string {
  if (stage <= 0) {
    return hasActivePlan ? './assets/sprites/city_scaffold.png' : './assets/sprites/city_plot.png';
  }
  const clampedStage = Math.min(5, Math.max(1, Math.floor(stage)));
  return `./assets/sprites/buildings/${districtId}_stage${clampedStage}.png`;
}

/**
 * Resolves the cropped standalone diorama sprite path for a district or hub facility.
 */
export function getDioramaBuildingSprite(
  key: DistrictId | 'central_hub' | 'packaging',
  stage: number,
  hasActivePlan = false,
): string {
  if (stage <= 0 && key !== 'central_hub' && key !== 'packaging') {
    return hasActivePlan ? './assets/sprites/city_scaffold.png' : './assets/sprites/city_plot.png';
  }
  const clampedStage = Math.min(5, Math.max(1, Math.floor(stage)));
  return `./assets/sprites/diorama/${key}_stage${clampedStage}.png`;
}

/**
 * Resolves the representative shop raster sprite path for a district.
 */
export function getDistrictShopSprite(districtId: DistrictId): string {
  return `./assets/sprites/shop_${districtId}.png`;
}

/**
 * Resolves the background-included watercolor raster image path for a destination district.
 */
export function getDestinationRasterSprite(
  districtId: DistrictId,
  stage: number,
): string {
  if (stage <= 0) {
    return './assets/raster/scenic_plot.jpg';
  }
  return `./assets/raster/scenic_${districtId}.jpg`;
}
