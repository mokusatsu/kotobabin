import { CATALOG_ACHIEVEMENTS, CATALOG_REWARDS, type AchievementEngine, type EvaluationResult } from '@/progression/achievementEngine';
import type { OnboardingReceipt } from '@/progression/profileRepository';
import { assetImg, el } from '../utils/dom';
import { getRewardPreviewAsset } from '../utils/rewardArt';
import { renderStampDialogBody } from './stampDialog';

export const STAMP_REVEAL_DURATION_MS = 2200;
const TUTORIAL_STAMP_IDS = ['A01', 'A02', 'A03'];

const revealRewards = new Map(CATALOG_REWARDS.filter((reward) =>
  reward.kind === 'postcard' || reward.kind === 'frame').map((reward) => [reward.id, reward]));

export function rewardRevealIds(ids: readonly string[] = []): string[] {
  return [...new Set(ids)].filter((id) => revealRewards.has(id));
}

export function getTutorialRevealIds(achievements: AchievementEngine, receipt?: OnboardingReceipt | null): string[] {
  const stamps = [...new Set([...TUTORIAL_STAMP_IDS, ...(receipt?.unlockedStampIds ?? [])])]
    .filter((id) => achievements.isUnlocked(id)).slice(0, 3);
  return [...stamps, ...rewardRevealIds(receipt?.unlockedRewardIds)];
}

export function getResultRevealIds(evaluation?: EvaluationResult): string[] {
  return [...featuredStampIds(evaluation?.newlyUnlockedAchievementIds ?? []), ...rewardRevealIds(evaluation?.newlyUnlockedRewardIds)];
}

export function featuredStampIds(ids: readonly string[]): string[] {
  const featured = new Map<string, { id: string; target: number }>();
  for (const id of ids) {
    const def = CATALOG_ACHIEVEMENTS.find((item) => item.id === id);
    const series = def && 'seriesId' in def ? def : undefined;
    const key = series?.seriesId ?? id;
    const target = series?.target ?? 0;
    if (!featured.has(key) || featured.get(key)!.target < target) featured.set(key, { id, target });
  }
  return Array.from(featured.values(), ({ id }) => id).slice(0, 3);
}

export function renderStampReveal(options: {
  achievementId: string;
  index: number;
  total: number;
  reducedMotion: boolean;
  newlyUnlocked?: boolean;
  advanceLabel: string;
  onAdvance: () => void;
  onSkip?: () => void;
  minimumDurationMs?: number;
}): HTMLDialogElement {
  const { achievementId, index, total, reducedMotion, advanceLabel, onAdvance, onSkip } = options;
  const def = CATALOG_ACHIEVEMENTS.find((a) => a.id === achievementId);
  const reward = revealRewards.get(achievementId);
  const name = reward?.name ?? def?.name ?? achievementId;
  const rewardType = reward?.kind === 'postcard' ? '絵葉書' : '額縁';
  const duration = options.minimumDurationMs ?? 0;
  const nextBtn = el('button', {
    type: 'button', className: 'kb-btn-primary', 'data-testid': 'gacha-next-btn', disabled: duration > 0,
  },
    el('span', {}, advanceLabel),
    el('kbd', { className: 'kb-kbd' }, 'Enter / Space'),
  );
  nextBtn.addEventListener('click', () => {
    if (!nextBtn.disabled) onAdvance();
  });
  const skipBtn = onSkip ? el('button', {
    type: 'button', className: 'kb-btn-secondary', 'data-testid': 'gacha-skip-btn',
  }, el('span', {}, '演出をスキップ'), el('kbd', { className: 'kb-kbd' }, 'Esc')) : null;
  if (onSkip) skipBtn?.addEventListener('click', onSkip);

  const info = el('div', { className: 'kb-stamp-dialog-info-col kb-stack-md' },
      el('div', { className: 'kb-row-wrap' },
        el('span', { className: 'kb-badge is-earned' }, reward ? `${rewardType}を獲得`
          : options.newlyUnlocked === false ? '獲得済みの切手' : 'NEW! 切手獲得'),
        el('span', { className: 'kb-badge' }, `${index + 1} / ${total}`),
      ),
      el('div', { className: 'kb-stamp-dialog-header' },
        el('h2', { id: 'kb-stamp-reveal-title', className: 'kb-h2' }, name),
      ),
      el('div', { className: 'kb-stack-xs' },
        el('strong', {}, '解除条件'),
        el('p', { className: 'kb-stamp-dialog-condition' }, reward?.trigger ?? def?.condition ?? ''),
      ),
      reward ? null : el('div', { className: 'kb-stamp-card kb-gacha-reward' },
        el('strong', {}, '獲得報酬'),
        el('div', {}, `称号「${name}」`),
      ),
      el('div', { className: 'kb-stamp-dialog-actions' }, nextBtn, skipBtn),
  );
  const card = reward
    ? el('div', { className: 'kb-stamp-dialog-body' },
        assetImg(getRewardPreviewAsset(reward), name, { className: 'kb-reward-reveal-art' }), info)
    : renderStampDialogBody({
        stampAssetId: def?.stamp_asset_id ?? `stamp_${achievementId.toLowerCase()}`,
        tierLabel: def && 'seriesId' in def ? def.tierLabel : undefined,
        unlocked: true,
        info,
      });
  card.classList.add('kb-stamp-reveal');
  if (reducedMotion) card.classList.add('is-reduced-motion');
  card.dataset.revealId = achievementId;
  card.dataset.testid = 'gacha-reveal-card';
  card.querySelector('.kb-stamp-dialog-preview')?.appendChild(
    el('div', { className: 'kb-stamp-reveal-halo', 'aria-hidden': 'true' }),
  );
  const dialog = el('dialog', {
    className: 'kb-stamp-dialog kb-stamp-reveal-dialog', 'aria-modal': 'true',
    'aria-labelledby': 'kb-stamp-reveal-title', tabindex: -1,
  }, card);
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onSkip?.();
  });
  queueMicrotask(() => {
    if (!card.isConnected) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
    if (duration > 0) {
      const startHold = () => {
        if (!card.isConnected) return;
        window.setTimeout(() => {
          if (!card.isConnected) return;
          nextBtn.disabled = false;
          nextBtn.focus();
        }, duration);
      };
      // Start after the mounted card and its dialog have painted.
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(startHold));
      } else startHold();
    } else nextBtn.focus();
  });
  return dialog;
}
