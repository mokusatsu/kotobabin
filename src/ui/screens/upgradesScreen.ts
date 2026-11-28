import { CITY_CATALOG, ECONOMY_CONFIG } from '@/contracts/data';
import type { DistrictId, ResearchId, SynergyId } from '@/contracts/types';
import type { CityEconomy, EquipmentKind, PurchaseQuantity } from '@/economy/cityEconomy';
import type { OnboardingStep, UIControllerActions, UpgradeCategory } from '../types';
import { renderCityMap } from '../components/cityMap';
import { buildingComparison } from '../components/buildingComparison';
import { districtLife } from '../components/townLife';
import { decorationShop } from '../components/decorationShop';
import { renderCoachMark } from '../components/coachMark';
import { CATALOG_ACHIEVEMENTS } from '@/progression/achievementEngine';
import { assetImg, el } from '../utils/dom';
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
  dialogOpen?: boolean;
  selectedDecoration?: string;
  quantity: PurchaseQuantity;
  onboardingStep?: OnboardingStep | null;
  onboardingTargetSelected?: boolean;
  onboardingStampIds?: string[];
  reducedMotion?: boolean;
  actions: UIControllerActions;
}

const QUANTITIES: readonly { value: PurchaseQuantity; label: string }[] = [
  { value: 1, label: '1' },
  { value: 10, label: '10' },
  { value: 'max', label: '買えるだけ' },
];

function equipmentDialog(title: string, content: HTMLElement, close: () => void, guided = false): HTMLDialogElement {
  const dismiss = el('button', { type: 'button', className: 'kb-btn-secondary', 'data-testid': 'equipment-close' }, '閉じる');
  dismiss.addEventListener('click', close);
  const dialog = el('dialog', { className: `kb-card kb-equipment-dialog${guided ? ' is-onboard-action-dock' : ''}`,
    'aria-labelledby': 'equipment-dialog-title', 'data-testid': 'equipment-dialog' },
    el('div', { className: 'kb-equipment-heading' }, el('h2', { className: 'kb-h2', id: 'equipment-dialog-title', tabindex: -1 }, title), dismiss),
    content);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  queueMicrotask(() => {
    if (!dialog.isConnected) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
    const previous = dialog.dataset.focusIndex;
    const target = previous !== undefined ? dialog.querySelectorAll<HTMLButtonElement>('button')[Number(previous)] : null;
    (target?.matches(':enabled') ? target : dialog.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true });
  });
  return dialog;
}

function formatRatio(r: { numerator: number; denominator: number }): string {
  return `${(r.numerator / r.denominator).toFixed(2)}倍`;
}

function renderArchitectureDock(
  economy: CityEconomy,
  districtId: DistrictId,
  actions: UIControllerActions,
  reducedMotion: boolean,
  guided = false,
): HTMLElement {
  const district = economy.districts[districtId];
  const dCfg = CITY_CATALOG.districts.find((d) => d.id === districtId)!;
  const stageEntry = dCfg.stage_entries.find((s) => s.stage === district.stage);
  const stageCfg = ECONOMY_CONFIG.development.stages.find((s) => s.stage === district.stage);
  const preview = buildingComparison(economy.landscape, districtId, district.open ? district.stage : 0, reducedMotion);

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
      preview,
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
      el('div', { className: 'kb-town-dock-actions' }, openBtn),
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
    const reqMatMicro = economy.developmentCost(districtId, nextStage).materialsMicro;
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
      { type: 'button', className: 'kb-btn-primary', disabled: !canUpgrade, 'data-testid': 'upgrade-district-btn' },
      guided ? `住宅地に家を建てる（${formatMaterials(reqMatMicro)} 資材）`
        : canUpgrade ? `Lv.${nextStage} へアップグレード` : `資材不足（あと ${formatMaterialsRemaining(reqMatMicro - district.stockMicro)}）`,
    );
    primaryControl.addEventListener('click', () => actions.upgradeDistrict(districtId));
  }

  return el(
    'div',
    { className: 'kb-town-dock-inner' },
    preview,
    el(
      'div',
      { className: 'kb-town-dock-info' },
      el('strong', {}, `${DISTRICT_NAME_MAP[districtId]} — 街並み Lv.${district.stage} / 5`),
      !guided && district.stage > 0
        ? el('div', { className: 'kb-small' }, `今の街並み：${districtLife[districtId][district.stage - 1][1]}。`) : null,
      statusEl,
      !guided && district.stage < 5
        ? el('div', { className: 'kb-small' }, `Lv.${district.stage + 1}になると、${districtLife[districtId][district.stage][1]}。`) : null,
    ),
    el('div', { className: 'kb-town-dock-actions' }, primaryControl),
  );
}

function renderEquipmentDock(
  kind: EquipmentKind,
  economy: CityEconomy,
  districtId: DistrictId,
  quantity: PurchaseQuantity,
  actions: UIControllerActions,
  guided = false,
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
      ? economy.equipmentPriceCoins(kind, quote.current, kind === 'packaging' ? undefined : districtId)
      : 0n;
  const totalCoins = formatCoins(quote.total_cost_micro);

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
      guided && canBuy ? `荷づくり台を増やす（${totalCoins} コイン）` : canBuy
        ? `${quote.count}個 購入する（${totalCoins} コイン）`
        : quote.limited_by_funds
          ? `コイン不足（1個 ${nextUnitCoins.toLocaleString('ja-JP')} コイン）`
          : lockReason ?? '購入できません',
    ),
  );
  buyBtn.addEventListener('click', () => actions.buyEquipment(kind));

  const costSummary =
    quote.count > 0
      ? `購入数 ${quote.count}個・費用 ${totalCoins} コイン`
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
        guided ? null : ' ｜ ',
        guided ? null : el('span', { className: 'kb-nowrap' }, milestoneNote),
      ),
    ),
    el('div', { className: 'kb-town-dock-actions' }, guided ? null : qtyButtons, buyBtn),
  );
}

function renderRailwayDock(
  economy: CityEconomy,
  districtId: DistrictId,
  actions: UIControllerActions,
): HTMLElement {
  const district = economy.districts[districtId];
  const cfg = ECONOMY_CONFIG.railway;
  const coinCost = economy.railwayCostMicro(districtId);
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
    const costMicro = economy.cityPrice(BigInt(syn.cost_coins)) * economy.unit;
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
  const {
    economy, selectedDistrictId, selectedCategory, quantity, onboardingStep,
    onboardingTargetSelected = false, onboardingStampIds, reducedMotion = false, actions,
  } = props;
  const district = economy.districts[selectedDistrictId];
  const affordable = getAffordableUpgradeFlags(economy, selectedDistrictId);
  const totalResearchRank = economy.research.materials + economy.research.logistics + economy.research.commerce;
  const maxResearchRank = ECONOMY_CONFIG.research.maximum_rank * 3;
  const synergyCount = economy.synergies.size;
  const isBuilding = onboardingStep === 'S6';
  const completed = onboardingStep === 'S8';
  const choosingTarget = Boolean(onboardingStep && !completed && !onboardingTargetSelected);
  const hasBuilding = district.stage > 0;
  const hasEquipment = economy.packagingLevel > 0;

  let guide: HTMLElement | null = null;
  if (onboardingStep && !completed) {
    const guideTitle = choosingTarget
      ? isBuilding ? '住宅地を選ぼう' : '荷づくり台を選ぼう'
      : isBuilding ? (hasBuilding ? '住宅地を確認できました' : '住宅地に最初の家を建てよう')
        : '荷づくり台をLvアップしよう';
    const guideBody = choosingTarget
      ? isBuilding ? '光っている「住宅地」をタップしましょう。建築の操作パネルが開きます。'
        : '住宅地に家が建ちました！次に、光っている「荷づくり台」をタップしましょう。'
      : isBuilding ? (hasBuilding ? '住宅地はすでに発展しています。「荷づくり台へ進む」を選びましょう。'
        : '「住宅地に家を建てる」をタップしましょう。30資材を使います。')
        : hasEquipment ? '荷づくり台はすでに強化済みです。「案内を完了する」を選びましょう。'
          : '「荷づくり台を増やす」をタップしましょう。資材の生産量が1.00倍から1.25倍になります。';
    const stepNumber = isBuilding ? (choosingTarget ? 6 : 7) : (choosingTarget ? 8 : 9);
    guide = renderCoachMark({
      stepBadge: `ステップ ${stepNumber} / 9`,
      title: guideTitle,
      body: guideBody,
      pointerDirection: choosingTarget ? (isBuilding ? 'up' : 'down') : 'down',
      compactHeader: true,
      secondaryLabel: 'スキップ',
      secondaryTestId: 'onboarding-skip-btn',
      onSecondary: () => actions.skipOnboarding(),
      step: onboardingStep,
      className: choosingTarget ? 'kb-upgrade-map-coach' : 'kb-upgrade-action-coach',
    });
    const heading = guide.querySelector<HTMLElement>('.kb-coach-title');
    heading?.setAttribute('data-onboarding-heading', 'true');
    heading?.setAttribute('tabindex', '-1');
  }

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
            'aria-haspopup': 'dialog', 'data-testid': `equipment-district-${dId}`,
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
    reducedMotion,
    highlightDistrictId: choosingTarget && isBuilding ? 'residential' : null,
    highlightFacilityCategory: choosingTarget && !isBuilding ? 'packaging' : null,
    overlayContent: choosingTarget ? guide : null,
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

  if (onboardingStep) {
    const continueBtn = el('button', {
      type: 'button', className: 'kb-btn-primary', 'data-testid': 'onboarding-upgrade-next-btn',
    }, isBuilding ? '荷づくり台へ進む' : '案内を完了する');
    continueBtn.addEventListener('click', () => {
      if (isBuilding) actions.advanceOnboardingToEquipment();
      else actions.finishOnboardingEquipment();
    });
    const homeBtn = el('button', {
      type: 'button', className: 'kb-btn-primary', 'data-testid': 'onboarding-finish-home-btn',
    }, 'ホームで配達を続ける');
    homeBtn.addEventListener('click', () => actions.finishOnboardingToHome());

    let actionDock: HTMLElement | null = null;
    if (choosingTarget) {
      stageCanvas.classList.add('is-onboard-spotlight-map');
      for (const button of stageCanvas.querySelectorAll<HTMLButtonElement>('button')) {
        button.disabled = !button.classList.contains('is-onboard-target') && !button.classList.contains('kb-coach-skip-btn');
      }
    } else {
      stageCanvas.inert = true;
      stageCanvas.setAttribute('aria-hidden', 'true');
    }
    if (!completed && !choosingTarget) {
      const dockContent = isBuilding && hasBuilding || !isBuilding && hasEquipment
        ? el('div', { className: 'kb-town-dock-actions' }, continueBtn)
        : isBuilding ? renderArchitectureDock(economy, selectedDistrictId, actions, reducedMotion, true)
          : renderEquipmentDock('packaging', economy, selectedDistrictId, 1, actions, true);
      const controls = dockContent.classList.contains('kb-town-dock-actions')
        ? dockContent : dockContent.querySelector<HTMLElement>('.kb-town-dock-actions');
      controls?.classList.add('kb-onboarding-action-controls');
      if (guide) controls?.prepend(guide);
      controls?.querySelector('button:not(.kb-coach-skip-btn)')?.classList.add('kb-onboard-action-target');
      actionDock = equipmentDialog(isBuilding ? '住宅地の建築' : '荷づくり台', dockContent, () => actions.closeUpgradeDialog(), true);
    }
    let completionDialog: HTMLDialogElement | null = null;
    if (completed) {
      completionDialog = el('dialog', {
        className: 'kb-card kb-onboarding-complete-dialog',
        'aria-modal': 'true', 'aria-labelledby': 'kb-onboarding-complete-title',
        'data-testid': 'onboarding-complete-dialog',
      },
        el('div', { className: 'kb-stack-md' },
          el('div', {}, el('span', { className: 'kb-badge' }, 'チュートリアル完了')),
          el('h2', { id: 'kb-onboarding-complete-title', className: 'kb-h2' }, '施設を拡張できました！'),
          el('p', { className: 'kb-coach-body' }, '打つ → 運ぶ → 建てる → 設備を増やす。配達を続けるほど、街を大きく育てられます。'),
          el('strong', {}, `住宅地 Lv.${district.stage} ・ 荷づくり台 Lv.${economy.packagingLevel}`),
          el('p', { className: 'kb-coach-body' }, `これからの配達の資材生産量は ${formatRatio({
            numerator: Number(economy.materialMultiplier().numerator),
            denominator: Number(economy.materialMultiplier().denominator),
          })}。獲得した切手は配達手帳に保存されています。`),
          el('div', { className: 'kb-row-wrap kb-onboarding-final-stamps', 'aria-label': '今回獲得した切手' },
            ...CATALOG_ACHIEVEMENTS.filter((stamp) => onboardingStampIds?.includes(stamp.id)).map((stamp) =>
              el('span', { className: 'kb-row-gap kb-small' },
                assetImg(`./assets/achievement_stamp/${stamp.stamp_asset_id}.webp`, '', { decorative: true, width: 32, height: 32 }),
                stamp.name,
              ),
            ),
          ),
          el('div', { className: 'kb-coach-actions' }, homeBtn),
        ),
      );
      completionDialog.addEventListener('cancel', (event) => event.preventDefault());
      const dialog = completionDialog;
      queueMicrotask(() => {
        if (!dialog.isConnected) return;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.open = true;
        homeBtn.focus();
      });
    }
    return el('div', {
      className: `kb-upgrades-world kb-onboarding-upgrades${completed ? '' : ' is-onboarding'}`,
      'data-onboarding-step': onboardingStep,
      'data-onboarding-phase': choosingTarget ? 'select' : completed ? 'complete' : 'upgrade',
      'data-testid': 'onboarding-upgrades',
    },
      completed ? null : el('div', { className: 'kb-onboard-backdrop', 'aria-hidden': 'true' }),
      stageCanvas,
      completed ? completionDialog : actionDock,
    );
  }

  // Facility Category Selector Tabs inside Action Dock
  const categoryDefs: readonly { id: UpgradeCategory; label: string; dot?: boolean }[] = [
    { id: 'architecture', label: `建築 (Lv.${district.stage}/5)` },
    { id: 'packaging', label: `荷づくり台 Lv.${economy.packagingLevel}`, dot: affordable.packaging },
    { id: 'shops', label: `店舗 (${district.shops}軒)`, dot: affordable.shops },
    { id: 'crews', label: `配送班 (${district.crews}班)`, dot: affordable.crews },
    { id: 'railway', label: `鉄道 (${district.railway ? '済' : '未'})` },
    { id: 'synergy', label: `連携 (${synergyCount}/3)` },
    { id: 'research', label: `研究 (R${totalResearchRank}/${maxResearchRank})` },
    { id: 'scenery', label: '景観' },
  ];

  const categoryTabs = el(
    'div',
    { className: 'kb-town-cat-tabs', role: 'group', 'aria-label': '施設カテゴリ' },
    ...categoryDefs.map((c) => {
      const selected = selectedCategory === c.id;
      const btn = el(
        'button',
        {
          type: 'button',
          'aria-haspopup': 'dialog',
          className: `kb-pill-btn kb-town-cat-tab${selected && props.dialogOpen ? ' is-selected' : ''}`,
          'data-testid': `town-tab-${c.id}`,
        },
        el('span', {}, c.label),
        c.dot ? el('span', { className: 'kb-affordable-dot' }, '可') : null,
      );
      btn.addEventListener('click', () => actions.setUpgradeCategory(c.id));
      return btn;
    }),
  );

  const screen = el('div', { className: 'kb-upgrades-world' }, districtBar, stageCanvas,
    el('section', { className: 'kb-card kb-equipment-launchers', 'aria-label': '街の設備' }, categoryTabs));
  if (!props.dialogOpen) return screen;
  let dockContent: HTMLElement;
  if (selectedCategory === 'architecture') {
    dockContent = renderArchitectureDock(economy, selectedDistrictId, actions, reducedMotion);
  } else if (selectedCategory === 'packaging' || selectedCategory === 'crews' || selectedCategory === 'shops') {
    dockContent = renderEquipmentDock(selectedCategory, economy, selectedDistrictId, quantity, actions);
  } else if (selectedCategory === 'railway') {
    dockContent = renderRailwayDock(economy, selectedDistrictId, actions);
  } else if (selectedCategory === 'synergy') {
    dockContent = renderSynergyDock(economy, actions);
  } else if (selectedCategory === 'scenery') {
    dockContent = decorationShop(economy, props.selectedDecoration ?? '', reducedMotion,
      id => actions.selectDecoration(id), id => actions.buyDecoration(id));
  } else {
    dockContent = renderResearchDock(economy, actions);
  }

  const title = categoryDefs.find(category => category.id === selectedCategory)!.label;
  screen.append(equipmentDialog(title, dockContent, () => actions.closeUpgradeDialog()));
  return screen;
}
