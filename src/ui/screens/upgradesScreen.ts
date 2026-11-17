import { CITY_CATALOG, ECONOMY_CONFIG } from '@/contracts/data';
import type { DistrictId, ResearchId, SynergyId } from '@/contracts/types';
import type { CityEconomy, EquipmentKind, PurchaseQuantity } from '@/economy/cityEconomy';
import type { UIControllerActions, UpgradeCategory } from '../types';
import { renderCityMap } from '../components/cityMap';
import { el } from '../utils/dom';
import {
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  formatCoins,
  formatMaterials,
  formatMaterialsRemaining,
  formatRatePerSec,
  getAffordableUpgradeFlags,
} from '../utils/format';

export interface UpgradesScreenProps {
  economy: CityEconomy;
  selectedDistrictId: DistrictId;
  selectedCategory: UpgradeCategory;
  quantity: PurchaseQuantity;
  actions: UIControllerActions;
}

const QUANTITIES: readonly { value: PurchaseQuantity; label: string }[] = [
  { value: 1, label: '1' },
  { value: 10, label: '10' },
  { value: 'max', label: '買えるだけ' },
];

function formatRatio(r: { numerator: number; denominator: number }): string {
  return `${(r.numerator / r.denominator).toFixed(2)}倍`;
}

function renderArchitectureDock(
  economy: CityEconomy,
  districtId: DistrictId,
  actions: UIControllerActions,
): HTMLElement {
  const district = economy.districts[districtId];
  const dCfg = CITY_CATALOG.districts.find((d) => d.id === districtId)!;
  const stageEntry = dCfg.stage_entries.find((s) => s.stage === district.stage);
  const stageCfg = ECONOMY_CONFIG.development.stages.find((s) => s.stage === district.stage);

  const detailBtn = el('button', { type: 'button', className: 'kb-btn-secondary' }, '全Lvと詳細を見る');
  detailBtn.addEventListener('click', () => actions.navigate('DISTRICT_DETAIL'));

  if (!district.open) {
    const totalStage = DISTRICT_ORDER.reduce((sum, id) => sum + economy.districts[id].stage, 0);
    const canOpen = totalStage >= dCfg.opening_stage_sum;
    const openBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', disabled: !canOpen },
      '開通する（無料）',
    );
    openBtn.addEventListener('click', () => actions.openDistrict(districtId));

    return el(
      'div',
      { className: 'kb-town-dock-inner' },
      el(
        'div',
        { className: 'kb-town-dock-info' },
        el('strong', {}, `${DISTRICT_NAME_MAP[districtId]} — 未開通`),
        el(
          'div',
          { className: 'kb-small kb-secondary' },
          `開通条件: 全地区Lv合計 ${dCfg.opening_stage_sum} 以上（現在 ${totalStage}）`,
        ),
      ),
      el('div', { className: 'kb-town-dock-actions' }, openBtn, detailBtn),
    );
  }

  let primaryControl: HTMLElement;
  let statusEl: HTMLElement;

  if (district.stage >= 5) {
    statusEl = el(
      'div',
      { className: 'kb-small kb-secondary' },
      el('span', {}, `最高Lv.5（${stageEntry?.stage_name ?? '完成'}）に到達しています！ `),
      el('span', { className: 'kb-nowrap' }, `店舗上限 ${stageCfg?.shop_cap ?? 50}`),
    );
    primaryControl = el('button', { type: 'button', className: 'kb-btn-secondary', disabled: true }, 'Lv.5 完成済み');
  } else {
    const nextStage = district.stage + 1;
    const nextEntry = dCfg.stage_entries.find((s) => s.stage === nextStage);
    const nextStageCfg = ECONOMY_CONFIG.development.stages.find((s) => s.stage === nextStage);
    const econDistCfg = ECONOMY_CONFIG.districts.find((d) => d.id === districtId);
    const reqMatMicro =
      nextStageCfg && econDistCfg
        ? BigInt(nextStageCfg.base_materials_micro) * BigInt(econDistCfg.cost_multiplier)
        : 0n;
    const canUpgrade = district.stockMicro >= reqMatMicro;
    statusEl = el(
      'div',
      { className: 'kb-small kb-secondary' },
      el('span', {}, `次のアップグレード: Lv.${nextStage}「${nextEntry?.stage_name ?? ''}」（`),
      el('span', { className: 'kb-nowrap' }, `到着済み ${formatMaterials(district.stockMicro)}`),
      ' / ',
      el('span', { className: 'kb-nowrap' }, `必要資材 ${formatMaterials(reqMatMicro)}`),
      '・',
      el('span', { className: 'kb-nowrap' }, `店舗上限 ${nextStageCfg?.shop_cap ?? 0}`),
      '）',
    );
    primaryControl = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', disabled: !canUpgrade },
      canUpgrade ? `Lv.${nextStage} へアップグレード` : `資材不足（あと ${formatMaterialsRemaining(reqMatMicro - district.stockMicro)}）`,
    );
    primaryControl.addEventListener('click', () => actions.upgradeDistrict(districtId));
  }

  return el(
    'div',
    { className: 'kb-town-dock-inner' },
    el(
      'div',
      { className: 'kb-town-dock-info' },
      el('strong', {}, `${DISTRICT_NAME_MAP[districtId]} — 街並み Lv.${district.stage} / 5`),
      statusEl,
    ),
    el('div', { className: 'kb-town-dock-actions' }, primaryControl, detailBtn),
  );
}

function renderEquipmentDock(
  kind: EquipmentKind,
  economy: CityEconomy,
  districtId: DistrictId,
  quantity: PurchaseQuantity,
  actions: UIControllerActions,
): HTMLElement {
  const district = economy.districts[districtId];
  const title =
    kind === 'packaging'
      ? '荷づくり台（資材生産倍率）'
      : kind === 'crews'
        ? `${DISTRICT_NAME_MAP[districtId]} の配送班`
        : `${DISTRICT_NAME_MAP[districtId]} の店舗`;

  if (kind !== 'packaging' && !district.open) {
    return el(
      'div',
      { className: 'kb-town-dock-inner' },
      el(
        'div',
        { className: 'kb-town-dock-info' },
        el('strong', {}, title),
        el('div', { className: 'kb-small kb-accent' }, `${DISTRICT_NAME_MAP[districtId]} を開通すると強化できます。`),
      ),
      el('div', { className: 'kb-town-dock-actions' }),
    );
  }

  const quote = economy.quotePurchase(kind, quantity, kind === 'packaging' ? null : districtId);
  const nextUnitCoins =
    quote.current < quote.cap
      ? economy.nextPriceCoins(kind, quote.current, kind === 'packaging' ? undefined : districtId)
      : 0;

  const qtyButtons = el(
    'div',
    { className: 'kb-row-gap', role: 'group', 'aria-label': '購入数' },
    ...QUANTITIES.map((q) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-qty-btn${quantity === q.value ? ' is-selected' : ''}`,
          'aria-pressed': quantity === q.value ? 'true' : 'false',
        },
        q.label,
      );
      btn.addEventListener('click', () => actions.setPurchaseQuantity(q.value));
      return btn;
    }),
  );

  let effectText = '';
  if (kind === 'packaging') {
    const before = quote.before_multiplier ? formatRatio(quote.before_multiplier) : '';
    const after = quote.after_multiplier ? formatRatio(quote.after_multiplier) : '';
    effectText = `Lv.${quote.current} (${before}) → Lv.${quote.after} (${after})`;
  } else {
    const beforeRate = quote.before_per_second_micro ? formatRatePerSec(quote.before_per_second_micro) : '0/s';
    const afterRate = quote.after_per_second_micro ? formatRatePerSec(quote.after_per_second_micro) : '0/s';
    effectText = `${quote.current} / ${quote.cap} (${beforeRate}) → ${quote.after} / ${quote.cap} (${afterRate})`;
  }

  const nextMilestone = [10, 25, 50].find((m) => quote.current < m) ?? null;
  const milestoneNote = nextMilestone !== null ? `次の節目 ${nextMilestone}（効果2倍）まであと ${nextMilestone - quote.current}` : '全節目達成済み';

  let lockReason: string | null = null;
  if (quote.current >= quote.cap) {
    lockReason = kind === 'shops' && district.stage < 5 ? 'Lvを上げると店舗上限が増えます' : '最大上限に到達';
  } else if (quote.count === 0 && quote.limited_by_funds) {
    lockReason = `あと ${formatCoins(BigInt(nextUnitCoins) * 1_000_000n - economy.coinsMicro)} コイン不足`;
  }

  const canBuy = quote.count > 0 && !lockReason;
  const buyBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-primary',
      disabled: !canBuy,
      'data-testid': `buy-${kind}-btn`,
    },
    el(
      'span',
      {},
      canBuy
        ? `${quote.count}個 購入する（${quote.total_cost_coins.toLocaleString('ja-JP')} コイン）`
        : quote.limited_by_funds
          ? `コイン不足（1個 ${nextUnitCoins.toLocaleString('ja-JP')} コイン）`
          : lockReason ?? '購入できません',
    ),
  );
  buyBtn.addEventListener('click', () => actions.buyEquipment(kind));

  const costSummary =
    quote.count > 0
      ? `購入数 ${quote.count}個・費用 ${quote.total_cost_coins.toLocaleString('ja-JP')} コイン`
      : quote.limited_by_funds
        ? `購入数 1個（コイン不足）・必要 ${nextUnitCoins.toLocaleString('ja-JP')} コイン`
        : lockReason ?? '';

  return el(
    'div',
    { className: 'kb-town-dock-inner' },
    el(
      'div',
      { className: 'kb-town-dock-info' },
      el(
        'div',
        { className: 'kb-row-wrap' },
        el('strong', { className: 'kb-nowrap' }, title),
        el('span', { className: 'kb-badge kb-nowrap' }, effectText),
      ),
      el(
        'div',
        { className: 'kb-small kb-secondary' },
        el('span', { className: 'kb-nowrap' }, costSummary),
        ' ｜ ',
        el('span', { className: 'kb-nowrap' }, milestoneNote),
      ),
    ),
    el('div', { className: 'kb-town-dock-actions' }, qtyButtons, buyBtn),
  );
}

function renderRailwayDock(
  economy: CityEconomy,
  districtId: DistrictId,
  actions: UIControllerActions,
): HTMLElement {
  const district = economy.districts[districtId];
  const cfg = ECONOMY_CONFIG.railway;
  const dCfg = ECONOMY_CONFIG.districts.find((d) => d.id === districtId)!;
  const coinCost = BigInt(cfg.base_coins) * BigInt(dCfg.cost_multiplier) * economy.unit;
  const allMet =
    district.open &&
    !district.railway &&
    district.stage >= cfg.minimum_stage &&
    district.crews >= cfg.minimum_crews &&
    economy.coinsMicro >= coinCost;

  const checks = [
    { label: `Lv.${cfg.minimum_stage}+`, ok: district.stage >= cfg.minimum_stage },
    { label: `配送班${cfg.minimum_crews}+`, ok: district.crews >= cfg.minimum_crews },
    { label: `${formatCoins(coinCost)}コイン`, ok: economy.coinsMicro >= coinCost },
  ];

  const buyBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-primary', disabled: !allMet },
    district.railway ? '貨物鉄道 開通済み' : '貨物鉄道を開通する（輸送 4倍）',
  );
  buyBtn.addEventListener('click', () => actions.buyRailway(districtId));

  return el(
    'div',
    { className: 'kb-town-dock-inner' },
    el(
      'div',
      { className: 'kb-town-dock-info' },
      el('strong', {}, `${DISTRICT_NAME_MAP[districtId]} の貨物鉄道`),
      el(
        'div',
        { className: 'kb-row-wrap' },
        ...checks.map((c) =>
          el('span', { className: `kb-badge${c.ok ? ' kb-streak-pill' : ''}` }, `${c.ok ? '✓' : '・'} ${c.label}`),
        ),
      ),
    ),
    el('div', { className: 'kb-town-dock-actions' }, buyBtn),
  );
}

function renderSynergyDock(economy: CityEconomy, actions: UIControllerActions): HTMLElement {
  const cards = ECONOMY_CONFIG.synergies.map((syn) => {
    const owned = economy.synergies.has(syn.id as SynergyId);
    const reqEntries = Object.entries(syn.requires) as [DistrictId, number][];
    const reqMet = reqEntries.every(([dId, reqStage]) => economy.districts[dId].stage >= reqStage);
    const costMicro = BigInt(syn.cost_coins) * economy.unit;
    const canBuy = !owned && reqMet && economy.coinsMicro >= costMicro;
    const reqText = reqEntries.map(([dId, reqStage]) => `${DISTRICT_NAME_MAP[dId]} Lv.${reqStage}`).join('・');

    const btn = el(
      'button',
      { type: 'button', className: owned ? 'kb-btn-secondary' : 'kb-btn-primary', disabled: !canBuy },
      owned ? '連携済み' : `${formatCoins(costMicro)} コインで連携`,
    );
    btn.addEventListener('click', () => actions.buySynergy(syn.id as SynergyId));

    return el(
      'div',
      { className: 'kb-town-mini-card' },
      el(
        'div',
        { className: 'kb-row-gap' },
        el('strong', { className: 'kb-small' }, syn.name),
      ),
      el('div', { className: 'kb-small kb-secondary' }, `条件: ${reqText}`),
      btn,
    );
  });

  return el('div', { className: 'kb-town-dock-grid-3' }, ...cards);
}

function renderResearchDock(economy: CityEconomy, actions: UIControllerActions): HTMLElement {
  const defs: readonly { id: ResearchId; label: string }[] = [
    { id: 'materials', label: '資材生産研究' },
    { id: 'logistics', label: '輸送効率研究' },
    { id: 'commerce', label: '商業収益研究' },
  ];

  const { maximum_rank: maxRank, next_rank_cost_blueprints: bpCosts, multiplier: multCfg } = ECONOMY_CONFIG.research;

  const cards = defs.map((def) => {
    const rank = economy.research[def.id];
    const bpCost = rank < maxRank ? bpCosts[rank] : null;
    const canBuy = bpCost !== null && economy.blueprints >= bpCost;
    const nextMult =
      rank < maxRank
        ? ((multCfg.base_numerator + (rank + 1) * multCfg.rank_numerator) / multCfg.denominator).toFixed(2)
        : null;

    const btn = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', disabled: !canBuy },
      bpCost !== null ? `Rank ${rank + 1} (設計図 ${bpCost})` : '研究完了',
    );
    btn.addEventListener('click', () => actions.buyResearch(def.id));

    return el(
      'div',
      { className: 'kb-town-mini-card' },
      el(
        'div',
        { className: 'kb-row-gap' },
        el('strong', { className: 'kb-small' }, `${def.label} (R${rank}/${maxRank})`),
      ),
      el(
        'div',
        { className: 'kb-small kb-secondary' },
        nextMult !== null ? `次: 効果 ${nextMult}倍（所持設計図 ${economy.blueprints}）` : '最大倍率達成',
      ),
      btn,
    );
  });

  return el('div', { className: 'kb-town-dock-grid-3' }, ...cards);
}

export function renderUpgradesScreen(props: UpgradesScreenProps): HTMLElement {
  const { economy, selectedDistrictId, selectedCategory, quantity, actions } = props;
  const district = economy.districts[selectedDistrictId];
  const affordable = getAffordableUpgradeFlags(economy, selectedDistrictId);
  const totalResearchRank = economy.research.materials + economy.research.logistics + economy.research.commerce;
  const maxResearchRank = ECONOMY_CONFIG.research.maximum_rank * 3;
  const synergyCount = economy.synergies.size;

  // Top District Selector Strip
  const districtBar = el(
    'div',
    { className: 'kb-town-district-bar', role: 'radiogroup', 'aria-label': '対象地区' },
    el(
      'div',
      { className: 'kb-row-gap kb-town-district-pills' },
      ...DISTRICT_ORDER.map((dId) => {
        const d = economy.districts[dId];
        const selected = dId === selectedDistrictId;
        const btn = el(
          'button',
          {
            type: 'button',
            className: `kb-pill-btn kb-town-dist-pill${selected ? ' is-selected' : ''}${!d.open ? ' is-locked' : ''}`,
            'aria-pressed': selected ? 'true' : 'false',
          },
          el('span', {}, DISTRICT_NAME_MAP[dId]),
          el('span', { className: 'kb-small kb-secondary' }, d.open ? `Lv.${d.stage}` : '未'),
        );
        btn.addEventListener('click', () => actions.selectDistrict(dId));
        return btn;
      }),
    ),
    el(
      'div',
      { className: 'kb-small kb-secondary kb-town-dist-stats' },
      `在庫 ${formatMaterials(district.stockMicro)} ・ 待ち ${formatMaterials(district.queueMicro)}`,
    ),
  );

  // Authentic Panoramic Town Visual with integrated facility hotspots on real ground
  const panoramicMap = renderCityMap({
    economy,
    selectedDistrictId,
    reducedMotion: false,
    onSelectDistrict: (dId) => actions.selectDistrict(dId),
    integratedFacilities: {
      packagingLevel: economy.packagingLevel,
      totalResearchRank,
      maxResearchRank,
      synergyCount,
      selectedCategory,
      onSelectCategory: (cat) => actions.setUpgradeCategory(cat),
    },
  });

  const stageCanvas = el(
    'div',
    { className: 'kb-town-panoramic-wrap', 'aria-label': '街の全景と施設マップ' },
    panoramicMap,
  );

  // Facility Category Selector Tabs inside Action Dock
  const categoryDefs: readonly { id: UpgradeCategory; label: string; dot?: boolean }[] = [
    { id: 'architecture', label: `建築 (Lv.${district.stage}/5)` },
    { id: 'packaging', label: `荷づくり台 Lv.${economy.packagingLevel}`, dot: affordable.packaging },
    { id: 'shops', label: `店舗 (${district.shops}軒)`, dot: affordable.shops },
    { id: 'crews', label: `配送班 (${district.crews}班)`, dot: affordable.crews },
    { id: 'railway', label: `鉄道 (${district.railway ? '済' : '未'})` },
    { id: 'synergy', label: `連携 (${synergyCount}/3)` },
    { id: 'research', label: `研究 (R${totalResearchRank}/${maxResearchRank})` },
  ];

  const categoryTabs = el(
    'div',
    { className: 'kb-town-cat-tabs', role: 'tablist', 'aria-label': '施設カテゴリ' },
    ...categoryDefs.map((c) => {
      const selected = selectedCategory === c.id;
      const btn = el(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': selected ? 'true' : 'false',
          className: `kb-pill-btn kb-town-cat-tab${selected ? ' is-selected' : ''}`,
          'data-testid': `town-tab-${c.id}`,
        },
        el('span', {}, c.label),
        c.dot ? el('span', { className: 'kb-affordable-dot' }, '可') : null,
      );
      btn.addEventListener('click', () => actions.setUpgradeCategory(c.id));
      return btn;
    }),
  );

  // Bottom Action Dock Content
  let dockContent: HTMLElement;
  if (selectedCategory === 'architecture') {
    dockContent = renderArchitectureDock(economy, selectedDistrictId, actions);
  } else if (selectedCategory === 'packaging' || selectedCategory === 'crews' || selectedCategory === 'shops') {
    dockContent = renderEquipmentDock(selectedCategory, economy, selectedDistrictId, quantity, actions);
  } else if (selectedCategory === 'railway') {
    dockContent = renderRailwayDock(economy, selectedDistrictId, actions);
  } else if (selectedCategory === 'synergy') {
    dockContent = renderSynergyDock(economy, actions);
  } else {
    dockContent = renderResearchDock(economy, actions);
  }

  const actionDock = el(
    'section',
    { className: 'kb-card kb-town-action-dock', 'aria-label': '設備の操作パネル' },
    categoryTabs,
    dockContent,
  );

  return el('div', { className: 'kb-upgrades-world' }, districtBar, stageCanvas, actionDock);
}
