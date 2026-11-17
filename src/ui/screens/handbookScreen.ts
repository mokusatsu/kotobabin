import { ACHIEVEMENT_CATALOG } from '@/contracts/data';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
  CATALOG_REWARDS,
  type AchievementFamilyId,
  type CatalogAchievementDefinition,
  type UnlockRecord,
} from '@/progression/achievementEngine';
import type { ReadStateRecord } from '@/progression/profileRepository';
import type { UIControllerActions } from '../types';
import { assetImg, el } from '../utils/dom';

export type HandbookFilter = 'all' | 'locked' | 'unlocked';
export type HandbookTab = 'stamps' | 'collection';

export interface HandbookScreenProps {
  achievements: AchievementEngine;
  unlocks: Record<string, UnlockRecord>;
  readState: Record<string, ReadStateRecord>;
  pinnedAchievementId: string | null;
  equippedTitleId: string | null;
  equippedFrameId: string | null;
  selectedFamily: AchievementFamilyId;
  selectedAchievementId: string | null;
  filter: HandbookFilter;
  tab: HandbookTab;
  revealedHiddenIds: ReadonlySet<string>;
  onSelectFamily: (familyId: AchievementFamilyId) => void;
  onSelectAchievement: (achievementId: string | null) => void;
  onSetFilter: (filter: HandbookFilter) => void;
  onSetTab: (tab: HandbookTab) => void;
  onRevealHidden: (achievementId: string) => void;
  actions: UIControllerActions;
}

const FAMILIES = ACHIEVEMENT_CATALOG.families as readonly {
  id: AchievementFamilyId;
  name: string;
  emblem_asset_id: string;
  postcard_name: string;
  foil_board_name: string;
}[];

const SCOPE_LABELS: Record<CatalogAchievementDefinition['scope'], string> = {
  全: '全モード',
  練: '練習',
  便: '本編（90秒）',
  通常: '通常本編（ガイド・スキップ条件なし）',
  街: '街づくり',
};

function getRewardPreviewAsset(reward: { id: string; kind: string }): string {
  if (reward.kind === 'frame') {
    return './assets/shared_frame/stamp_frame.svg';
  }
  if (reward.kind === 'postcard') {
    return `./assets/postcard/${reward.id}.webp`;
  }
  return './assets/shared_frame/board_foil.svg';
}

function attachLightDismissFallback(dialog: HTMLDialogElement): void {
  if (typeof HTMLDialogElement === 'undefined' || 'closedBy' in HTMLDialogElement.prototype) {
    return;
  }
  const isOutside = (e: PointerEvent): boolean => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (e) => {
    pressedOutside = isOutside(e);
  });
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && isOutside(e)) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new Event('close'));
      }
    }
    pressedOutside = false;
  });
}

export function renderHandbookScreen(props: HandbookScreenProps): HTMLElement {
  const {
    achievements,
    unlocks,
    readState,
    pinnedAchievementId,
    equippedTitleId,
    equippedFrameId,
    selectedFamily,
    selectedAchievementId,
    filter,
    tab,
    revealedHiddenIds,
    onSelectFamily,
    onSelectAchievement,
    onSetFilter,
    onSetTab,
    onRevealHidden,
    actions,
  } = props;

  const unlockedCount = achievements.getUnlockedCount();

  // Top mode switch (切手台紙 / コレクション・装飾)
  const stampsTabBtn = el(
    'button',
    {
      type: 'button',
      className: `kb-pill-btn${tab === 'stamps' ? ' is-selected' : ''}`,
    },
    `切手台紙 (${unlockedCount}/${CATALOG_ACHIEVEMENTS.length})`,
  );
  stampsTabBtn.addEventListener('click', () => onSetTab('stamps'));

  const collectionTabBtn = el(
    'button',
    {
      type: 'button',
      className: `kb-pill-btn${tab === 'collection' ? ' is-selected' : ''}`,
    },
    '絵葉書・称号・額縁',
  );
  collectionTabBtn.addEventListener('click', () => onSetTab('collection'));

  const topBar = el('div', { className: 'kb-row-between' }, el('div', { className: 'kb-row-gap' }, stampsTabBtn, collectionTabBtn));

  if (tab === 'collection') {
    const unlockedRewards = new Set(achievements.getUnlockedRewardIds());
    const unlockedTitles = CATALOG_ACHIEVEMENTS.filter((a) => achievements.isUnlocked(a.id));

    const framesSection = el(
      'section',
      { className: 'kb-card kb-stack-sm' },
      el('h3', { className: 'kb-h3' }, '記念品・額縁・絵葉書'),
      el(
        'div',
        { className: 'kb-row-wrap' },
        ...CATALOG_REWARDS.map((r) => {
          const owned = unlockedRewards.has(r.id);
          const isFrame = r.kind === 'frame';
          const isEquipped = equippedFrameId === r.id;
          const btn = isFrame
            ? el(
                'button',
                {
                  type: 'button',
                  className: isEquipped ? 'kb-btn-primary' : 'kb-btn-secondary',
                  disabled: !owned,
                },
                isEquipped ? '装着中（外す）' : owned ? '額縁を装着' : '未獲得',
              )
            : null;
          if (btn) {
            btn.addEventListener('click', () => actions.equipFrame(isEquipped ? null : r.id));
          }
          return el(
            'div',
            { className: `kb-stamp-card kb-reward-card${owned ? ' is-owned' : ''}` },
            el(
              'div',
              { className: 'kb-row-between' },
              assetImg(getRewardPreviewAsset(r), '', {
                decorative: true,
                width: r.kind === 'postcard' ? 72 : 44,
                height: r.kind === 'postcard' ? 45 : 44,
                className: `kb-reward-art${owned ? '' : ' is-locked'}`,
              }),
              assetImg(
                owned ? './assets/ui_icon/ui_check.svg' : './assets/ui_icon/ui_lock.svg',
                '',
                { decorative: true, width: 18, height: 18 },
              ),
            ),
            el('strong', {}, r.name),
            el('div', { className: 'kb-secondary kb-small' }, r.trigger),
            btn,
          );
        }),
      ),
    );

    const titlesSection = el(
      'section',
      { className: 'kb-card kb-stack-sm' },
      el('h3', { className: 'kb-h3' }, '称号（1件まで装着）'),
      unlockedTitles.length === 0
        ? el('p', { className: 'kb-secondary' }, '切手を獲得すると称号が解放されます。')
        : el(
            'div',
            { className: 'kb-row-wrap' },
            ...unlockedTitles.map((a) => {
              const isEquipped = equippedTitleId === a.title_id;
              const btn = el(
                'button',
                {
                  type: 'button',
                  className: `kb-pill-btn${isEquipped ? ' is-selected' : ''}`,
                },
                isEquipped ? `✓ ${a.name}（装着中）` : a.name,
              );
              btn.addEventListener('click', () => actions.equipTitle(isEquipped ? null : a.title_id));
              return btn;
            }),
          ),
    );

    return el('div', { className: 'kb-stack-md' }, topBar, framesSection, titlesSection);
  }

  // Left 16%: 12 families A-L
  const leftCol = el(
    'aside',
    { className: 'kb-card kb-stack-xs', 'aria-label': '実績系統' },
    ...FAMILIES.map((fam) => {
      const items = CATALOG_ACHIEVEMENTS.filter((a) => a.family_id === fam.id);
      const earned = items.filter((a) => achievements.isUnlocked(a.id)).length;
      const isComplete = earned === items.length && items.length > 0;
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-cat-btn${selectedFamily === fam.id ? ' is-selected' : ''}${isComplete ? ' is-foil' : ''}`,
          'aria-current': selectedFamily === fam.id ? 'true' : undefined,
        },
        el('span', {}, `${fam.id}. ${fam.name}`),
        el('span', { className: 'kb-small kb-secondary' }, `${earned}/${items.length}`),
      );
      btn.addEventListener('click', () => {
        onSelectFamily(fam.id);
      });
      return btn;
    }),
  );

  // Center 48%: Filter + 3x2 grid
  const familyDef = FAMILIES.find((f) => f.id === selectedFamily)!;
  const familyAchievements = CATALOG_ACHIEVEMENTS.filter((a) => a.family_id === selectedFamily);
  const familyComplete =
    familyAchievements.length > 0 && familyAchievements.every((a) => achievements.isUnlocked(a.id));

  const filterBar = el(
    'div',
    { className: 'kb-row-gap', role: 'group', 'aria-label': '表示フィルタ' },
    ...(['all', 'locked', 'unlocked'] as const).map((f) => {
      const label = f === 'all' ? 'すべて' : f === 'locked' ? '未解除' : '解除済み';
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${filter === f ? ' is-selected' : ''}`,
        },
        label,
      );
      btn.addEventListener('click', () => onSetFilter(f));
      return btn;
    }),
  );

  const visibleStamps = familyAchievements.filter((a) => {
    const unlocked = achievements.isUnlocked(a.id);
    if (filter === 'locked') return !unlocked;
    if (filter === 'unlocked') return unlocked;
    return true;
  });

  const stampGrid = el(
    'div',
    { className: `kb-stamp-grid${familyComplete ? ' is-foil-board' : ''}` },
    ...visibleStamps.map((a) => {
      const unlocked = achievements.isUnlocked(a.id);
      const isHiddenUnrevealed = a.hidden && !unlocked && !revealedHiddenIds.has(a.id);
      const isPinned = pinnedAchievementId === a.id;
      const isSelected = selectedAchievementId === a.id;
      const isUnread = unlocked && readState[`achievement:${a.id}`]?.read !== true;

      const cardBtn = el(
        'button',
        {
          type: 'button',
          className: `kb-stamp-tile${unlocked ? ' is-earned' : ' is-unearned'}${isSelected ? ' is-selected' : ''}`,
          'aria-label': isHiddenUnrevealed
            ? '秘密の切手（未解除）'
            : `${a.name}（${unlocked ? '獲得済み' : '未解除'}）`,
        },
        el(
          'div',
          { className: 'kb-stamp-tile-media' },
          isHiddenUnrevealed
            ? assetImg('./assets/ui_icon/ui_question.svg', '', {
                decorative: true,
                className: 'kb-stamp-inner-emblem',
              })
            : assetImg(`./assets/achievement_stamp/${a.stamp_asset_id}.webp`, '', {
                decorative: true,
                className: `kb-stamp-inner-art${unlocked ? ' is-earned' : ''}`,
              }),
          assetImg('./assets/shared_frame/stamp_frame.svg', '', {
            decorative: true,
            className: 'kb-stamp-frame-overlay',
          }),
          isPinned || isUnread
            ? el(
                'div',
                { className: 'kb-stamp-tile-top' },
                isPinned
                  ? el(
                      'span',
                      { className: 'kb-stamp-badge-pill' },
                      assetImg('./assets/ui_icon/ui_pin.svg', '目標', {
                        width: 14,
                        height: 14,
                        className: 'kb-pin-icon',
                      }),
                      el('span', {}, '目標'),
                    )
                  : el('span', {}),
                isUnread
                  ? el(
                      'span',
                      { className: 'kb-stamp-badge-pill is-unread' },
                      assetImg('./assets/ui_icon/ui_unread.svg', '未読', {
                        width: 14,
                        height: 14,
                        className: 'kb-unread-icon',
                      }),
                      el('span', {}, 'NEW'),
                    )
                  : el('span', {}),
              )
            : null,
          el(
            'div',
            { className: 'kb-stamp-tile-overlay' },
            el('strong', { className: 'kb-stamp-tile-title' }, isHiddenUnrevealed ? '？？？' : a.name),
            el(
              'span',
              { className: `kb-stamp-tile-status${unlocked ? ' is-earned' : ''}` },
              unlocked ? '✓ 獲得' : '未解除',
            ),
          ),
        ),
      );
      cardBtn.addEventListener('click', () => {
        onSelectAchievement(a.id);
        if (isUnread) {
          actions.markAchievementRead(a.id);
        }
      });
      return cardBtn;
    }),
  );

  const centerCol = el(
    'section',
    { className: 'kb-card kb-stack-md kb-handbook-main', 'aria-label': '切手一覧' },
    el(
      'div',
      { className: 'kb-row-between' },
      el('h2', { className: 'kb-h2' }, `${familyDef.id}. ${familyDef.name}`),
      familyComplete ? el('span', { className: 'kb-milestone-badge' }, `箔押し完成: ${familyDef.foil_board_name}`) : null,
    ),
    filterBar,
    stampGrid,
  );

  // Detail popup dialog when a stamp is clicked
  const detailDef = selectedAchievementId
    ? CATALOG_ACHIEVEMENTS.find((a) => a.id === selectedAchievementId) ?? null
    : null;

  let detailDialog: HTMLDialogElement | null = null;
  if (detailDef) {
    const detailUnlocked = achievements.isUnlocked(detailDef.id);
    const detailHidden = detailDef.hidden && !detailUnlocked && !revealedHiddenIds.has(detailDef.id);
    const detailUnlockRecord = unlocks[detailDef.id];
    const isPinned = pinnedAchievementId === detailDef.id;

    const dialog = document.createElement('dialog');
    dialog.className = 'kb-stamp-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'kb-stamp-dialog-title');

    const closeDialog = (): void => {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        onSelectAchievement(null);
      }
    };

    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
      onSelectAchievement(null);
    });
    attachLightDismissFallback(dialog);

    const headerCloseBtn = el(
      'button',
      {
        type: 'button',
        className: 'kb-stamp-dialog-close',
        'aria-label': '詳細を閉じる',
      },
      '✕',
    );
    headerCloseBtn.addEventListener('click', closeDialog);

    const pinBtn = el(
      'button',
      {
        type: 'button',
        className: isPinned ? 'kb-btn-secondary' : 'kb-btn-primary',
      },
      assetImg('./assets/ui_icon/ui_pin.svg', '', { decorative: true, width: 18, height: 18 }),
      el('span', {}, isPinned ? '目標のピンを外す' : '今回の目標にする'),
    );
    pinBtn.addEventListener('click', () => actions.pinAchievement(isPinned ? null : detailDef.id));

    const bottomCloseBtn = el(
      'button',
      {
        type: 'button',
        className: 'kb-btn-secondary',
      },
      '閉じる',
    );
    bottomCloseBtn.addEventListener('click', closeDialog);

    const revealBtn = detailHidden
      ? (() => {
          const b = el('button', { type: 'button', className: 'kb-btn-secondary' }, '条件を見る');
          b.addEventListener('click', () => onRevealHidden(detailDef.id));
          return b;
        })()
      : null;

    const artCol = el(
      'div',
      { className: 'kb-stamp-dialog-art-col' },
      el(
        'div',
        { className: `kb-stamp-dialog-preview${detailUnlocked ? ' is-earned' : ''}` },
        detailHidden
          ? assetImg('./assets/ui_icon/ui_question.svg', '', {
              decorative: true,
              className: 'kb-stamp-inner-emblem',
            })
          : assetImg(`./assets/achievement_stamp/${detailDef.stamp_asset_id}.webp`, '', {
              decorative: true,
              className: `kb-stamp-inner-art${detailUnlocked ? ' is-earned' : ''}`,
            }),
        assetImg('./assets/shared_frame/stamp_frame.svg', '', {
          decorative: true,
          className: 'kb-stamp-frame-overlay',
        }),
      ),
    );

    const infoCol = el(
      'div',
      { className: 'kb-stamp-dialog-info-col kb-stack-md' },
      el(
        'div',
        { className: 'kb-stamp-dialog-header' },
        el('h3', { id: 'kb-stamp-dialog-title', className: 'kb-h2' }, detailHidden ? '秘密の切手' : detailDef.name),
        headerCloseBtn,
      ),
      el(
        'div',
        { className: 'kb-row-wrap' },
        el(
          'span',
          { className: `kb-badge${detailUnlocked ? ' is-earned' : ''}` },
          detailUnlocked ? '✓ 獲得済み' : '未解除',
        ),
        el('span', { className: 'kb-badge' }, `対象: ${SCOPE_LABELS[detailDef.scope]}`),
      ),
      el(
        'p',
        { className: 'kb-stamp-dialog-condition' },
        detailHidden
          ? `ヒント: ${detailDef.hidden_hint ?? '条件は隠されています。'}`
          : detailDef.condition,
      ),
      revealBtn,
      detailUnlocked && detailUnlockRecord
        ? el(
            'div',
            { className: 'kb-banner-info kb-small' },
            detailUnlockRecord.unlockedAt >= 1_000_000_000_000
              ? `獲得日: ${new Date(detailUnlockRecord.unlockedAt).toLocaleDateString('ja-JP')}`
              : '獲得済み',
          )
        : null,
      el(
        'div',
        { className: 'kb-stamp-card kb-small' },
        el('strong', {}, '獲得報酬'),
        el('div', {}, `称号「${detailHidden ? '？？？' : detailDef.name}」`),
      ),
      el('div', { className: 'kb-stamp-dialog-actions' }, pinBtn, bottomCloseBtn),
    );

    dialog.appendChild(el('div', { className: 'kb-stamp-dialog-body' }, artCol, infoCol));

    queueMicrotask(() => {
      if (!dialog.isConnected || dialog.open) return;
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    });

    detailDialog = dialog;
  }

  return el(
    'div',
    { className: 'kb-stack-md' },
    topBar,
    el('div', { className: 'kb-grid-handbook' }, leftCol, centerCol),
    detailDialog,
  );
}
