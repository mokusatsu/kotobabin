import { CITY_CATALOG } from '@/contracts/data';
import type { CourseId, DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
} from '@/progression/achievementEngine';
import { renderCityMap } from '../components/cityMap';
import { renderCoachMark } from '../components/coachMark';
import type { OnboardingUiState, UIControllerActions } from '../types';
import { assetImg, el, ensurePersistentAssetKeepalive } from '../utils/dom';
import {
  COURSE_DESCRIPTIONS,
  COURSE_LABELS,
  DISTRICT_NAME_MAP,
  formatMaterials,
  formatMaterialsRemaining,
  getAffordableUpgradeFlags,
} from '../utils/format';

export interface HomeScreenProps {
  economy: CityEconomy;
  achievements: AchievementEngine;
  selectedCourseId: CourseId;
  selectedDistrictId: DistrictId;
  difficultyPopupOpen: boolean;
  pinnedAchievementId: string | null;
  reducedMotion: boolean;
  onboarding?: OnboardingUiState;
  actions: UIControllerActions;
}

const COURSES: readonly CourseId[] = ['relaxed', 'standard', 'challenge'];

function preloadHomeNextAssets(): void {
  if (typeof Image === 'undefined') {
    return;
  }
  ensurePersistentAssetKeepalive([
    './assets/raster/terrain_riverside.jpg',
    './assets/raster/terrain_highland.jpg',
    './assets/raster/terrain_seaside.jpg',
    './assets/raster/play_backdrop_riverside.jpg',
    './assets/raster/scenic_plot.jpg',
    './assets/raster/scenic_hub.jpg',
    './assets/sprites/cargo_wagon_stage0.png',
    './assets/sprites/anim_courier_cart.png',
    './assets/sprites/anim_central_hub.png',
    './assets/sprites/building_residential_stage0.png',
    './assets/achievement_stamp/stamp_a01.webp',
    './assets/achievement_stamp/stamp_a02.webp',
    './assets/achievement_stamp/stamp_a03.webp',
    './assets/achievement_stamp/stamp_a04.webp',
    './assets/achievement_stamp/stamp_e01.webp',
    './assets/achievement_stamp/stamp_j01.webp',
  ]);
}

export function renderHomeScreen(props: HomeScreenProps): HTMLElement {
  const {
    economy,
    achievements,
    selectedCourseId,
    selectedDistrictId,
    difficultyPopupOpen,
    pinnedAchievementId,
    reducedMotion,
    onboarding,
    actions,
  } = props;

  preloadHomeNextAssets();

  const isS1Onboarding = Boolean(onboarding?.active) && onboarding?.step === 'S1';
  const isS2Onboarding = Boolean(onboarding?.active) && onboarding?.step === 'S2';
  const isHomeOnboarding = isS1Onboarding || isS2Onboarding;

  const selectedDistrict = economy.districts[selectedDistrictId];
  const districtCatalog = CITY_CATALOG.districts.find((d) => d.id === selectedDistrictId);
  const canDeliverToSelected = selectedDistrict.open;

  let s1CoachEl: HTMLElement | null = null;
  let s2CoachEl: HTMLElement | null = null;
  if (isS1Onboarding) {
    s1CoachEl = renderCoachMark({
      stepBadge: 'ステップ 1 / 4',
      title: 'このゲームの目的は、荷物を運んで街を発展させること',
      body: '荷物を運んで下の「必要な資材」を 30 ためると、住宅地に最初の建物が建ちます。',
      pointerDirection: 'down',
      compactHeader: true,
      primaryLabel: '次へ',
      primaryTestId: 'onboarding-next-btn',
      onPrimary: () => actions.advanceOnboardingToDistrictSelect(),
      secondaryLabel: 'スキップ',
      secondaryTestId: 'onboarding-skip-btn',
      onSecondary: () => actions.skipOnboarding(),
      testId: 'onboarding-coach',
      step: 'S1',
      className: 'kb-home-coach-overlay is-step-s1',
    });
  } else if (isS2Onboarding) {
    s2CoachEl = renderCoachMark({
      stepBadge: 'ステップ 2 / 4',
      title: '荷物を運ぶ地区を選ぼう',
      body: 'いま開通しているのは「住宅地」だけです。光っている「住宅地」をタップしましょう。',
      pointerDirection: 'up',
      compactHeader: true,
      subNote: onboarding?.lockedDistrictNotice ?? null,
      subNoteAccent: Boolean(onboarding?.lockedDistrictNotice),
      secondaryLabel: 'スキップ',
      secondaryTestId: 'onboarding-skip-btn',
      onSecondary: () => actions.skipOnboarding(),
      testId: 'onboarding-coach',
      step: 'S2',
      className: 'kb-home-coach-overlay is-step-s2',
    });
  }

  // Main full-width CityMap (click an open district to open the departure difficulty popup)
  const mapEl = renderCityMap({
    economy,
    selectedDistrictId,
    reducedMotion,
    highlightDistrictId: isS2Onboarding ? 'residential' : null,
    overlayContent: s2CoachEl,
    onSelectDistrict: (dId) => {
      if (economy.districts[dId].open) {
        actions.selectAndOpenDifficultyPopup(dId);
      } else {
        actions.selectDistrict(dId);
      }
    },
  });

  const mapViewport = el(
    'div',
    {
      className: `kb-home-map-viewport${isHomeOnboarding ? ' is-onboarding' : ''}${isS2Onboarding ? ' is-onboard-spotlight-map' : ''}`,
    },
    mapEl,
    s1CoachEl,
  );

  const nextStage = selectedDistrict.stage < 5 ? selectedDistrict.stage + 1 : null;
  const nextRequiredMicro =
    selectedDistrict.open && nextStage !== null
      ? economy.developmentCost(selectedDistrictId, nextStage).materialsMicro
      : 0n;
  const upgradePct =
    nextRequiredMicro > 0n
      ? Math.min(100, Number((selectedDistrict.stockMicro * 100n) / nextRequiredMicro))
      : 0;
  const canUpgrade =
    selectedDistrict.open && nextStage !== null && selectedDistrict.stockMicro >= nextRequiredMicro;

  const upgradeBtn =
    selectedDistrict.open && nextStage !== null
      ? el(
          'button',
          {
            type: 'button',
            className: `${canUpgrade ? 'kb-btn-primary' : 'kb-btn-secondary'} kb-small`,
            disabled: !canUpgrade,
            'data-testid': 'home-upgrade-district-btn',
          },
          canUpgrade
            ? `Lv.${nextStage} へアップグレード`
            : `Lv.${nextStage}（あと ${formatMaterialsRemaining(nextRequiredMicro - selectedDistrict.stockMicro)}）`,
        )
      : null;
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => actions.upgradeDistrict(selectedDistrictId));
  }

  const affordable = getAffordableUpgradeFlags(economy, selectedDistrictId);
  const toUpgradesBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary kb-row-gap', disabled: isHomeOnboarding },
    el('span', {}, '街の設備へ'),
    affordable.any ? el('span', { className: 'kb-affordable-dot' }, '強化可') : null,
  );
  toUpgradesBtn.addEventListener('click', () => actions.navigate('UPGRADES'));

  const toDetailBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary', disabled: isHomeOnboarding },
    el('span', {}, '地区の詳細'),
  );
  toDetailBtn.addEventListener('click', () => actions.navigate('DISTRICT_DETAIL'));

  const totalStageSum = Object.values(economy.districts).reduce((sum, d) => sum + d.stage, 0);
  const requiredStageSum = districtCatalog?.opening_stage_sum ?? 0;
  const openPct =
    requiredStageSum > 0 ? Math.min(100, Math.round((totalStageSum / requiredStageSum) * 100)) : 0;

  const stockWhole = selectedDistrict.stockMicro / 1_000_000n;
  const totalWhole = (selectedDistrict.stockMicro + selectedDistrict.queueMicro) / 1_000_000n;
  const queuedWhole = totalWhole > stockWhole ? totalWhole - stockWhole : 0n;

  const districtInfoCard = el(
    'div',
    { className: `kb-card kb-district-summary${isS1Onboarding ? ' is-onboard-spotlight-card' : ''}` },
    el(
      'div',
      { className: 'kb-row-between' },
      el(
        'div',
        {},
        el('strong', {}, `${DISTRICT_NAME_MAP[selectedDistrictId]}（Lv.${selectedDistrict.stage} / 5）`),
        el(
          'div',
          { className: 'kb-secondary kb-small' },
          selectedDistrict.open
            ? `店舗 ${selectedDistrict.shops}軒・配送班 ${selectedDistrict.crews}班・到着済み在庫 ${formatMaterials(selectedDistrict.stockMicro)}`
            : '未開通（他地区を強化して条件を満たすと自動で開通します）',
        ),
      ),
      isS1Onboarding
        ? el('span', { className: 'kb-badge kb-small' }, '目標: 30 資材で Lv.1 に発展')
        : el('div', { className: 'kb-row-gap' }, upgradeBtn, toUpgradesBtn, toDetailBtn),
    ),
    selectedDistrict.open && nextStage !== null
      ? el(
          'div',
          {
            className: `kb-stack-xs${onboarding?.active && onboarding.step === 'S1' ? ' is-onboard-highlight' : ''}`,
            'data-testid': 'home-next-level-materials',
          },
          el(
            'div',
            { className: 'kb-row-between kb-small' },
            el(
              'span',
              {},
              `次のLv.${nextStage}に必要な資材${queuedWhole > 0n ? `（輸送待ち +${queuedWhole.toLocaleString('ja-JP')}）` : ''}`,
            ),
            el('span', {}, `${formatMaterials(selectedDistrict.stockMicro)} / ${formatMaterials(nextRequiredMicro)} 資材`),
          ),
          el(
            'div',
            { className: 'kb-progress-track' },
            el('div', { className: 'kb-progress-fill', style: `width: ${upgradePct}%` }),
          ),
        )
      : selectedDistrict.open
        ? el(
            'div',
            { className: 'kb-stack-xs', 'data-testid': 'home-next-level-materials' },
            el(
              'div',
              { className: 'kb-row-between kb-small' },
              el('span', {}, '最高レベル（Lv.5）到達済み'),
              el('span', {}, '配送すると到着報酬コインを獲得できます'),
            ),
            el(
              'div',
              { className: 'kb-progress-track' },
              el('div', { className: 'kb-progress-fill', style: 'width: 100%' }),
            ),
          )
        : el(
            'div',
            { className: 'kb-stack-xs', 'data-testid': 'home-next-level-materials' },
            el(
              'div',
              { className: 'kb-row-between kb-small' },
              el('span', {}, `開通条件: 全地区のLv合計 ${requiredStageSum} 以上`),
              el('span', {}, `現在 Lv合計 ${totalStageSum} / ${requiredStageSum}`),
            ),
            el(
              'div',
              { className: 'kb-progress-track' },
              el('div', { className: 'kb-progress-fill', style: `width: ${openPct}%` }),
            ),
          ),
  );

  const mainMapArea = el(
    'section',
    { className: 'kb-home-right', 'aria-label': '街のようす' },
    mapViewport,
    districtInfoCard,
  );

  // Bottom strip: Pinned Handbook Goal + Practice/Tutorial + Stamp count
  const unlockedCount = achievements.getUnlockedCount();
  const pinnedDef = pinnedAchievementId
    ? CATALOG_ACHIEVEMENTS.find((a) => a.id === pinnedAchievementId)
    : undefined;
  const pinnedUnlocked = pinnedDef ? achievements.isUnlocked(pinnedDef.id) : false;

  const practiceBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-secondary',
      'data-testid': 'home-practice-btn',
      disabled: isHomeOnboarding,
    },
    el('span', {}, 'ゆっくり練習'),
    el('kbd', { className: 'kb-kbd' }, 'P'),
  );
  practiceBtn.addEventListener('click', () => actions.startPractice());

  const tutorialBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-secondary',
      'data-testid': 'home-tutorial-btn',
      disabled: isHomeOnboarding,
    },
    el('span', {}, 'チュートリアル'),
    el('kbd', { className: 'kb-kbd' }, 'T'),
  );
  tutorialBtn.addEventListener('click', () => actions.startTutorial());

  const handbookBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-secondary',
      disabled: isHomeOnboarding,
    },
    el('span', {}, '配達手帳を開く'),
  );
  handbookBtn.addEventListener('click', () => actions.navigate('HANDBOOK'));

  const bottomStrip = el(
    'div',
    { className: 'kb-city-strip kb-home-bottom' },
    el(
      'div',
      { className: 'kb-row-gap' },
      assetImg('./assets/ui_icon/ui_pin.svg', '', { decorative: true, width: 18, height: 18 }),
      pinnedDef
        ? el(
            'span',
            {},
            `今回の目標: ${pinnedDef.hidden && !pinnedUnlocked ? '？？？' : pinnedDef.name}（${pinnedUnlocked ? '達成済み' : pinnedDef.hidden && !pinnedUnlocked ? pinnedDef.hidden_hint ?? '条件は秘密' : pinnedDef.condition}）`,
          )
        : el('span', { className: 'kb-secondary' }, '今回の目標: 未設定（配達手帳からピン留めできます）'),
    ),
    el(
      'div',
      { className: 'kb-row-gap' },
      practiceBtn,
      tutorialBtn,
      el('strong', {}, `切手 ${unlockedCount} / ${CATALOG_ACHIEVEMENTS.length}`),
      handbookBtn,
    ),
  );

  let difficultyModal: HTMLElement | null = null;
  if (difficultyPopupOpen && canDeliverToSelected) {
    const closeBtn = el(
      'button',
      {
        type: 'button',
        className: 'kb-btn-secondary kb-launch-close-btn',
        'aria-label': '閉じる',
        'data-testid': 'difficulty-popup-close',
      },
      '✕',
    );
    closeBtn.addEventListener('click', () => actions.closeDifficultyPopup());

    const courseButtons = COURSES.map((cId) => {
      const isLast = selectedCourseId === cId;
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-launch-course-btn${isLast ? ' is-selected' : ''}`,
          'data-testid': `launch-course-${cId}`,
        },
        el(
          'div',
          { className: 'kb-launch-course-meta' },
          el(
            'div',
            { className: 'kb-row-gap' },
            el('strong', {}, COURSE_LABELS[cId]),
            isLast ? el('span', { className: 'kb-badge kb-small' }, '前回') : null,
          ),
          el('span', { className: 'kb-secondary kb-small' }, COURSE_DESCRIPTIONS[cId]),
        ),
        el('span', { className: 'kb-launch-course-go' }, '出発 →'),
      );
      btn.addEventListener('click', () => actions.startMainRoundWithCourse(cId));
      return btn;
    });

    const cancelBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-secondary kb-full-width' },
      el('span', {}, 'キャンセル'),
      el('kbd', { className: 'kb-kbd' }, 'Esc'),
    );
    cancelBtn.addEventListener('click', () => actions.closeDifficultyPopup());

    const backdrop = el(
      'div',
      {
        className: 'kb-modal-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'kb-launch-modal-title',
        'data-testid': 'difficulty-popup',
      },
      el(
        'div',
        { className: 'kb-card kb-modal kb-launch-modal kb-stack-md' },
        el(
          'div',
          { className: 'kb-row-between' },
          el(
            'div',
            {},
            el('h2', { id: 'kb-launch-modal-title', className: 'kb-h2' }, `${DISTRICT_NAME_MAP[selectedDistrictId]} へ出発`),
            el(
              'div',
              { className: 'kb-small kb-secondary' },
              `難易度を選んで90秒の配達を開始します（Lv.${selectedDistrict.stage}・資材 ${formatMaterials(selectedDistrict.stockMicro)}）`,
            ),
          ),
          closeBtn,
        ),
        el('div', { className: 'kb-launch-course-list' }, ...courseButtons),
        cancelBtn,
      ),
    );
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        actions.closeDifficultyPopup();
      }
    });
    difficultyModal = backdrop;
  }

  const onboardingBackdrop = isHomeOnboarding
    ? el('div', {
        className: 'kb-onboard-backdrop',
        'data-testid': 'onboarding-backdrop',
        'aria-hidden': 'true',
      })
    : null;

  const stepClass = isHomeOnboarding && onboarding?.step ? ` is-onboarding-${onboarding.step.toLowerCase()}` : '';
  return el(
    'div',
    { className: `kb-home-screen${isHomeOnboarding ? ` is-onboarding${stepClass}` : ''}` },
    onboardingBackdrop,
    mainMapArea,
    bottomStrip,
    difficultyModal,
  );
}
