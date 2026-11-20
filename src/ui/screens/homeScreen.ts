import { CITY_CATALOG } from '@/contracts/data';
import type { CourseId, DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
} from '@/progression/achievementEngine';
import { renderCityMap } from '../components/cityMap';
import { renderCoachMark } from '../components/coachMark';
import { getTutorialRevealIds, renderStampReveal, STAMP_REVEAL_DURATION_MS } from '../components/stampReveal';
import type { OnboardingUiState, UIControllerActions } from '../types';
import { assetImg, el, ensurePersistentAssetKeepalive } from '../utils/dom';
import {
  COURSE_DESCRIPTIONS,
  COURSE_LABELS,
  DISTRICT_NAME_MAP,
  formatMaterials,
  formatMaterialsRemaining,
  formatCoins,
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
    './assets/sprites/city_plot.png',
    './assets/sprites/buildings/residential_stage1.png',
    './assets/achievement_stamp/stamp_a01.webp',
    './assets/achievement_stamp/stamp_a02.webp',
    './assets/achievement_stamp/stamp_a03.webp',
    './assets/achievement_stamp/stamp_a04.webp',
    './assets/achievement_stamp/stamp_e01.webp',
    './assets/achievement_stamp/stamp_j01.webp',
  ]);
}

function openOnboardingDialog(dialog: HTMLDialogElement, nextBtn: HTMLButtonElement): HTMLDialogElement {
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  queueMicrotask(() => {
    if (!dialog.isConnected) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.open = true;
      nextBtn.focus();
    }
  });
  return dialog;
}

function renderOnboardingIntro(actions: UIControllerActions): HTMLDialogElement {
  const nextBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-primary kb-coach-primary-btn', autofocus: true, 'data-testid': 'onboarding-next-btn' },
    '次へ',
    el('kbd', { className: 'kb-kbd', 'aria-hidden': 'true' }, 'Enter'),
  );
  nextBtn.addEventListener('click', () => actions.advanceOnboardingToDistrictSelect());

  const skipBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary kb-coach-skip-btn', 'data-testid': 'onboarding-skip-btn' },
    'スキップ',
  );
  skipBtn.addEventListener('click', () => actions.skipOnboarding());

  const dialog = el(
    'dialog',
    {
      className: 'kb-card kb-modal kb-onboarding-intro kb-onboarding-goal-dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'kb-onboarding-intro-title',
      'aria-describedby': 'kb-onboarding-intro-body',
      'data-testid': 'onboarding-coach',
      'data-onboarding-step': 'S1',
    },
    el(
      'div',
      { className: 'kb-stack-md' },
      el(
        'div',
        { className: 'kb-stack-xs' },
        el('div', {}, el('span', { className: 'kb-badge kb-coach-step-badge' }, 'ステップ 1 / 9')),
        el('h2', { id: 'kb-onboarding-intro-title', className: 'kb-h2' }, 'このゲームの目的'),
      ),
      assetImg('./assets/raster/onboarding-goal.webp', '荷物を積んだ馬車が、絵本から飛び出した赤い屋根の家へ向かう', {
        className: 'kb-onboarding-intro-art',
        width: 1920,
        height: 819,
      }),
      el(
        'p',
        { id: 'kb-onboarding-intro-body', className: 'kb-coach-body' },
        'ことばを入力して荷物を運び、街を発展させましょう。住宅地に資材が30たまると、最初の建物を建てられます。',
      ),
      el('div', { className: 'kb-coach-actions' }, skipBtn, nextBtn),
    ),
  );
  return openOnboardingDialog(dialog, nextBtn);
}

function renderOnboardingReceipt(
  economy: CityEconomy,
  achievements: AchievementEngine,
  receipt: OnboardingUiState['receipt'],
  actions: UIControllerActions,
): HTMLDialogElement {
  const earned = (receipt?.unlockedStampIds ?? []).filter((id) => achievements.isUnlocked(id));
  const stampId = earned.includes('A01') ? 'A01' : earned[0] ?? 'A01';
  const stamp = CATALOG_ACHIEVEMENTS.find((item) => item.id === stampId && achievements.isUnlocked(item.id));
  const supportMaterials = BigInt(receipt?.supportMaterialsMicro ?? 0);
  const supportCoins = BigInt(receipt?.supportCoinsMicro ?? 0);
  const support = [
    supportMaterials > 0n ? `資材 +${formatMaterialsRemaining(supportMaterials)}` : '',
    supportCoins > 0n ? `コイン +${formatMaterialsRemaining(supportCoins)}` : '',
  ].filter(Boolean).join('、');

  const nextBtn = el('button', {
    type: 'button', className: 'kb-btn-primary kb-coach-primary-btn', autofocus: true,
    'data-testid': 'onboarding-build-next-btn',
  }, '建築へ進む');
  nextBtn.addEventListener('click', () => actions.beginOnboardingConstruction());
  const skipBtn = el('button', {
    type: 'button', className: 'kb-btn-secondary kb-coach-skip-btn', 'data-testid': 'onboarding-skip-btn',
  }, 'スキップ');
  skipBtn.addEventListener('click', () => actions.skipOnboarding());

  const dialog = el(
    'dialog',
    {
      className: 'kb-card kb-modal kb-onboarding-intro',
      'aria-modal': 'true',
      'aria-labelledby': 'kb-onboarding-receipt-title',
      'data-testid': 'onboarding-receipt',
      'data-onboarding-step': 'S5',
    },
    el('div', { className: 'kb-stack-sm' },
      el('div', {}, el('span', { className: 'kb-badge kb-coach-step-badge' }, 'ステップ 5 / 9')),
      el('h2', { id: 'kb-onboarding-receipt-title', className: 'kb-h2' }, earned.length ? '実績を獲得！' : '配達完了！'),
      stamp ? el('div', { className: 'kb-onboarding-stamp' },
        assetImg(`./assets/achievement_stamp/${stamp.stamp_asset_id}.webp`, '', {
          decorative: true, width: 72, height: 72, fallbackSrc: './assets/shared_frame/stamp_frame.svg',
        }),
        el('div', { className: 'kb-stack-xs' },
          el('strong', {}, `${stamp.name}${earned.length > 1 ? ` ほか${earned.length - 1}枚` : ''}`),
          el('span', { className: 'kb-small' }, earned.length ? '獲得した切手は配達手帳で見られます。' : '配達手帳に入っている切手です。'),
        ),
      ) : null,
      receipt ? el('p', { className: 'kb-coach-body' }, `今回の配達で、住宅地に ${formatMaterials(receipt.generatedMaterialsMicro)} 資材を届けました。`) : null,
      support ? el('p', { className: 'kb-coach-body' },
        el('strong', {}, '街づくり支援 '), support,
        '。最初の建築と設備の購入に使えます。',
      ) : null,
      el('p', { className: 'kb-coach-body' },
        `住宅地の資材 ${formatMaterials(economy.districts.residential.stockMicro)} ・ 所持コイン ${formatCoins(economy.coinsMicro)}`,
      ),
      el('div', { className: 'kb-coach-actions' }, skipBtn, nextBtn),
    ),
  );
  return openOnboardingDialog(dialog, nextBtn);
}

function renderOnboardingStampReveal(
  achievements: AchievementEngine,
  onboarding: OnboardingUiState,
  reducedMotion: boolean,
  actions: UIControllerActions,
): HTMLDialogElement | null {
  const awards = getTutorialRevealIds(achievements, onboarding.receipt);
  const index = onboarding.stampRevealIndex;
  if (index >= awards.length) return null;
  const dialog = renderStampReveal({
    achievementId: awards[index], index, total: awards.length, reducedMotion,
    newlyUnlocked: onboarding.receipt?.unlockedStampIds.includes(awards[index]) ?? false,
    advanceLabel: index === awards.length - 1 ? '届いた資材を見る' : `次へ（あと${awards.length - index - 1}件）`,
    minimumDurationMs: STAMP_REVEAL_DURATION_MS,
    onAdvance: () => actions.advanceOnboardingStampReveal(),
  });
  dialog.classList.add('kb-onboarding-reveal-dialog');
  dialog.dataset.testid = 'onboarding-stamp-reveal';
  dialog.dataset.onboardingStep = 'S5';
  return dialog;
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
  const isS5Onboarding = Boolean(onboarding?.active) && onboarding?.step === 'S5';
  const isHomeOnboarding = isS1Onboarding || isS2Onboarding || isS5Onboarding;

  const selectedDistrict = economy.districts[selectedDistrictId];
  const districtCatalog = CITY_CATALOG.districts.find((d) => d.id === selectedDistrictId);
  const canDeliverToSelected = selectedDistrict.open;

  let s2CoachEl: HTMLElement | null = null;
  if (isS2Onboarding) {
    s2CoachEl = renderCoachMark({
      stepBadge: 'ステップ 2 / 9',
      title: '荷物を運ぶ地区を選ぼう',
      body: '最初の届け先は「住宅地」です。光っている住宅地を選びましょう。',
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
      className: `kb-home-map-viewport${isS2Onboarding ? ' is-onboard-spotlight-map' : ''}`,
    },
    mapEl,
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
    { className: 'kb-card kb-district-summary' },
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
      el('div', { className: 'kb-row-gap' }, upgradeBtn, toUpgradesBtn, toDetailBtn),
    ),
    selectedDistrict.open && nextStage !== null
      ? el(
          'div',
          {
            className: 'kb-stack-xs',
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

  const onboardingBackdrop = isS2Onboarding
    ? el('div', {
        className: 'kb-onboard-backdrop',
        'data-testid': 'onboarding-backdrop',
        'aria-hidden': 'true',
      })
    : null;

  const stepClass = isS2Onboarding ? ' is-onboarding-s2' : '';
  return el(
    'div',
    { className: `kb-home-screen${isHomeOnboarding ? ` is-onboarding${stepClass}` : ''}` },
    onboardingBackdrop,
    mainMapArea,
    bottomStrip,
    difficultyModal,
    isS1Onboarding ? renderOnboardingIntro(actions) : null,
    isS5Onboarding ? renderOnboardingStampReveal(achievements, onboarding, reducedMotion, actions)
      ?? renderOnboardingReceipt(economy, achievements, onboarding.receipt, actions) : null,
  );
}
