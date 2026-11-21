import { ACHIEVEMENT_CATALOG } from '@/contracts/data';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
  CATALOG_REWARDS,
  type AchievementFamilyId,
  type CatalogAchievementDefinition,
  type CatalogRewardDefinition,
  type UnlockRecord,
} from '@/progression/achievementEngine';
import {
  SERIES_BY_ID, SERIES_CATEGORIES, SERIES_COURSES, SERIES_DISTRICTS, SERIES_RESEARCH, SERIES_TOPICS,
  STAMP_SERIES, type SeriesCategory,
} from '@/progression/stampSeries';
import type { ReadStateRecord } from '@/progression/profileRepository';
import { getEquippedStampFrameAsset, STAMP_FRAME_GROUPS, STAMP_FRAMES } from '@/progression/stampFrameCatalog';
import type { UIControllerActions } from '../types';
import { renderStampArt, renderStampDialogBody } from '../components/stampDialog';
import { assetImg, el } from '../utils/dom';
import { getRewardPreviewAsset } from "../utils/rewardArt";

export { getRewardPreviewAsset } from "../utils/rewardArt";

export type HandbookFilter = 'all' | 'locked' | 'unlocked';
export type HandbookTab = 'stamps' | 'collection';
export type HandbookGroup = 'all' | 'classic' | SeriesCategory;
export type HandbookPageControl = 'handbook-prev' | 'handbook-page' | 'handbook-next';

export interface HandbookScreenProps {
  achievements: AchievementEngine;
  unlocks: Record<string, UnlockRecord>;
  readState: Record<string, ReadStateRecord>;
  pinnedAchievementId: string | null;
  equippedTitleId: string | null;
  equippedFrameId: string | null;
  group: HandbookGroup;
  page: number;
  sheetId: string | null;
  selectedAchievementId: string | null;
  filter: HandbookFilter;
  tab: HandbookTab;
  frameGroup: number | null;
  revealedHiddenIds: ReadonlySet<string>;
  onSelectGroup: (group: HandbookGroup) => void;
  onSelectSheet: (sheetId: string) => void;
  onSelectAchievement: (achievementId: string | null) => void;
  onSetFilter: (filter: HandbookFilter) => void;
  onSetTab: (tab: HandbookTab) => void;
  onSelectFrameGroup: (group: number) => void;
  onSetPage: (page: number, control: HandbookPageControl) => void;
  onRevealHidden: (achievementId: string) => void;
  actions: UIControllerActions;
}

const FAMILIES = ACHIEVEMENT_CATALOG.families as readonly {
  id: AchievementFamilyId;
  name: string;
  foil_board_name: string;
}[];

const SHEETS_PER_LIST_PAGE = 6;

interface HandbookSheet {
  id: string;
  group: Exclude<HandbookGroup, 'all'>;
  title: string;
  foilName?: string;
  stamps: typeof CATALOG_ACHIEVEMENTS;
}

// Only comparable series share a sheet. Each sheet takes one tier from every series in the set.
const RELATED_SERIES = [
  { prefix: 'speed_pb', keys: SERIES_COURSES },
  { prefix: 'course_speed', keys: SERIES_COURSES },
  { prefix: 'course_words', keys: SERIES_COURSES },
  { prefix: 'topic_words', keys: SERIES_TOPICS },
  { prefix: 'topic_clean', keys: SERIES_TOPICS },
  { prefix: 'course_clean', keys: SERIES_COURSES },
  { prefix: 'course_gold', keys: SERIES_COURSES },
  { prefix: 'stage', keys: SERIES_DISTRICTS },
  { prefix: 'shops', keys: SERIES_DISTRICTS },
  { prefix: 'crews', keys: SERIES_DISTRICTS },
  { prefix: 'research', keys: SERIES_RESEARCH },
  { prefix: 'cargo', keys: SERIES_DISTRICTS },
  { prefix: 'manual', title: '追加便', keys: ['1', '2', '3', '4'] },
  { prefix: 'rounds', keys: SERIES_COURSES },
].map(({ prefix, title, keys }) => ({
  prefix, title, ids: keys.map((key) => `${prefix}_${key}`),
}));

const expandedSheets = (Object.keys(SERIES_CATEGORIES) as SeriesCategory[]).flatMap((category) =>
  STAMP_SERIES.filter((series) => series.category === category).flatMap((series, index): HandbookSheet[] => {
    const related = RELATED_SERIES.find(({ ids }) => ids.includes(series.id));
    if (!related) {
      return [{
        id: series.id,
        group: category,
        title: category === 'secret' ? `秘密の切手 ${index + 1}` : series.name,
        stamps: series.stamps,
      }];
    }
    if (series.id !== related.ids[0]) return [];

    const members = related.ids.flatMap((id) => SERIES_BY_ID.get(id) ?? []);
    const tierCount = Math.max(...members.map((member) => member.stamps.length));
    return Array.from({ length: tierCount }, (_, tier): HandbookSheet => {
      const stamps = members.flatMap((member) => member.stamps.slice(tier, tier + 1));
      return {
        id: `${related.prefix}-tier-${tier + 1}`,
        group: category,
        title: related.title ? `${related.title}・${stamps[0].tierLabel}` : stamps[0].tierLabel,
        stamps,
      };
    });
  }),
);
const HANDBOOK_SHEETS: readonly HandbookSheet[] = [
  ...FAMILIES.map((family): HandbookSheet => ({
    id: family.id,
    group: 'classic',
    title: `${family.id}. ${family.name}`,
    foilName: family.foil_board_name,
    stamps: CATALOG_ACHIEVEMENTS.filter((stamp) => 'family_id' in stamp && stamp.family_id === family.id),
  })),
  ...expandedSheets,
];

const SCOPE_LABELS: Record<CatalogAchievementDefinition['scope'], string> = {
  全: '全モード',
  練: '練習',
  便: '本編（90秒）',
  通常: '本編（スキップ・救済なし）',
  街: '街づくり',
};

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

function renderPostcards(unlockedRewards: ReadonlySet<string>): HTMLElement {
  const dialog = el('dialog', {
    className: 'kb-stamp-dialog kb-postcard-dialog',
    'aria-labelledby': 'kb-postcard-title',
    closedby: 'any',
    'data-testid': 'postcard-preview',
  });
  let opener: HTMLButtonElement | null = null;
  const dismiss = () => {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.open = false;
      dialog.dispatchEvent(new Event('close'));
    }
  };
  dialog.addEventListener('close', () => {
    dialog.replaceChildren();
    opener?.focus({ preventScroll: true });
    opener = null;
  });
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  });
  attachLightDismissFallback(dialog);

  const tiles = CATALOG_REWARDS.filter((reward) => reward.kind === 'postcard').map((reward) => {
    const owned = unlockedRewards.has(reward.id);
    const status = owned ? '獲得済み' : '未獲得';
    const image = getRewardPreviewAsset(reward);
    const tile = el('button', {
      type: 'button',
      className: `kb-postcard-tile${owned ? ' is-owned' : ''}`,
      'aria-label': `${reward.name}（${status}）を拡大`,
      'aria-haspopup': 'dialog',
      'data-postcard-id': reward.id,
    },
      assetImg(image, '', {
        decorative: true,
        className: `kb-reward-art kb-postcard-thumbnail${owned ? '' : ' is-locked'}`,
      }),
      el('span', { className: 'kb-postcard-caption' },
        el('strong', {}, reward.name),
        el('span', { className: 'kb-row-between kb-small' }, el('span', {}, status), el('span', {}, '拡大')),
      ),
    );
    tile.addEventListener('click', () => {
      opener = tile;
      const closeButton = el('button', {
        type: 'button',
        className: 'kb-stamp-dialog-close',
        'aria-label': '絵葉書を閉じる',
      }, '✕');
      closeButton.addEventListener('click', dismiss);
      dialog.replaceChildren(
        el('div', { className: 'kb-postcard-preview kb-stack-sm' },
          el('div', { className: 'kb-stamp-dialog-header' },
            el('h2', { id: 'kb-postcard-title', className: 'kb-h2' }, reward.name), closeButton,
          ),
          assetImg(image, `${reward.name}の絵柄`, {
            className: `kb-postcard-preview-art${owned ? '' : ' is-locked'}`,
          }),
          el('div', { className: 'kb-row-wrap' },
            el('span', { className: `kb-badge${owned ? ' is-earned' : ''}` }, status),
            el('span', { className: 'kb-secondary kb-small' }, reward.trigger),
          ),
        ),
      );
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
      closeButton.focus();
    });
    return tile;
  });

  return el('section', { className: 'kb-card kb-stack-sm', 'aria-label': '絵葉書' },
    el('h3', { className: 'kb-h3' }, '絵葉書'),
    el('div', { className: 'kb-postcard-grid' }, ...tiles),
    dialog,
  );
}

const rewardById = new Map(CATALOG_REWARDS.map((reward) => [reward.id, reward]));

export function renderHandbookScreen(props: HandbookScreenProps): HTMLElement {
  const {
    achievements,
    unlocks,
    readState,
    pinnedAchievementId,
    equippedTitleId,
    equippedFrameId,
    group,
    page,
    sheetId,
    selectedAchievementId,
    filter,
    tab,
    frameGroup,
    revealedHiddenIds,
    onSelectGroup,
    onSelectSheet,
    onSetPage,
    onSelectAchievement,
    onSetFilter,
    onSetTab,
    onSelectFrameGroup,
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
      'aria-pressed': String(tab === 'stamps'),
      'data-testid': 'handbook-stamps-tab',
    },
    `切手台紙 (${unlockedCount}/${CATALOG_ACHIEVEMENTS.length})`,
  );
  stampsTabBtn.addEventListener('click', () => onSetTab('stamps'));

  const collectionTabBtn = el(
    'button',
    {
      type: 'button',
      className: `kb-pill-btn${tab === 'collection' ? ' is-selected' : ''}`,
      'aria-pressed': String(tab === 'collection'),
      'data-testid': 'handbook-collection-tab',
    },
    '絵葉書・称号・額縁',
  );
  collectionTabBtn.addEventListener('click', () => onSetTab('collection'));

  const topBar = el('div', { className: 'kb-row-wrap' }, stampsTabBtn, collectionTabBtn);

  if (tab === 'collection') {
    const unlockedRewards = new Set(achievements.getUnlockedRewardIds());
    const unlockedTitles = CATALOG_ACHIEVEMENTS.filter((a) => achievements.isUnlocked(a.id));
    const equippedGroup = STAMP_FRAME_GROUPS.findIndex(({ frames }) => frames.some((frame) => frame.rewardId === equippedFrameId));
    const firstOwnedGroup = STAMP_FRAME_GROUPS.findIndex(({ frames }) => frames.some((frame) => unlockedRewards.has(frame.rewardId)));
    const selectedFrameGroup = frameGroup ?? (equippedGroup >= 0 ? equippedGroup : Math.max(0, firstOwnedGroup));
    const framePicker = el('select', {
      className: 'kb-input kb-handbook-select', 'aria-label': '額縁の分野', 'data-testid': 'handbook-frame-group',
    }, ...STAMP_FRAME_GROUPS.map(({ name }, index) => el('option', { value: index, selected: index === selectedFrameGroup }, name)));
    framePicker.addEventListener('change', () => onSelectFrameGroup(Number(framePicker.value)));

    const rewardCard = (reward: CatalogRewardDefinition): HTMLElement => {
      const owned = unlockedRewards.has(reward.id);
      const isFrame = reward.kind === 'frame';
      const equipped = reward.id === equippedFrameId;
      const button = isFrame && owned ? el('button', {
        type: 'button', className: equipped ? 'kb-btn-primary' : 'kb-btn-secondary',
        'data-equip-frame': reward.id,
      }, equipped ? '装着中（外す）' : '額縁を装着') : null;
      button?.addEventListener('click', () => actions.equipFrame(equipped ? null : reward.id));
      const image = assetImg(getRewardPreviewAsset(reward), '', {
        decorative: true,
        width: isFrame ? 68 : reward.kind === 'home_panel' ? 72 : 44,
        height: isFrame ? 68 : reward.kind === 'home_panel' ? 45 : 44,
        className: `kb-reward-art${owned ? '' : ' is-locked'}`,
      });
      if (isFrame) image.loading = 'lazy';
      return el('div', { className: `kb-stamp-card kb-reward-card${owned ? ' is-owned' : ''}`, 'data-frame-reward': isFrame ? reward.id : undefined },
        el('div', { className: 'kb-row-between' }, image,
          assetImg(owned ? './assets/ui_icon/ui_check.svg' : './assets/ui_icon/ui_lock.svg', '', { decorative: true, width: 18, height: 18 })),
        el('strong', {}, reward.name),
        el('div', { className: 'kb-secondary kb-small' }, reward.trigger),
        button ?? (isFrame ? el('span', { className: 'kb-badge kb-frame-lock-status' }, '未獲得') : null),
      );
    };

    const framesSection = el(
      'section',
      { className: 'kb-card kb-stack-sm', 'aria-label': '額縁', 'data-testid': 'handbook-frames' },
      el('div', { className: 'kb-row-between kb-handbook-toolbar' },
        el('h3', { className: 'kb-h3' }, `額縁（${STAMP_FRAMES.filter((frame) => unlockedRewards.has(frame.rewardId)).length}/${STAMP_FRAMES.length}）`),
        framePicker,
      ),
      el('p', { className: 'kb-secondary kb-small kb-frame-hint' }, '装着した額縁は、獲得済みの切手を拡大したときに表示されます。'),
      el('div', { className: 'kb-handbook-frame-grid' },
        ...STAMP_FRAME_GROUPS[selectedFrameGroup].frames.map((frame) => rewardCard(rewardById.get(frame.rewardId)!))),
    );
    const keepsakesSection = el('section', { className: 'kb-card kb-stack-sm' },
      el('h3', { className: 'kb-h3' }, '記念品'),
      el('div', { className: 'kb-row-wrap' },
        ...CATALOG_REWARDS.filter(({ kind }) => kind !== 'postcard' && kind !== 'frame').map(rewardCard)),
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

    return el('div', { className: 'kb-stack-md kb-handbook-collection' }, topBar, framesSection, renderPostcards(unlockedRewards), keepsakesSection, titlesSection);
  }

  const sheets = group === 'all' ? HANDBOOK_SHEETS : HANDBOOK_SHEETS.filter((sheet) => sheet.group === group);
  const selectedSheet = sheets.find(({ id }) => id === sheetId) ?? sheets[0];
  const pageCount = Math.ceil(sheets.length / SHEETS_PER_LIST_PAGE);
  const currentPage = Math.min(page, pageCount - 1);
  const visibleSheets = sheets.slice(currentPage * SHEETS_PER_LIST_PAGE, (currentPage + 1) * SHEETS_PER_LIST_PAGE);
  const visibleStamps = selectedSheet.stamps.filter(({ id }) => {
    if (filter === 'all') return true;
    return achievements.isUnlocked(id) === (filter === 'unlocked');
  });
  const sheetComplete = selectedSheet.stamps.every(({ id }) => achievements.isUnlocked(id));
  const groupPicker = el('select', {
    className: 'kb-input kb-handbook-select', 'aria-label': '台紙の分野', 'data-testid': 'handbook-group',
  },
    el('option', { value: 'all', selected: group === 'all' }, 'すべての台紙'),
    el('option', { value: 'classic', selected: group === 'classic' }, 'はじめの台紙'),
    ...Object.entries(SERIES_CATEGORIES).map(([id, name]) => el('option', { value: id, selected: group === id }, name)),
  );
  groupPicker.addEventListener('change', () => onSelectGroup(groupPicker.value as HandbookGroup));

  const filterLabels: Record<HandbookFilter, string> = { all: 'すべての状態', unlocked: '獲得済み', locked: '未獲得' };
  const filterPicker = el('select', {
    className: 'kb-input kb-handbook-select', 'aria-label': '獲得状況', 'data-testid': 'handbook-filter',
  }, ...Object.entries(filterLabels).map(([id, label]) => el('option', { value: id, selected: filter === id }, label)));
  filterPicker.addEventListener('change', () => onSetFilter(filterPicker.value as HandbookFilter));

  const prevBtn = el('button', {
    type: 'button', className: 'kb-btn-secondary', disabled: currentPage === 0, 'data-testid': 'handbook-prev',
  }, '前へ');
  prevBtn.addEventListener('click', () => onSetPage(currentPage - 1, 'handbook-prev'));
  const nextBtn = el('button', {
    type: 'button', className: 'kb-btn-secondary', disabled: currentPage + 1 >= pageCount, 'data-testid': 'handbook-next',
  }, '次へ');
  nextBtn.addEventListener('click', () => onSetPage(currentPage + 1, 'handbook-next'));
  const pagePicker = el('select', {
    className: 'kb-input kb-handbook-select', 'aria-label': '台紙一覧のページ', 'data-testid': 'handbook-page',
  }, ...Array.from({ length: pageCount }, (_, index) =>
    el('option', { value: index, selected: index === currentPage }, `${index + 1} / ${pageCount}`)));
  pagePicker.addEventListener('change', () => onSetPage(Number(pagePicker.value), 'handbook-page'));

  const sheetList = el('aside', { className: 'kb-card kb-stack-sm kb-handbook-sheet-list', 'aria-label': '台紙一覧' },
    groupPicker,
    el('div', { className: 'kb-stack-xs' }, ...visibleSheets.map((sheet) => {
      const earned = sheet.stamps.filter(({ id }) => achievements.isUnlocked(id)).length;
      const selected = sheet.id === selectedSheet.id;
      const button = el('button', {
        type: 'button',
        className: `kb-pill-btn kb-handbook-sheet${selected ? ' is-selected' : ''}${earned === sheet.stamps.length ? ' is-complete' : ''}`,
        'aria-current': selected ? 'true' : undefined,
        'data-sheet-id': sheet.id,
      },
        el('span', {}, sheet.title),
        el('span', { className: 'kb-small kb-nowrap' }, `${earned}/${sheet.stamps.length}枚`),
      );
      button.addEventListener('click', () => onSelectSheet(sheet.id));
      return button;
    })),
    pageCount > 1
      ? el('div', { className: 'kb-row-between kb-handbook-list-pages', role: 'group', 'aria-label': '台紙一覧の切り替え' },
          prevBtn, pagePicker, nextBtn)
      : null,
  );

  const stampGrid = el(
    'div',
    { className: `kb-stamp-grid${selectedSheet.stamps.length > 6 ? ' is-wide-sheet' : ''}${sheetComplete ? ' is-foil-board' : ''}` },
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
          'data-stamp-id': a.id,
          'aria-label': isHiddenUnrevealed
            ? '秘密の切手（未解除）'
            : `${a.name}（${unlocked ? '獲得済み' : '未解除'}）`,
        },
        el(
          'div',
          { className: 'kb-stamp-tile-media' },
          renderStampArt({
            stampAssetId: a.stamp_asset_id, unlocked, hidden: isHiddenUnrevealed,
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

  const board = el(
    'section',
    { className: 'kb-card kb-stack-sm kb-handbook-main', 'aria-label': '切手一覧' },
    el('div', { className: 'kb-row-between kb-handbook-toolbar' },
      el('h2', { className: 'kb-h2', 'data-testid': 'handbook-sheet-title' }, selectedSheet.title),
      filterPicker,
    ),
    sheetComplete ? el('div', {},
      el('span', { className: 'kb-milestone-badge' }, selectedSheet.foilName ? `箔押し完成: ${selectedSheet.foilName}` : '台紙完成'),
    ) : null,
    visibleStamps.length ? stampGrid : el('p', { className: 'kb-secondary' }, 'この条件の切手はありません。'),
  );

  // Detail popup dialog when a stamp is clicked
  const detailDef = selectedAchievementId
    ? CATALOG_ACHIEVEMENTS.find((a) => a.id === selectedAchievementId) ?? null
    : null;

  let detailDialog: HTMLDialogElement | null = null;
  if (detailDef) {
    const detailUnlocked = achievements.isUnlocked(detailDef.id);
    const frameAsset = detailUnlocked && equippedFrameId && achievements.getUnlockedRewardIds().includes(equippedFrameId)
      ? getEquippedStampFrameAsset(equippedFrameId)
      : undefined;
    const detailHidden = detailDef.hidden && !detailUnlocked && !revealedHiddenIds.has(detailDef.id);
    const detailUnlockRecord = unlocks[detailDef.id];
    const isPinned = pinnedAchievementId === detailDef.id;
    const series = 'seriesId' in detailDef ? SERIES_BY_ID.get(detailDef.seriesId) : undefined;

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
    const tierPicker = series && series.stamps.length > 1 ? el('select', {
      className: 'kb-input kb-handbook-select', 'aria-label': '切手の段階', 'data-testid': 'series-tier',
    }, ...series.stamps.map((stamp) => el('option', {
      value: stamp.id, selected: stamp.id === detailDef.id,
    }, `${stamp.tierLabel}・${achievements.isUnlocked(stamp.id) ? '獲得済み' : '未獲得'}`))) : null;
    tierPicker?.addEventListener('change', () => {
      onSelectAchievement(tierPicker.value);
      if (achievements.isUnlocked(tierPicker.value)) actions.markAchievementRead(tierPicker.value);
      queueMicrotask(() => document.querySelector<HTMLElement>('[data-testid="series-tier"]')?.focus());
    });
    const stampProgress = !detailHidden && series && 'target' in detailDef
      ? achievements.getSeriesMetric(series.id)
      : undefined;
    const rankProgress = series?.repeatable && stampProgress !== undefined && stampProgress >= 100
      ? `伝説${stampProgress >= 200 ? ` ★${Math.floor(stampProgress / 100) - 1}` : ''}・次の星まであと ${100 - stampProgress % 100} 回`
      : null;

    const infoCol = el(
      'div',
      { className: 'kb-stamp-dialog-info-col kb-stack-md' },
      el(
        'div',
        { className: 'kb-stamp-dialog-header' },
        el('h3', { id: 'kb-stamp-dialog-title', className: 'kb-h2' }, detailHidden ? '秘密の切手' : detailDef.name),
        headerCloseBtn,
      ),
      tierPicker,
      el(
        'div',
        { className: 'kb-row-wrap' },
        el(
          'span',
          { className: `kb-badge${detailUnlocked ? ' is-earned' : ''}` },
          detailUnlocked ? '✓ 獲得済み' : '未解除',
        ),
        el('span', { className: 'kb-badge' }, `対象: ${series?.category === 'words'
          && !series.id.startsWith('topic_words_') && series.id !== 'every_topic'
          ? '本編・練習' : SCOPE_LABELS[detailDef.scope]}`),
      ),
      el(
        'p',
        { className: 'kb-stamp-dialog-condition' },
        detailHidden
          ? (detailDef.hidden_hint ? `ヒント: ${detailDef.hidden_hint}` : 'どんな切手か、見つけてからのお楽しみ。')
          : detailDef.condition,
      ),
      rankProgress
        ? el('div', { className: 'kb-secondary kb-small' }, rankProgress)
        : !detailUnlocked && stampProgress !== undefined && 'target' in detailDef && detailDef.unit
          ? el('div', { className: 'kb-secondary kb-small' }, `あと ${Math.max(0, detailDef.target - stampProgress)} ${detailDef.unit}`)
          : null,
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
      detailHidden ? null : el('p', { className: 'kb-stamp-flavor' }, detailDef.flavor_text),
      el('div', { className: 'kb-stamp-dialog-actions' }, detailHidden && series ? null : pinBtn, bottomCloseBtn),
    );

    dialog.appendChild(renderStampDialogBody({
      stampAssetId: detailDef.stamp_asset_id, unlocked: detailUnlocked, hidden: detailHidden, info: infoCol,
      tierLabel: 'tierLabel' in detailDef ? detailDef.tierLabel : undefined,
      frameAsset,
    }));

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
    el('div', { className: 'kb-grid-handbook' }, sheetList, board),
    detailDialog,
  );
}
