import type { TopicId, Word } from '@/contracts/types';
import {
  DictionaryTracker,
  type DictionaryCollectionFilter,
  type DictionaryStatusFilter,
} from '@/progression/dictionaryTracker';
import { el } from '../utils/dom';
import { COURSE_LABELS, TOPIC_LABELS } from '../utils/format';

export interface DictionaryScreenState {
  collection: DictionaryCollectionFilter;
  status: DictionaryStatusFilter;
  topic: 'all' | TopicId;
  search: string;
  page: number;
}

export interface DictionaryScreenProps {
  tracker: DictionaryTracker;
  state: DictionaryScreenState;
  onUpdateState: (patch: Partial<DictionaryScreenState>) => void;
  onPracticeWord: (word: Word) => void;
}

const PAGE_SIZE = 48;

const COLLECTION_OPTIONS: readonly { value: DictionaryCollectionFilter; label: string }[] = [
  { value: 'all', label: 'すべて (960語)' },
  { value: 'legacy240', label: '初版240語' },
  { value: 'relaxed', label: 'ゆったり' },
  { value: 'standard', label: 'ふつう' },
  { value: 'challenge', label: '挑戦' },
];

const TOPIC_OPTIONS: readonly ('all' | TopicId)[] = [
  'all',
  'daily',
  'food',
  'living',
  'town',
  'nature',
  'people',
];

export function renderDictionaryScreen(props: DictionaryScreenProps): HTMLElement {
  const { tracker, state, onUpdateState, onPracticeWord } = props;
  const summary = tracker.getSummary();
  const filtered = tracker.filterWords({
    collection: state.collection,
    status: state.status,
    topic: state.topic,
    search: state.search,
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(0, state.page), totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Search input
  const searchInput = el('input', {
    type: 'search',
    className: 'kb-input',
    value: state.search,
    placeholder: 'ことば・よみ・IDで検索...',
    'aria-label': 'ことば検索',
  }) as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    onUpdateState({ search: searchInput.value, page: 0 });
  });

  const unfinishedBtn = el(
    'button',
    {
      type: 'button',
      className: `kb-pill-btn${state.status === 'unfinished' ? ' is-selected' : ''}`,
    },
    '未完成のみ',
  );
  unfinishedBtn.addEventListener('click', () => {
    onUpdateState({
      status: state.status === 'unfinished' ? 'all' : 'unfinished',
      page: 0,
    });
  });

  const collectionBar = el(
    'div',
    { className: 'kb-row-wrap', role: 'group', 'aria-label': 'コース・収録フィルタ' },
    ...COLLECTION_OPTIONS.map((opt) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${state.collection === opt.value ? ' is-selected' : ''}`,
        },
        opt.label,
      );
      btn.addEventListener('click', () => onUpdateState({ collection: opt.value, page: 0 }));
      return btn;
    }),
    unfinishedBtn,
  );

  const topicBar = el(
    'div',
    { className: 'kb-row-wrap', role: 'group', 'aria-label': '分野フィルタ' },
    ...TOPIC_OPTIONS.map((t) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${state.topic === t ? ' is-selected' : ''}`,
        },
        t === 'all' ? '全分野' : TOPIC_LABELS[t],
      );
      btn.addEventListener('click', () => onUpdateState({ topic: t, page: 0 }));
      return btn;
    }),
  );

  const summaryBar = el(
    'div',
    { className: 'kb-city-strip kb-small' },
    el('strong', {}, `完了 ${summary.completedWords} / ${summary.totalWords}語`),
    el('span', {}, `初版240語: ${summary.legacyCompletedWords} / ${summary.legacyTotalWords}`),
    el('span', {}, `練習3回達成: ${summary.masteredWords}語`),
    el('span', { className: 'kb-secondary' }, `表示中: ${filtered.length}語`),
  );

  const wordGrid = el(
    'div',
    { className: 'kb-word-grid' },
    ...pageItems.map((item) => {
      const practiceBtn = el(
        'button',
        { type: 'button', className: 'kb-btn-secondary kb-small kb-word-practice-btn kb-nowrap' },
        '練習する',
      );
      practiceBtn.addEventListener('click', () => onPracticeWord(item.word));

      return el(
        'article',
        { className: `kb-card kb-word-card${item.completed ? ' is-completed' : ''}` },
        el(
          'div',
          { className: 'kb-word-card-head' },
          el(
            'span',
            { className: 'kb-word-meta kb-secondary kb-nowrap' },
            `${COURSE_LABELS[item.word.courseId]}・${TOPIC_LABELS[item.word.topicId]}`,
          ),
          el(
            'div',
            { className: 'kb-word-badges' },
            item.completed
              ? el('span', { className: 'kb-word-done-tag kb-nowrap' }, '✓ 配達済')
              : null,
            el('span', { className: 'kb-badge kb-word-badge kb-nowrap' }, `練習 ${item.practiceMasteryDisplay}`),
          ),
        ),
        el('strong', { className: 'kb-word-display', title: item.word.display }, item.word.display),
        el(
          'div',
          { className: 'kb-word-card-foot' },
          el('span', { className: 'kb-word-reading kb-secondary', title: item.word.reading }, item.word.reading),
          practiceBtn,
        ),
      );
    }),
  );

  const prevBtn = el('button', { type: 'button', className: 'kb-btn-secondary', disabled: currentPage <= 0 }, '前へ');
  prevBtn.addEventListener('click', () => onUpdateState({ page: Math.max(0, currentPage - 1) }));

  const nextBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary', disabled: currentPage >= totalPages - 1 },
    '次へ',
  );
  nextBtn.addEventListener('click', () => onUpdateState({ page: Math.min(totalPages - 1, currentPage + 1) }));

  const pagination = el(
    'div',
    { className: 'kb-row-between' },
    prevBtn,
    el('span', { className: 'kb-small' }, `${currentPage + 1} / ${totalPages} ページ`),
    nextBtn,
  );

  return el(
    'div',
    { className: 'kb-dict-layout' },
    el(
      'section',
      { className: 'kb-card kb-stack-xs kb-dict-filters' },
      el('div', { className: 'kb-row-between' }, el('h2', { className: 'kb-h2' }, 'ことば図鑑'), searchInput),
      collectionBar,
      topicBar,
      summaryBar,
    ),
    el(
      'div',
      { className: 'kb-dict-scroll kb-stack-sm' },
      pageItems.length > 0 ? wordGrid : el('div', { className: 'kb-card' }, '条件に一致することばがありません。'),
      totalPages > 1 ? pagination : null,
    ),
  );
}
