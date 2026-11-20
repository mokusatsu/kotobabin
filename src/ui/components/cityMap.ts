import { CITY_CATALOG } from '@/contracts/data';
import type { DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { UpgradeCategory } from '../types';
import { assetImg, el } from '../utils/dom';
import {
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  formatMaterials,
  getDistrictBuildingSprite,
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
  integratedFacilities?: IntegratedFacilitiesOverlay;
  highlightDistrictId?: DistrictId | null;
  highlightFacilityCategory?: UpgradeCategory | null;
  overlayContent?: HTMLElement | null;
}

interface PatchRect {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  labelLeftPct: number;
  labelTopPct: number;
}

const RIVERSIDE_PATCH_RECTS: Record<string, PatchRect> = {
  residential: { leftPct: 5, topPct: 8, widthPct: 29, heightPct: 29, labelLeftPct: 19.5, labelTopPct: 37 },
  market:      { leftPct: 44, topPct: 9, widthPct: 26, heightPct: 22, labelLeftPct: 57.5, labelTopPct: 31 },
  workshop:    { leftPct: 68, topPct: 9, widthPct: 28, heightPct: 27, labelLeftPct: 82.5, labelTopPct: 36 },
  central_hub: { leftPct: 55, topPct: 31, widthPct: 19, heightPct: 23, labelLeftPct: 64.5, labelTopPct: 54 },
  packaging:   { leftPct: 21, topPct: 37, widthPct: 20, heightPct: 18, labelLeftPct: 31.5, labelTopPct: 55 },
  research:    { leftPct: 74, topPct: 36, widthPct: 16, heightPct: 16, labelLeftPct: 82.0, labelTopPct: 52 },
  synergy:     { leftPct: 15, topPct: 54, widthPct: 15, heightPct: 17, labelLeftPct: 22.5, labelTopPct: 71 },
  park:        { leftPct: 5, topPct: 72, widthPct: 19, heightPct: 23, labelLeftPct: 14.5, labelTopPct: 93 },
  station:     { leftPct: 36, topPct: 54, widthPct: 28, heightPct: 31, labelLeftPct: 50.0, labelTopPct: 85 },
  harbor:      { leftPct: 74, topPct: 49, widthPct: 24, heightPct: 43, labelLeftPct: 86.0, labelTopPct: 90 },
};

const HIGHLAND_PATCH_RECTS: Record<string, PatchRect> = {
  residential: { leftPct: 5, topPct: 7, widthPct: 27, heightPct: 23, labelLeftPct: 18.5, labelTopPct: 30 },
  market:      { leftPct: 39, topPct: 9, widthPct: 29, heightPct: 21, labelLeftPct: 53.5, labelTopPct: 30 },
  workshop:    { leftPct: 69, topPct: 9, widthPct: 28, heightPct: 27, labelLeftPct: 83.0, labelTopPct: 36 },
  central_hub: { leftPct: 52, topPct: 25, widthPct: 20, heightPct: 25, labelLeftPct: 62.0, labelTopPct: 49 },
  packaging:   { leftPct: 19, topPct: 29, widthPct: 22, heightPct: 18, labelLeftPct: 30.0, labelTopPct: 46 },
  research:    { leftPct: 73, topPct: 34, widthPct: 20, heightPct: 21, labelLeftPct: 83.0, labelTopPct: 54 },
  synergy:     { leftPct: 9, topPct: 44, widthPct: 21, heightPct: 19, labelLeftPct: 19.5, labelTopPct: 63 },
  park:        { leftPct: 6, topPct: 66, widthPct: 26, heightPct: 27, labelLeftPct: 19.0, labelTopPct: 91 },
  station:     { leftPct: 33, topPct: 52, widthPct: 31, heightPct: 29, labelLeftPct: 48.5, labelTopPct: 80 },
  harbor:      { leftPct: 74, topPct: 56, widthPct: 24, heightPct: 36, labelLeftPct: 86.0, labelTopPct: 90 },
};

const SEASIDE_PATCH_RECTS: Record<string, PatchRect> = {
  residential: { leftPct: 23, topPct: 15, widthPct: 22, heightPct: 22, labelLeftPct: 34.0, labelTopPct: 37 },
  market:      { leftPct: 21, topPct: 38, widthPct: 16, heightPct: 16, labelLeftPct: 29.0, labelTopPct: 54 },
  workshop:    { leftPct: 51, topPct: 28, widthPct: 16, heightPct: 19, labelLeftPct: 59.0, labelTopPct: 47 },
  central_hub: { leftPct: 36, topPct: 34, widthPct: 16, heightPct: 18, labelLeftPct: 44.0, labelTopPct: 52 },
  packaging:   { leftPct: 43, topPct: 48, widthPct: 16, heightPct: 16, labelLeftPct: 51.0, labelTopPct: 64 },
  research:    { leftPct: 9, topPct: 26, widthPct: 14, heightPct: 15, labelLeftPct: 16.0, labelTopPct: 41 },
  synergy:     { leftPct: 34, topPct: 53, widthPct: 13, heightPct: 16, labelLeftPct: 40.5, labelTopPct: 69 },
  park:        { leftPct: 16, topPct: 48, widthPct: 16, heightPct: 19, labelLeftPct: 24.0, labelTopPct: 67 },
  station:     { leftPct: 42, topPct: 59, widthPct: 20, heightPct: 18, labelLeftPct: 52.0, labelTopPct: 77 },
  harbor:      { leftPct: 60, topPct: 64, widthPct: 28, heightPct: 30, labelLeftPct: 74.0, labelTopPct: 92 },
};

const PATCH_RECTS_BY_LANDSCAPE: Record<string, Record<string, PatchRect>> = {
  riverside: RIVERSIDE_PATCH_RECTS,
  highland: HIGHLAND_PATCH_RECTS,
  seaside: SEASIDE_PATCH_RECTS,
};

function getBuildingSpriteSrc(facility: string, stage: number): string {
  const clamped = Math.max(1, Math.min(5, Math.floor(stage)));
  return `./assets/sprites/buildings/${facility}_stage${clamped}.png`;
}

function patchImg(src: string, alt: string, rect: PatchRect): HTMLImageElement {
  const img = assetImg(src, alt, { className: 'kb-map-patch-img' });
  img.style.left = `${rect.leftPct}%`;
  img.style.top = `${rect.topPct}%`;
  img.style.width = `${rect.widthPct}%`;
  img.style.height = `${rect.heightPct}%`;
  return img;
}

export function renderCityMap(props: CityMapProps): HTMLElement {
  const {
    economy,
    selectedDistrictId,
    reducedMotion,
    onSelectDistrict,
    integratedFacilities,
    highlightDistrictId = null,
    highlightFacilityCategory = null,
    overlayContent = null,
  } = props;
  const layout = CITY_CATALOG.map_layout;
  const canvasW = layout.canvas.width; // 1600
  const canvasH = layout.canvas.height; // 1000
  const scale = layout.scale;
  const srcAnchor = layout.source_anchor;
  const displaySize = layout.display_size;

  const patchRects = PATCH_RECTS_BY_LANDSCAPE[economy.landscape];
  const isPatchComposited = Boolean(patchRects);
  const hasOnboardSpotlight = Boolean(highlightDistrictId || highlightFacilityCategory);
  const mapContainer = el('div', {
    className: `kb-city-map${reducedMotion ? ' is-reduced-motion' : ''}${isPatchComposited ? ' is-patch-composited' : ''}${hasOnboardSpotlight ? ' has-onboard-spotlight' : ''}`,
    role: 'region',
    'aria-label': '街の地図',
  });
  const spotlightRect = patchRects?.[highlightDistrictId ?? highlightFacilityCategory ?? ''];
  if (spotlightRect) {
    mapContainer.style.setProperty('--kb-spotlight-x', `${spotlightRect.labelLeftPct}%`);
    mapContainer.style.setProperty('--kb-spotlight-y', `${spotlightRect.labelTopPct}%`);
  }

  // Layer 1: Terrain background
  const terrainSrc = `./assets/raster/terrain_${economy.landscape}.jpg`;
  const terrainLayer = el(
    'div',
    { className: 'kb-map-layer kb-map-terrain' },
    assetImg(terrainSrc, '', {
      decorative: true,
      fallbackSrc: './assets/raster/terrain_riverside.jpg',
    }),
  );
  mapContainer.appendChild(terrainLayer);

  // Route SVG lines intentionally omitted: terrain artwork already depicts paths, bridges, and tracks.
  const hubAnchor = layout.central_depot_anchor;

  // Layer 3: Central hub
  if (patchRects) {
    const hubRect = patchRects.central_hub;
    const openDistricts = DISTRICT_ORDER.map((id) => economy.districts[id]).filter((d) => d.open);
    const avgStage =
      openDistricts.length > 0
        ? Math.max(1, Math.min(5, Math.round(openDistricts.reduce((s, d) => s + Math.max(1, d.stage), 0) / openDistricts.length)))
        : 1;
    mapContainer.appendChild(
      patchImg(getBuildingSpriteSrc('central_hub', avgStage), '中央集配所', hubRect),
    );
    mapContainer.appendChild(
      el(
        'div',
        {
          className: 'kb-map-hub kb-map-hub-pin-only',
          style: `left: ${hubRect.labelLeftPct}%; top: ${hubRect.labelTopPct}%;`,
        },
        el('span', { className: 'kb-map-hub-label' }, '中央集配所'),
      ),
    );
  } else {
    const hubEl = el(
      'div',
      {
        className: 'kb-map-hub',
        style: `left: ${(hubAnchor.x / canvasW) * 100}%; top: ${(hubAnchor.y / canvasH) * 100}%;`,
      },
      assetImg('./assets/sprites/city_hub.png', '中央集配所', { className: 'kb-map-hub-img' }),
      el('span', { className: 'kb-map-hub-label' }, '中央集配所'),
    );
    mapContainer.appendChild(hubEl);
  }

  // Layers 4-12: Districts, Scaffolds, Shops, Overlays, Terminals, Vehicles, DOM controls, Focus
  for (const dId of DISTRICT_ORDER) {
    const district = economy.districts[dId];
    const anchor = layout.anchors[dId];
    const leftMap = anchor.x - srcAnchor.x * scale;
    const topMap = anchor.y - srcAnchor.y * scale;
    const leftPct = (leftMap / canvasW) * 100;
    const topPct = (topMap / canvasH) * 100;
    const widthPct = (displaySize.width / canvasW) * 100;
    const heightPct = (displaySize.height / canvasH) * 100;

    const isSelected = selectedDistrictId === dId;
    const isOnboardTarget = highlightDistrictId === dId;

    // District visual box (Layers 4-8)
    const plotBox = el('div', {
      className: `kb-map-district-box${isSelected ? ' is-selected' : ''}${!district.open ? ' is-closed' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
      style: `left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%;`,
    });

    // Layer 4: District building / empty plot
    if (patchRects) {
      const rect = patchRects[dId];
      if (district.stage >= 1 && rect && rect.widthPct > 0) {
        mapContainer.appendChild(
          patchImg(getBuildingSpriteSrc(dId, district.stage), `${DISTRICT_NAME_MAP[dId]} Lv.${district.stage}`, rect),
        );
      }
      if (rect) {
        plotBox.setAttribute(
          'style',
          `left: ${rect.labelLeftPct}%; top: ${rect.labelTopPct}%; width: auto; height: auto; transform: translate(-50%, -50%);`,
        );
      }
    } else {
      const buildingImg = assetImg(
        getDistrictBuildingSprite(dId, district.stage),
        `${DISTRICT_NAME_MAP[dId]} Lv.${district.stage}`,
        { className: 'kb-map-building-img' },
      );
      plotBox.appendChild(buildingImg);
    }

    const nextStage = district.open && district.stage < 5 ? district.stage + 1 : null;
    const nextRequiredMicro =
      nextStage !== null ? economy.developmentCost(dId, nextStage).materialsMicro : 0n;
    const canUpgrade = nextStage !== null && district.stockMicro >= nextRequiredMicro;
    const upgradePct =
      nextRequiredMicro > 0n
        ? Math.min(100, Number((district.stockMicro * 100n) / nextRequiredMicro))
        : 0;

    // Layer 5: Ready-to-upgrade indicator
    if (canUpgrade && nextStage !== null) {
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
        className: `kb-map-district-btn${isSelected ? ' is-selected' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
        'aria-pressed': isSelected ? 'true' : 'false',
        'data-district-id': dId,
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
    districtBtn.addEventListener('click', () => {
      onSelectDistrict(dId);
      if (integratedFacilities) {
        integratedFacilities.onSelectCategory('architecture');
      }
    });
    if (isOnboardTarget) {
      plotBox.addEventListener('click', (e) => {
        if (e.target !== districtBtn && !districtBtn.contains(e.target as Node)) {
          districtBtn.click();
        }
      });
    }
    plotBox.appendChild(districtBtn);
    mapContainer.appendChild(plotBox);
  }

  // Optional Integrated Town Facilities placed on real ground spots of the panoramic map
  if (integratedFacilities) {
    const makeMapFacility = (
      cat: UpgradeCategory,
      patchKey: 'packaging' | 'research' | 'synergy',
      fallbackLeftPct: number,
      fallbackTopPct: number,
      spriteSrc: string,
      label: string,
      sub: string,
      patchStage: number,
    ): HTMLElement => {
      const selected = integratedFacilities.selectedCategory === cat;
      const isOnboardTarget = highlightFacilityCategory === cat;
      if (patchRects) {
        const rect = patchRects[patchKey];
        if (rect.widthPct > 0) {
          mapContainer.appendChild(
            patchImg(getBuildingSpriteSrc(patchKey, patchStage), label, rect),
          );
        }
        const btn = el(
          'button',
          {
            type: 'button',
            className: `kb-map-facility-pin is-patch-pin${selected ? ' is-selected' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
            style: `left: ${rect.labelLeftPct}%; top: ${rect.labelTopPct}%;`,
            'aria-pressed': selected ? 'true' : 'false',
            'data-testid': `town-node-${cat}`,
          },
          el('span', { className: 'kb-map-facility-label' }, `${label} ${sub}`),
          isOnboardTarget ? el('span', {
            className: 'kb-map-onboard-badge', 'data-testid': 'map-onboard-target-badge', 'aria-hidden': 'true',
          }, '▼ ここを選択') : null,
        );
        btn.addEventListener('click', () => integratedFacilities.onSelectCategory(cat));
        return btn;
      }

      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-map-facility-pin${selected ? ' is-selected' : ''}${isOnboardTarget ? ' is-onboard-target' : ''}`,
          style: `left: ${fallbackLeftPct}%; top: ${fallbackTopPct}%;`,
          'aria-pressed': selected ? 'true' : 'false',
          'data-testid': `town-node-${cat}`,
        },
        assetImg(spriteSrc, label, { className: 'kb-map-facility-img' }),
        el('span', { className: 'kb-map-facility-label' }, `${label} ${sub}`),
        isOnboardTarget ? el('span', {
          className: 'kb-map-onboard-badge', 'data-testid': 'map-onboard-target-badge', 'aria-hidden': 'true',
        }, '▼ ここを選択') : null,
      );
      btn.addEventListener('click', () => integratedFacilities.onSelectCategory(cat));
      return btn;
    };

    const pkgLv = integratedFacilities.packagingLevel;
    const pkgStage = pkgLv <= 1 ? 1 : pkgLv <= 3 ? 2 : pkgLv <= 6 ? 3 : pkgLv <= 10 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'packaging',
        'packaging',
        36,
        48,
        getBuildingSpriteSrc('packaging', pkgStage),
        '荷づくり台',
        `Lv.${pkgLv}`,
        pkgStage,
      ),
    );

    const resRank = integratedFacilities.totalResearchRank;
    const resStage = resRank <= 1 ? 1 : resRank <= 4 ? 2 : resRank <= 8 ? 3 : resRank <= 12 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'research',
        'research',
        86,
        43,
        getBuildingSpriteSrc('research', resStage),
        '研究',
        `R${resRank}/${integratedFacilities.maxResearchRank}`,
        resStage,
      ),
    );

    const synCount = integratedFacilities.synergyCount;
    const synStage = synCount === 0 ? 1 : synCount === 1 ? 3 : synCount === 2 ? 4 : 5;
    mapContainer.appendChild(
      makeMapFacility(
        'synergy',
        'synergy',
        29,
        86,
        getBuildingSpriteSrc('synergy', synStage),
        '連携',
        `${synCount}/3`,
        synStage,
      ),
    );
  }

  if (overlayContent) {
    mapContainer.appendChild(overlayContent);
  }

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
