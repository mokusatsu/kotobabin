import type { CityEconomy } from '@/economy/cityEconomy';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
} from '@/progression/achievementEngine';
import type { LastResultContext, UIControllerActions } from '../types';
import { featuredStampIds, getResultRevealIds, renderStampReveal } from '../components/stampReveal';
import { assetImg, el } from '../utils/dom';
import {
  COURSE_LABELS,
  DISTRICT_NAME_MAP,
  formatCoins,
  formatRatePerSec,
  getAffordableUpgradeFlags,
} from '../utils/format';

export interface ResultScreenProps {
  result: LastResultContext;
  economy: CityEconomy;
  achievements: AchievementEngine;
  pinnedAchievementId: string | null;
  revealIndex: number;
  revealDone: boolean;
  reducedMotion: boolean;
  actions: UIControllerActions;
  onAdvanceReveal: () => void;
  onSkipReveal: () => void;
  onReplayReveal: () => void;
  replayWaitState?: 'idle' | 'waiting' | 'retry';
  onRetrySameSeed: () => void;
  onRetryNewSeed: () => void;
  onReviewMistakes: () => void;
}

function formatWholeMaterials(micro: bigint | string): string {
  const val = typeof micro === 'string' ? BigInt(micro) : micro;
  return Math.floor(Number(val / 1_000_000n)).toLocaleString('ja-JP');
}

export function renderResultScreen(props: ResultScreenProps): HTMLElement {
  const {
    result,
    economy,
    achievements,
    pinnedAchievementId,
    revealIndex,
    revealDone,
    reducedMotion,
    actions,
    onAdvanceReveal,
    onSkipReveal,
    onReplayReveal,
    replayWaitState,
    onRetrySameSeed,
    onRetryNewSeed,
    onReviewMistakes,
  } = props;

  const { snapshot, evaluation, economySummary } = result;
  const newIds = evaluation.newlyUnlockedAchievementIds;
  const displayNewIds = featuredStampIds(newIds);
  const revealIds = getResultRevealIds(evaluation);

  // Phase 1: One-by-one stamp unlock dialogs
  if (!revealDone && revealIds.length > 0) {
    const safeIdx = Math.min(Math.max(0, revealIndex), revealIds.length - 1);
    const isLast = safeIdx >= revealIds.length - 1;
    const card = renderStampReveal({
      achievementId: revealIds[safeIdx], index: safeIdx, total: revealIds.length, reducedMotion,
      advanceLabel: isLast ? '配達結果を見る' : `次へ（あと${revealIds.length - 1 - safeIdx}件）`,
      onAdvance: onAdvanceReveal, onSkip: onSkipReveal,
    });

    return el(
      'section',
      {
        className: 'kb-gacha-stage',
        'aria-label': '獲得演出',
      },
      el('div', { className: 'kb-secondary kb-small' }, '90秒の配達お疲れさまでした！'),
      card,
    );
  }

  const pinnedDef = pinnedAchievementId
    ? CATALOG_ACHIEVEMENTS.find((a) => a.id === pinnedAchievementId)
    : undefined;
  const pinnedUnlocked = pinnedDef ? achievements.isUnlocked(pinnedDef.id) : false;

  // Left 38%: Typing stats
  const scoreValueEl = el('strong', { className: 'kb-score-value' }, `${snapshot.score.toLocaleString('ja-JP')}点`);
  const prefersReduced =
    typeof window !== 'undefined' &&
    (document.documentElement.getAttribute('data-reduced-motion') === 'true' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (snapshot.score > 0 && !prefersReduced && typeof requestAnimationFrame === 'function') {
    const targetScore = snapshot.score;
    const start = performance.now();
    const duration = 450;
    scoreValueEl.textContent = '0点';
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreValueEl.textContent = `${Math.round(targetScore * eased).toLocaleString('ja-JP')}点`;
      if (t < 1 && scoreValueEl.isConnected) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  const resultHeading = el('h2', { className: 'kb-h2', tabindex: -1 }, '配達結果');
  queueMicrotask(() => resultHeading.focus({ preventScroll: true }));
  const leftCard = el(
    'section',
    { className: 'kb-card kb-stack-md', 'aria-label': '配達結果' },
    el(
      'div',
      { className: 'kb-row-between' },
      resultHeading,
      el('span', { className: 'kb-badge' }, `${COURSE_LABELS[snapshot.courseId]}・${DISTRICT_NAME_MAP[snapshot.districtId]}`),
    ),
    snapshot.mistakeCount === 0 && snapshot.completedWordCount > 0
      ? el('div', { className: 'kb-badge kb-streak-pill' }, 'ノーミス完走！お見事です！')
      : null,
    evaluation.recordUpdates?.speed || evaluation.recordUpdates?.score
      ? el('p', { className: 'kb-badge is-earned', role: 'status' },
          `自己ベスト更新！ ${[evaluation.recordUpdates.speed && '速さ', evaluation.recordUpdates.score && 'スコア'].filter(Boolean).join('・')}`)
      : null,
    el(
      'div',
      { className: 'kb-score-hero' },
      el('span', { className: 'kb-secondary kb-small' }, '確定スコア'),
      scoreValueEl,
      el('span', { className: 'kb-secondary kb-small' }, `基本 ${snapshot.baseScore}点 + 配達ボーナス ${snapshot.deliveryBonus}点`),
    ),
    el(
      'dl',
      { className: 'kb-stat-list' },
      el('dt', {}, '完了した語'),
      el('dd', {}, `${snapshot.completedWordCount}語`),
      el('dt', {}, '正確率'),
      el('dd', {}, snapshot.accuracyDisplayed),
      el('dt', {}, '入力速度（1分間の打鍵数）'),
      el('dd', {}, `${snapshot.canonicalKpmDisplayed} KPM`),
      el('dt', {}, '最長ノーミス連続'),
      el('dd', {}, `${snapshot.longestCleanStreak}語`),
    ),
    pinnedDef
      ? el(
          'div',
          { className: 'kb-stamp-card kb-small' },
          el('strong', {}, `目標: ${pinnedDef.hidden && !pinnedUnlocked ? '？？？' : pinnedDef.name}`),
          el('div', { className: pinnedUnlocked ? 'kb-reward-text' : 'kb-secondary' }, pinnedUnlocked ? '達成しました！' : '未達成'),
        )
      : null,
  );

  // Right 62%: Stamps & City impact
  const stampsSection = el(
    'div',
    { className: 'kb-stack-sm' },
    el(
      'div',
      { className: 'kb-row-between' },
      el('h3', { className: 'kb-h3' }, '獲得した切手'),
      el('span', { className: 'kb-badge' }, `合計 ${evaluation.totalUnlockedCount} / ${CATALOG_ACHIEVEMENTS.length}`),
    ),
    newIds.length > 0
      ? el(
          'div',
          { className: 'kb-celebration-banner kb-stack-sm' },
          el('strong', {}, `祝！新しい切手を ${newIds.length} 枚獲得しました！`),
          el(
            'div',
            { className: 'kb-row-wrap' },
            ...displayNewIds.map((id) => {
              const def = CATALOG_ACHIEVEMENTS.find((a) => a.id === id);
              return el(
                'div',
                { className: 'kb-stamp-card kb-stamp-unlocked-pop kb-row-gap' },
                el(
                  'div',
                  { className: 'kb-stamp-art-wrap' },
                  assetImg(
                    `./assets/achievement_stamp/${def?.stamp_asset_id ?? `stamp_${id.toLowerCase()}`}.webp`,
                    '',
                    { decorative: true, width: 46, height: 46, className: 'kb-stamp-inner-art is-earned' },
                  ),
                  assetImg('./assets/shared_frame/stamp_frame.svg', '', {
                    decorative: true,
                    width: 56,
                    height: 56,
                    className: 'kb-stamp-frame-overlay',
                  }),
                ),
                el(
                  'div',
                  {},
                  el('strong', {}, def?.name ?? id),
                  el('div', { className: 'kb-secondary kb-small' }, def?.condition ?? ''),
                  el('div', { className: 'kb-reward-text kb-small' }, `報酬: 称号「${def?.name ?? id}」`),
                ),
              );
            }),
          ),
        newIds.length > displayNewIds.length
            ? el('div', { className: 'kb-small' }, `ほか ${newIds.length - displayNewIds.length} 枚の切手も「配達手帳」に届いています。`)
            : null,
        )
      : el('p', { className: 'kb-secondary kb-small' }, '今回の新しい切手はありませんでした。'),
  );

  const stageChanged = result.districtAfterStage > result.districtBeforeStage;
  const citySection = el(
    'div',
    { className: 'kb-stack-sm' },
    el('h3', { className: 'kb-h3' }, `街の反応（${DISTRICT_NAME_MAP[snapshot.districtId]}）`),
    stageChanged
      ? el(
          'div',
          { className: 'kb-banner-info kb-row-gap' },
          assetImg('./assets/ui_icon/ui_check.svg', '', { decorative: true, width: 20, height: 20 }),
          el('strong', {}, `Lv.${result.districtBeforeStage} → Lv.${result.districtAfterStage} に成長しました！`),
        )
      : null,
    el(
      'dl',
      { className: 'kb-stat-list' },
      el('dt', {}, '生産した資材'),
      el('dd', {}, `${economySummary ? formatWholeMaterials(economySummary.generated_micro) : '0'} 資材`),
      el('dt', {}, '便中に到着した資材'),
      el('dd', {}, `${economySummary ? formatWholeMaterials(economySummary.arrived_during_session_micro) : '0'} 資材`),
      el('dt', {}, '輸送待ち（街へ運ばれている途中の資材）'),
      el('dd', {}, `${formatWholeMaterials(economy.districts[snapshot.districtId].queueMicro)} 資材`),
      el('dt', {}, '配達・店舗コイン'),
      el(
        'dd',
        {},
        `+${economySummary ? formatCoins(BigInt(economySummary.delivery_coins_micro) + BigInt(economySummary.shop_coins_micro)) : '0'} コイン`,
      ),
      el('dt', {}, '店舗収益'),
      el(
        'dd',
        {},
        `${formatRatePerSec(result.incomeBeforePerSecMicro)} → ${formatRatePerSec(result.incomeAfterPerSecMicro)}`,
      ),
    ),
  );

  const distState = economy.districts[snapshot.districtId];
  const nextPackCoins = economy.nextPriceCoins('packaging', economy.packagingLevel);
  const packNeedCoins = Math.max(0, nextPackCoins - Math.floor(Number(economy.coinsMicro / 1_000_000n)));
  const nextDistStage = distState.stage < 5 ? distState.stage + 1 : null;
  const nextDistReqMicro =
    nextDistStage !== null ? economy.developmentCost(snapshot.districtId, nextDistStage).materialsMicro : 0n;
  const canUpgradeDistrict = nextDistStage !== null && distState.stockMicro >= nextDistReqMicro;
  const nextGoalLine = canUpgradeDistrict
    ? `${DISTRICT_NAME_MAP[snapshot.districtId]} Lv.${nextDistStage} へアップグレード可能です！`
    : nextDistStage !== null
      ? `次の目標: ${DISTRICT_NAME_MAP[snapshot.districtId]} Lv.${nextDistStage}まで あと ${formatWholeMaterials(nextDistReqMicro - distState.stockMicro)} 資材`
      : packNeedCoins === 0
        ? `次の目標: 「街の設備」で荷づくり台 Lv.${economy.packagingLevel + 1} を購入できます！`
        : `次の目標: 荷づくり台 Lv.${economy.packagingLevel + 1} まであと ${packNeedCoins} コイン`;

  const resultUpgradeBtn = canUpgradeDistrict
    ? el(
        'button',
        { type: 'button', className: 'kb-btn-primary', 'data-testid': 'result-upgrade-district-btn' },
        `Lv.${nextDistStage} へアップグレード（${formatWholeMaterials(nextDistReqMicro)} 資材）`,
      )
    : null;
  if (resultUpgradeBtn) {
    resultUpgradeBtn.addEventListener('click', () => actions.upgradeDistrict(snapshot.districtId));
  }

  const rightCard = el(
    'section',
    { className: 'kb-card kb-stack-md', 'aria-label': '街と手帳の成果' },
    stampsSection,
    citySection,
    el(
      'div',
      { className: 'kb-onboarding-banner kb-small kb-row-between' },
      el('strong', {}, nextGoalLine),
      resultUpgradeBtn,
    ),
  );

  // Action buttons
  const affordable = getAffordableUpgradeFlags(economy, snapshot.districtId);
  const sameBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-primary',
      disabled: replayWaitState === 'waiting' },
    el('span', {}, replayWaitState === 'waiting' ? '記録を確認中…'
      : replayWaitState === 'retry' ? '保存済みの記録で同じ問題を始める' : '同じ問題でもう一度'),
    el('kbd', { className: 'kb-kbd' }, 'Enter'),
  );
  sameBtn.addEventListener('click', onRetrySameSeed);

  const newSeedBtn = el('button', { type: 'button', className: 'kb-btn-secondary' }, '別の問題');
  newSeedBtn.addEventListener('click', onRetryNewSeed);

  const upgradesBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary kb-row-gap' },
    el('span', {}, '街の設備'),
    el('kbd', { className: 'kb-kbd' }, 'J'),
    affordable.any ? el('span', { className: 'kb-affordable-dot' }, '強化可') : null,
  );
  upgradesBtn.addEventListener('click', () => actions.navigate('UPGRADES'));

  const reviewBtn = el('button', { type: 'button', className: 'kb-btn-secondary' }, '復習');
  reviewBtn.addEventListener('click', onReviewMistakes);

  const handbookBtn = el('button', { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, '手帳'), el('kbd', { className: 'kb-kbd' }, 'K'));
  handbookBtn.addEventListener('click', () => actions.navigate('HANDBOOK'));

  const homeBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, 'ホームへ'),
    el('kbd', { className: 'kb-kbd' }, 'H'),
  );
  homeBtn.addEventListener('click', () => actions.navigate('HOME'));

  const replayGachaBtn =
    revealIds.length > 0
      ? (() => {
          const btn = el('button', { type: 'button', className: 'kb-btn-secondary' }, '獲得演出をもう一度');
          btn.addEventListener('click', onReplayReveal);
          return btn;
        })()
      : null;

  const actionsBar = el(
    'div',
    { className: 'kb-row-wrap kb-result-actions' },
    sameBtn,
    newSeedBtn,
    upgradesBtn,
    reviewBtn,
    handbookBtn,
    replayGachaBtn,
    homeBtn,
  );

  return el(
    'div',
    { className: 'kb-stack-md' },
    el('div', { className: 'kb-grid-result' }, leftCard, rightCard),
    actionsBar,
  );
}
