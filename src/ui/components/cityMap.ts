import type { DistrictId, LandscapeId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { UpgradeCategory } from '../types';
import { assetImg, el } from '../utils/dom';
import { stackedTownScene } from './riversideMap';
import {
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  formatMaterials,
} from '../utils/format';

export interface IntegratedFacilitiesOverlay {
  packagingLevel: number;
  totalResearchRank: number;
  maxResearchRank: number;
  synergyCount: number;
  selectedCategory: UpgradeCategory;
  onSelectCategory: (cat: UpgradeCategory) => void;
}

export interface CityMapProps {
  economy: CityEconomy;
  selectedDistrictId: DistrictId;
  reducedMotion: boolean;
  onSelectDistrict: (districtId: DistrictId) => void;
  separateDistrictLabels?: boolean;
  integratedFacilities?: IntegratedFacilitiesOverlay;
  highlightDistrictId?: DistrictId | null;
  highlightFacilityCategory?: UpgradeCategory | null;
  overlayContent?: HTMLElement | null;
}

const DEFAULT_LABELS: Record<LandscapeId, Record<string, readonly [number, number]>> = {
  riverside: {
    residential: [19.5, 37], market: [57.5, 31], workshop: [82.5, 36], central_hub: [64.5, 54], packaging: [31.5, 55],
    research: [82.0, 52], synergy: [22.5, 71], park: [14.5, 93], station: [50.0, 85], harbor: [86.0, 90],
  },
  highland: {
    residential: [18.5, 30], market: [53.5, 30], workshop: [83.0, 36], central_hub: [62.0, 49], packaging: [30.0, 46],
    research: [83.0, 54], synergy: [19.5, 63], park: [19.0, 91], station: [48.5, 80], harbor: [86.0, 90],
  },
  seaside: {
    residential: [34.0, 37], market: [29.0, 54], workshop: [59.0, 47], central_hub: [44.0, 52], packaging: [51.0, 64],
    research: [16.0, 41], synergy: [40.5, 69], park: [24.0, 67], station: [52.0, 77], harbor: [74.0, 92],
  },
};

// Keep the home labels on the paths or open ground beside the illustrated districts.
const HOME_DISTRICT_LABELS: Record<LandscapeId, Record<DistrictId, readonly [number, number]>> = {
  riverside: { residential: [20, 44], market: [46, 38], workshop: [83, 43], park: [34, 91], station: [49, 92], harbor: [66, 86] },
  highland: { residential: [19, 37], market: [44, 37], workshop: [83, 43], park: [15, 58], station: [49, 88], harbor: [66, 88] },
  seaside: { residential: [55, 21], market: [12, 42], workshop: [76, 38], park: [23, 74], station: [51, 84], harbor: [75, 57] },
};

// Equipment maps also need space for four facility labels between the district illustrations.
const EQUIPMENT_MAP_LABELS: Record<LandscapeId, Record<string, readonly [number, number]>> = {
  riverside: {
    residential: [16, 44], market: [48, 38], workshop: [74, 8], park: [30, 91], station: [49, 92], harbor: [67, 86],
    central_hub: [64, 58], packaging: [36, 61], research: [91, 42], synergy: [27, 77],
  },
  highland: {
    residential: [12, 37], market: [45, 37], workshop: [75, 8], park: [35, 86], station: [51, 88], harbor: [69, 88],
    central_hub: [62, 55], packaging: [33, 53], research: [92.5, 42], synergy: [10, 67],
  },
  seaside: {
    residential: [45, 10], market: [12, 48], workshop: [71, 38], park: [23, 74], station: [51, 84], harbor: [81, 57],
    central_hub: [50, 33], packaging: [65, 56], research: [16, 20], synergy: [38, 75],
  },
};

export function renderCityMap(props: CityMapProps): HTMLElement {
  const {
    economy,
    selectedDistrictId,
    reducedMotion,
    onSelectDistrict,
    separateDistrictLabels = false,
    integratedFacilities,
    highlightDistrictId = null,
    highlightFacilityCategory = null,
    overlayContent = null,
  } = props;
  const hasOnboardSpotlight = Boolean(highlightDistrictId || highlightFacilityCategory);
  const equipmentLabels = integratedFacilities ? EQUIPMENT_MAP_LABELS[economy.landscape] : null;
  const labelPoint = (key: string) => (equipmentLabels ?? DEFAULT_LABELS[economy.landscape])[key];
  const mapContainer = el('div', {
    className: `kb-city-map${reducedMotion ? ' is-reduced-motion' : ''} is-patch-composited${hasOnboardSpotlight ? ' has-onboard-spotlight' : ''}`,
    role: 'region',
    'aria-label': '街の地図',
  });
  const spotlightPoint = labelPoint(highlightDistrictId ?? highlightFacilityCategory ?? '');
  if (spotlightPoint) {
    const [x, y] = spotlightPoint;
    mapContainer.style.setProperty('--kb-spotlight-x', `${x}%`);
    mapContainer.style.setProperty('--kb-spotlight-y', `${y}%`);
  }

  const scene = stackedTownScene(mapContainer, economy, hasOnboardSpotlight, reducedMotion);
  {
    const [x, y] = labelPoint('central_hub');
    const openDistricts = DISTRICT_ORDER.map((id) => economy.districts[id]).filter((d) => d.open);
    const avgStage =
      openDistricts.length > 0
        ? Math.max(1, Math.min(5, Math.round(openDistricts.reduce((s, d) => s + Math.max(1, d.stage), 0) / openDistricts.length)))
        : 1;
    const hubLabel = el(
      'div',
      {
        className: 'kb-map-hub kb-map-hub-pin-only',
        style: `left: ${x}%; top: ${y}%;`,
      },
      el('span', { className: 'kb-map-hub-label' }, '中央集配所'),
    );
    mapContainer.appendChild(hubLabel);
    scene.add('central_hub', avgStage, hubLabel);
  }

  // Layers 4-12: Districts, Scaffolds, Shops, Overlays, Terminals, Vehicles, DOM controls, Focus
  for (const dId of DISTRICT_ORDER) {
    const district = economy.districts[dId];
    const isSelected = selectedDistrictId === dId;
    const isOnboardTarget = highlightDistrictId === dId;

    // District visual box (Layers 4-8)
    const plotBox = el('div', {
      className: `kb-map-district-box${isSelected ? ' is-selected' : ''}${!district.open ? ' is-closed' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
    });
    const [labelX, labelY] = separateDistrictLabels
      ? HOME_DISTRICT_LABELS[economy.landscape][dId] : labelPoint(dId);
    const edge = 'var(--kb-map-label-edge, 0px)';
    plotBox.style.cssText = `left: ${labelX}%; top: clamp(${edge}, ${labelY}%, calc(100% - ${edge})); width: auto; height: auto; transform: translate(-50%, -50%);`;

    const nextStage = district.open && district.stage < 5 ? district.stage + 1 : null;
    const nextRequiredMicro =
      nextStage !== null ? economy.developmentCost(dId, nextStage).materialsMicro : 0n;
    const canUpgrade = nextStage !== null && district.stockMicro >= nextRequiredMicro;
    const upgradePct =
      nextRequiredMicro > 0n
        ? Math.min(100, Number((district.stockMicro * 100n) / nextRequiredMicro))
        : 0;

    // Layer 5: Ready-to-upgrade indicator
    if (canUpgrade && !equipmentLabels) {
      plotBox.appendChild(
        el(
          'div',
          {
            className: 'kb-map-scaffold-badge',
            title: `Lv.${nextStage}へアップグレード可能`,
          },
          el('span', {}, `Lv.${nextStage}可能`),
        ),
      );
    }

    const statusIcon = !district.open
      ? assetImg('./assets/ui_icon/ui_lock.svg', '未開通', { width: 14, height: 14 })
      : district.stage >= 5
        ? assetImg('./assets/ui_icon/ui_check.svg', '開発完了', { width: 14, height: 14 })
        : null;

    if (isOnboardTarget) {
      plotBox.appendChild(
        el(
          'div',
          {
            className: 'kb-map-onboard-badge',
            'data-testid': 'map-onboard-target-badge',
          },
          '▼ ここを選択',
        ),
      );
    }

    const districtBtn = el(
      'button',
      {
        type: 'button',
        className: `kb-map-district-btn${isSelected ? ' is-selected' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}${equipmentLabels && canUpgrade ? ' is-upgrade-ready' : ''}`,
        'aria-pressed': isSelected ? 'true' : 'false',
        'data-district-id': dId,
        'aria-haspopup': integratedFacilities ? 'dialog' : undefined,
        'data-testid': integratedFacilities ? `equipment-map-${dId}` : undefined,
        title: equipmentLabels && canUpgrade ? `Lv.${nextStage}へアップグレード可能` : undefined,
      },
      el(
        'span',
        { className: 'kb-map-district-title' },
        el('span', {}, DISTRICT_NAME_MAP[dId]),
        statusIcon,
        district.open ? el('span', { className: 'kb-map-stage-pill' }, `Lv.${district.stage}`) : null,
      ),
      district.open
        ? el(
            'span',
            {
              className: 'kb-map-district-stock',
              'data-testid': `map-district-stock-${dId}`,
            },
            nextStage !== null
              ? `資材 ${formatMaterials(district.stockMicro)} / ${formatMaterials(nextRequiredMicro)}`
              : `資材 ${formatMaterials(district.stockMicro)}`,
          )
        : null,
      nextStage !== null
        ? el(
            'div',
            {
              className: 'kb-map-mini-progress',
              title: `${formatMaterials(district.stockMicro)} / ${formatMaterials(nextRequiredMicro)}`,
            },
            el('div', { className: 'kb-map-mini-progress-fill', style: `width: ${upgradePct}%` }),
          )
        : null,
    );
    districtBtn.addEventListener('click', () => onSelectDistrict(dId));
    if (isOnboardTarget) {
      plotBox.addEventListener('click', (e) => {
        if (e.target !== districtBtn && !districtBtn.contains(e.target as Node)) {
          districtBtn.click();
        }
      });
    }
    plotBox.appendChild(districtBtn);
    mapContainer.appendChild(plotBox);
    scene.add(dId, district.open ? district.stage : 0, plotBox, districtBtn, true);
  }

  // Optional Integrated Town Facilities placed on real ground spots of the panoramic map
  if (integratedFacilities) {
    const makeMapFacility = (
      cat: UpgradeCategory,
      patchKey: 'packaging' | 'research' | 'synergy',
      label: string,
      sub: string,
      patchStage: number,
      active: boolean,
    ): HTMLElement => {
      const selected = integratedFacilities.selectedCategory === cat;
      const isOnboardTarget = highlightFacilityCategory === cat;
      const [x, y] = labelPoint(patchKey);
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-map-facility-pin is-patch-pin${selected ? ' is-selected' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
          style: `left: ${x}%; top: ${y}%;`,
          'aria-pressed': selected ? 'true' : 'false',
          'data-testid': `town-node-${cat}`, 'aria-haspopup': 'dialog',
        },
        el('span', { className: 'kb-map-facility-label' }, `${label} ${sub}`),
        isOnboardTarget ? el('span', {
          className: 'kb-map-onboard-badge', 'data-testid': 'map-onboard-target-badge', 'aria-hidden': 'true',
        }, '▼ ここを選択') : null,
      );
      btn.addEventListener('click', () => integratedFacilities.onSelectCategory(cat));
      scene.add(patchKey, patchStage, btn, btn, false, active ? patchStage : 0);
      return btn;
    };

    const pkgLv = integratedFacilities.packagingLevel;
    const pkgStage = pkgLv <= 1 ? 1 : pkgLv <= 3 ? 2 : pkgLv <= 6 ? 3 : pkgLv <= 10 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'packaging',
        'packaging',
        '荷づくり台',
        `Lv.${pkgLv}`,
        pkgStage,
        pkgLv > 0,
      ),
    );

    const resRank = integratedFacilities.totalResearchRank;
    const resStage = resRank <= 1 ? 1 : resRank <= 4 ? 2 : resRank <= 8 ? 3 : resRank <= 12 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'research',
        'research',
        '研究',
        `R${resRank}/${integratedFacilities.maxResearchRank}`,
        resStage,
        resRank > 0,
      ),
    );

    const synCount = integratedFacilities.synergyCount;
    const synStage = synCount === 0 ? 1 : synCount === 1 ? 3 : synCount === 2 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'synergy',
        'synergy',
        '連携',
        `${synCount}/3`,
        synStage,
        synCount > 0,
      ),
    );
  }

  if (overlayContent) {
    mapContainer.appendChild(overlayContent);
  }
  scene.load();

  // Keep exact 1376:768 terrain aspect ratio without overflowing parent container on window resize
  if (typeof requestAnimationFrame !== 'undefined') {
    const TARGET_RATIO = 1376 / 768;
    const syncSize = () => {
      const parent = mapContainer.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w <= 0 || h <= 0) return;
      if (w / h > TARGET_RATIO) {
        const fittedH = Math.floor(h);
        const fittedW = Math.floor(fittedH * TARGET_RATIO);
        mapContainer.style.width = `${fittedW}px`;
        mapContainer.style.height = `${fittedH}px`;
      } else {
        const fittedW = Math.floor(w);
        const fittedH = Math.floor(fittedW / TARGET_RATIO);
        mapContainer.style.width = `${fittedW}px`;
        mapContainer.style.height = `${fittedH}px`;
      }
      scene.refresh();
    };
    requestAnimationFrame(() => {
      syncSize();
      const parent = mapContainer.parentElement;
      if (parent && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (!mapContainer.isConnected) {
            ro.disconnect();
            return;
          }
          syncSize();
        });
        ro.observe(parent);
      }
    });
  }

  return mapContainer;
}
