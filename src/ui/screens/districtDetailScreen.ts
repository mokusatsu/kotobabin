import { CITY_CATALOG, ECONOMY_CONFIG } from '@/contracts/data';
import type { DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { UIControllerActions } from '../types';
import { assetImg, el } from '../utils/dom';
import {
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  formatCoins,
  formatMaterials,
  formatMaterialsRemaining,
  formatRatePerSec,
  getDistrictBuildingSprite,
} from '../utils/format';

export interface DistrictDetailScreenProps {
  economy: CityEconomy;
  selectedDistrictId: DistrictId;
  actions: UIControllerActions;
}

export function renderDistrictDetailScreen(props: DistrictDetailScreenProps): HTMLElement {
  const { economy, selectedDistrictId, actions } = props;
  const district = economy.districts[selectedDistrictId];
  const dCatalog = CITY_CATALOG.districts.find((d) => d.id === selectedDistrictId);
  const stageEntry = dCatalog?.stage_entries.find((s) => s.stage === district.stage);
  const nextStage = district.stage < 5 ? district.stage + 1 : null;
  const nextStageEntry = nextStage ? dCatalog?.stage_entries.find((s) => s.stage === nextStage) : undefined;
  const nextDevCost = nextStage ? economy.developmentCost(selectedDistrictId, nextStage) : null;

  const backBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, '← 街の設備へ戻る'),
  );
  backBtn.addEventListener('click', () => actions.navigate('UPGRADES'));

  const districtTabs = el(
    'div',
    { className: 'kb-row-wrap' },
    ...DISTRICT_ORDER.map((dId) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${dId === selectedDistrictId ? ' is-selected' : ''}`,
        },
        DISTRICT_NAME_MAP[dId],
      );
      btn.addEventListener('click', () => actions.selectDistrict(dId));
      return btn;
    }),
  );

  // Upgrade section
  let upgradeControls: HTMLElement;
  if (!district.open) {
    const totalStageSum = DISTRICT_ORDER.reduce((sum, id) => sum + economy.districts[id].stage, 0);
    const reqSum = dCatalog?.opening_stage_sum ?? 0;
    const canOpen = totalStageSum >= reqSum;
    const openBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', disabled: !canOpen },
      `地区を開通する（Lv合計 ${reqSum} / 現在 ${totalStageSum}）`,
    );
    openBtn.addEventListener('click', () => actions.openDistrict(selectedDistrictId));
    upgradeControls = el('div', { className: 'kb-stack-sm' }, el('p', {}, 'この地区はまだ未開通です。'), openBtn);
  } else if (nextStage && nextDevCost) {
    const requiredMicro = nextDevCost.materialsMicro;
    const pct = requiredMicro > 0n ? Math.min(100, Number((district.stockMicro * 100n) / requiredMicro)) : 0;
    const canUpgrade = district.stockMicro >= requiredMicro;
    const upgradeBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', disabled: !canUpgrade },
      canUpgrade
        ? `Lv.${nextStage} へアップグレード（${formatMaterials(requiredMicro)} 資材）`
        : `資材が到着するとアップグレードできます（あと ${formatMaterialsRemaining(requiredMicro - district.stockMicro)}）`,
    );
    upgradeBtn.addEventListener('click', () => actions.upgradeDistrict(selectedDistrictId));
    upgradeControls = el(
      'div',
      { className: 'kb-stack-sm' },
      el('p', {}, `次の目標: Lv.${nextStage}「${nextStageEntry?.stage_name ?? ''}」`),
      el('div', { className: 'kb-small' }, `到着済み在庫: ${formatMaterials(district.stockMicro)} / 必要資材: ${formatMaterials(requiredMicro)}`),
      el('div', { className: 'kb-progress-track' }, el('div', { className: 'kb-progress-fill', style: `width: ${pct}%` })),
      upgradeBtn,
    );
  } else {
    upgradeControls = el('div', { className: 'kb-banner-info' }, 'Lv.5・開発完了しました！');
  }

  // Railway 4-condition checklist (coins only)
  const railCfg = ECONOMY_CONFIG.railway;
  const dCfg = ECONOMY_CONFIG.districts.find((d) => d.id === selectedDistrictId)!;
  const railCoins = BigInt(railCfg.base_coins) * BigInt(dCfg.cost_multiplier) * economy.unit;
  const railChecks = [
    { label: '地区が開通済み', ok: district.open },
    { label: `開発Lv.${railCfg.minimum_stage} 以上（現在 Lv.${district.stage}）`, ok: district.stage >= railCfg.minimum_stage },
    { label: `配送班 ${railCfg.minimum_crews}班 以上（現在 ${district.crews}班）`, ok: district.crews >= railCfg.minimum_crews },
    { label: `コイン ${formatCoins(railCoins)}`, ok: economy.coinsMicro >= railCoins },
  ];
  const canBuyRail = !district.railway && railChecks.every((c) => c.ok);
  const railBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-primary', disabled: !canBuyRail },
    district.railway ? '貨物鉄道 開通済み' : '貨物鉄道を開通する',
  );
  railBtn.addEventListener('click', () => actions.buyRailway(selectedDistrictId));

  // New City Prestige check
  const newCityPreview = economy.newCityPreview();
  const newCityBtn = economy.adjacentCity(1) === null ? el(
    'button',
    { type: 'button', className: newCityPreview.eligible ? 'kb-btn-primary' : 'kb-btn-secondary' },
    el('span', {}, newCityPreview.eligible ? `新しい街へ出発（設計図 +${newCityPreview.reward_blueprints}枚）` : '新しい街（条件確認）'),
  ) : null;
  newCityBtn?.addEventListener('click', () => actions.navigate('NEW_CITY'));

  return el(
    'div',
    { className: 'kb-stack-md' },
    el('div', { className: 'kb-row-between' }, backBtn, newCityBtn),
    districtTabs,
    el(
      'div',
      { className: 'kb-grid-result' },
      el(
        'section',
        { className: 'kb-card kb-stack-md' },
        el(
          'div',
          {},
          el('h2', { className: 'kb-h2' }, `${DISTRICT_NAME_MAP[selectedDistrictId]} — Lv.${district.stage} / 5`),
          el('span', { className: 'kb-secondary kb-small' }, stageEntry?.stage_name ?? ''),
        ),
        assetImg(
          getDistrictBuildingSprite(selectedDistrictId, district.stage, false),
          DISTRICT_NAME_MAP[selectedDistrictId],
          { className: 'kb-detail-art' },
        ),
        el(
          'dl',
          { className: 'kb-stat-list' },
          el('dt', {}, '輸送待ち資材'),
          el('dd', {}, formatMaterials(district.queueMicro)),
          el('dt', {}, '到着済み在庫'),
          el('dd', {}, formatMaterials(district.stockMicro)),
          el('dt', {}, '累計到着資材'),
          el('dd', {}, formatMaterials(district.arrivedMicro)),
          el('dt', {}, '輸送速度 / 店舗収益'),
          el('dd', {}, `${formatRatePerSec(economy.transportPerSecondMicro(selectedDistrictId))} / ${formatRatePerSec(economy.shopIncomePerSecondMicro(selectedDistrictId))}`),
        ),
      ),
      el(
        'section',
        { className: 'kb-stack-md' },
        el('div', { className: 'kb-card kb-stack-sm' }, el('h3', { className: 'kb-h3' }, '地区のアップグレード'), upgradeControls),
        el(
          'div',
          { className: 'kb-card kb-stack-sm' },
          el('h3', { className: 'kb-h3' }, '貨物鉄道の開通条件'),
          el(
            'ul',
            { className: 'kb-checklist' },
            ...railChecks.map((c) =>
              el(
                'li',
                { className: c.ok ? 'is-met' : '' },
                assetImg(c.ok ? './assets/ui_icon/ui_check.svg' : './assets/ui_icon/ui_lock.svg', '', { decorative: true, width: 16, height: 16 }),
                el('span', {}, c.label),
              ),
            ),
          ),
          railBtn,
        ),
      ),
    ),
  );
}
