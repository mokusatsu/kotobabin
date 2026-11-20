import type { CourseId, DistrictId, SessionMode, SessionState } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { AppScreen } from '../types';
import { assetImg, el } from '../utils/dom';
import { COURSE_LABELS, DISTRICT_NAME_MAP, formatCoins, formatRatePerSec } from '../utils/format';

export interface NormalHeaderProps {
  currentScreen: AppScreen;
  economy: CityEconomy;
  unreadCount: number;
  equippedTitleName: string | null;
  navLocked?: boolean;
  onNavigate: (screen: AppScreen) => void;
}

export const NAV_ITEMS: readonly { screen: AppScreen; label: string; key: string; code: string }[] = [
  { screen: 'HOME', label: 'ホーム', key: 'H', code: 'KeyH' },
  { screen: 'UPGRADES', label: '街の設備', key: 'J', code: 'KeyJ' },
  { screen: 'HANDBOOK', label: '配達手帳', key: 'K', code: 'KeyK' },
  { screen: 'DICTIONARY', label: 'ことば図鑑', key: 'L', code: 'KeyL' },
  { screen: 'SETTINGS', label: '設定', key: 'S', code: 'KeyS' },
];

export function renderNormalHeader(props: NormalHeaderProps): HTMLElement {
  const { currentScreen, economy, unreadCount, equippedTitleName, navLocked = false, onNavigate } = props;
  const activeTabScreen: AppScreen =
    currentScreen === 'DISTRICT_DETAIL' || currentScreen === 'NEW_CITY'
      ? 'UPGRADES'
      : currentScreen === 'RESULT'
        ? 'HOME'
        : currentScreen;

  const nav = el(
    'nav',
    { className: 'kb-nav', 'aria-label': 'メインメニュー' },
    ...NAV_ITEMS.map((item) => {
      const isActive = activeTabScreen === item.screen;
      const badge =
        item.screen === 'HANDBOOK' && unreadCount > 0
          ? el('span', { className: 'kb-unread-pill', 'aria-label': `未読${unreadCount}件` }, String(unreadCount))
          : null;
      const btn = el(
        'button',
        {
          type: 'button',
          className: 'kb-nav-btn',
          'aria-current': isActive ? 'page' : undefined,
          disabled: navLocked,
        },
        el('span', {}, item.label),
        el('kbd', { className: 'kb-kbd', 'aria-label': `${item.key}キー` }, item.key),
        badge,
      );
      btn.addEventListener('click', () => onNavigate(item.screen));
      return btn;
    }),
  );

  const stats = el(
    'div',
    { className: 'kb-header-stats' },
    el(
      'div',
      { className: 'kb-stat-pill', title: '所持コイン' },
      assetImg('./assets/resource_icon/resource_coin.svg', 'コイン', { width: 20, height: 20 }),
      el('span', { 'data-testid': 'header-coins' }, `${formatCoins(economy.coinsMicro)} コイン`),
    ),
    el(
      'div',
      { className: 'kb-stat-pill', title: '店舗の自動収益' },
      el('span', { className: 'kb-secondary' }, '店舗収益'),
      el('span', { 'data-testid': 'header-income-rate' }, `+${formatRatePerSec(economy.totalIncomePerSecondMicro())}`),
    ),
  );

  return el(
    'header',
    { className: 'kb-header' },
    el(
      'div',
      { className: 'kb-brand' },
      assetImg('./assets/brand/brand_mark.svg', 'ことば便', { width: 36, height: 36 }),
      el('span', {}, 'ことば便'),
      equippedTitleName
        ? el('span', { className: 'kb-title-chip' }, equippedTitleName)
        : null,
    ),
    nav,
    stats,
  );
}

export interface PlayHeaderProps {
  mode: SessionMode;
  state: SessionState;
  courseId: CourseId;
  districtId: DistrictId;
  onPause: () => void;
}

export function renderPlayHeader(props: PlayHeaderProps): HTMLElement {
  const { mode, state, courseId, districtId, onPause } = props;
  const modeText =
    mode === 'TUTORIAL'
      ? 'チュートリアル'
      : mode === 'PRACTICE'
        ? 'ゆっくり練習'
        : COURSE_LABELS[courseId];

  const modeIconSrc =
    mode === 'TUTORIAL'
      ? './assets/ui_icon/ui_guide.svg'
      : mode === 'PRACTICE'
        ? './assets/ui_icon/ui_practice.svg'
        : `./assets/course_icon/course_${courseId}.svg`;

  const pauseBtn =
    state === 'PLAYING' || state === 'READY' || state === 'TUTORIAL' || state === 'PRACTICE'
      ? (() => {
          const btn = el(
            'button',
            { type: 'button', className: 'kb-btn-secondary kb-play-pause-btn' },
            assetImg('./assets/ui_icon/ui_pause.svg', '', { decorative: true, width: 20, height: 20 }),
            el('span', {}, '一時停止'),
            el('kbd', { className: 'kb-kbd' }, 'Esc'),
          );
          btn.addEventListener('click', onPause);
          return btn;
        })()
      : null;

  return el(
    'header',
    { className: 'kb-header kb-header-play' },
    el(
      'div',
      { className: 'kb-brand' },
      assetImg('./assets/brand/brand_mark.svg', 'ことば便', { width: 32, height: 32 }),
      el('span', {}, 'ことば便'),
      el(
        'span',
        { className: 'kb-stat-pill' },
        assetImg(modeIconSrc, '', { decorative: true, width: 18, height: 18 }),
        el('span', {}, modeText),
      ),
      el(
        'span',
        { className: 'kb-stat-pill' },
        assetImg(`./assets/district_icon/district_${districtId}.svg`, '', { decorative: true, width: 18, height: 18 }),
        el('span', {}, `送り先: ${DISTRICT_NAME_MAP[districtId]}`),
      ),
    ),
    pauseBtn ?? el('div', {}),
  );
}
