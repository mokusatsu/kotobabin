// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { AppController } from '@/ui/appController';

describe('AppController UI integration', () => {
  let controller: AppController | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.innerHTML = '';
  });

  it('mounts home screen, navigates across all screens, and enters play without coin counters', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    controller = new AppController(mount);
    await controller.init();

    // Home screen renders brand, coin pill, city map, and practice/tutorial buttons
    expect(mount.textContent).toContain('ことば便');
    expect(mount.querySelector('[data-testid="header-coins"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="home-practice-btn"]')).not.toBeNull();
    expect(mount.querySelectorAll('.kb-map-district-btn').length).toBe(6);

    // Navigate through non-play screens
    controller.navigate('UPGRADES');
    expect(mount.textContent).toContain('荷づくり台');

    controller.navigate('DISTRICT_DETAIL');
    expect(mount.textContent).toContain('貨物鉄道の開通条件');

    controller.navigate('NEW_CITY');
    expect(mount.textContent).toContain('新しい街へ出発');

    controller.navigate('HANDBOOK');
    expect(mount.textContent).toContain('はじめの配達');

    controller.navigate('DICTIONARY');
    expect(mount.textContent).toContain('ことば図鑑');

    controller.navigate('SETTINGS');
    expect(mount.textContent).toContain('入力・表示の設定');

    // Start main round -> enters INPUT_CHECK, no coin counters in header
    controller.navigate('HOME');
    controller.startMainRound(123);
    expect(mount.textContent).toContain('半角入力の確認');
    expect(mount.querySelector('[data-testid="header-coins"]')).toBeNull();

    // Complete input check -> READY
    controller.completeInputCheck();
    expect(mount.querySelector('[data-testid="play-word-ja"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="header-coins"]')).toBeNull();

    // Pause -> hides prompt
    controller.pausePlay();
    expect(mount.textContent).toContain('一時停止中');
    expect(mount.querySelector('[data-testid="play-word-ja"]')).toBeNull();

    // Quit to home
    controller.quitPlayToHome();
    expect(mount.querySelector('[data-testid="home-practice-btn"]')).not.toBeNull();
  });

  it('opens and closes stamp detail dialog without side preview in HANDBOOK', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    controller = new AppController(mount);
    await controller.init();
    controller.navigate('HANDBOOK');

    // No side preview panel, no open dialog initially
    expect(mount.querySelector('aside[aria-label="切手の詳細"]')).toBeNull();
    expect(mount.querySelector('dialog.kb-stamp-dialog')).toBeNull();

    // Stamp tiles have overlay title and full-bleed media wrapper
    const tiles = mount.querySelectorAll('.kb-stamp-tile');
    expect(tiles.length).toBe(6);
    expect(tiles[0]?.querySelector('.kb-stamp-tile-overlay .kb-stamp-tile-title')).not.toBeNull();

    // Clicking a stamp opens the detail dialog
    (tiles[0] as HTMLButtonElement).click();
    await Promise.resolve();
    const dialog = mount.querySelector('dialog.kb-stamp-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('.kb-stamp-dialog-preview')).not.toBeNull();

    // Clicking close button dismisses the dialog
    const closeBtn = dialog?.querySelector('.kb-stamp-dialog-close') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();
    expect(mount.querySelector('dialog.kb-stamp-dialog')).toBeNull();
  });

  it('removes district icons and stage wording, selects locked district, and opens difficulty popup on open district click', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    controller = new AppController(mount);
    await controller.init();

    // No left pane start button, no district_icon, no 段階 wording, no terminal dot / vehicle remnant
    expect(mount.querySelector('[data-testid="start-main-btn"]')).toBeNull();
    expect(mount.querySelector('.kb-home-left')).toBeNull();
    expect(mount.querySelector('img[src*="district_icon"]')).toBeNull();
    expect(mount.querySelector('.kb-map-terminal-dot')).toBeNull();
    expect(mount.querySelector('.kb-map-vehicle')).toBeNull();
    expect(mount.querySelector('.kb-map-shop-sprite')).toBeNull();
    expect(mount.textContent).not.toContain('段階');
    expect(mount.textContent).toContain('Lv.0');

    const stockEl = mount.querySelector('[data-testid="map-district-stock-residential"]');
    expect(stockEl).not.toBeNull();
    expect(stockEl?.textContent).toContain('資材');

    const nextMatEl = mount.querySelector('[data-testid="home-next-level-materials"]');
    expect(nextMatEl).not.toBeNull();
    expect(nextMatEl?.textContent).toContain('次のLv.1に必要な資材');
    expect(nextMatEl?.textContent).toContain('30 資材');

    // Clicking a locked district on the map selects it and shows unlock info without opening popup or coin cost
    const marketBtn = mount.querySelector('.kb-map-district-btn[data-district-id="market"]') as HTMLButtonElement | null;
    expect(marketBtn).not.toBeNull();
    marketBtn?.click();
    expect(mount.querySelector('[data-testid="difficulty-popup"]')).toBeNull();
    expect(mount.querySelector('.kb-district-summary')?.textContent).toContain('商店街');
    expect(mount.querySelector('.kb-district-summary')?.textContent).not.toContain('コイン');

    // Clicking an open district on the map opens the difficulty popup directly
    const resBtn = mount.querySelector('.kb-map-district-btn[data-district-id="residential"]') as HTMLButtonElement | null;
    resBtn?.click();

    const popup = mount.querySelector('[data-testid="difficulty-popup"]');
    expect(popup).not.toBeNull();
    expect(popup?.textContent).toContain('住宅地 へ出発');

    // Close popup then re-open and pick standard course
    (mount.querySelector('[data-testid="difficulty-popup-close"]') as HTMLButtonElement | null)?.click();
    expect(mount.querySelector('[data-testid="difficulty-popup"]')).toBeNull();

    (mount.querySelector('.kb-map-district-btn[data-district-id="residential"]') as HTMLButtonElement | null)?.click();
    (mount.querySelector('[data-testid="launch-course-standard"]') as HTMLButtonElement | null)?.click();
    expect(mount.querySelector('[data-testid="difficulty-popup"]')).toBeNull();
    expect(mount.textContent).toContain('半角入力の確認');

    // Complete input check and verify fixed-slot play layout elements
    controller.completeInputCheck();
    expect(mount.querySelector('.kb-play-topbar')).not.toBeNull();
    expect(mount.querySelector('.kb-play-paper .kb-play-next-word')).not.toBeNull();
    expect(mount.querySelector('.kb-streak-pill.is-hidden-slot')).not.toBeNull();
    expect(mount.querySelector('.kb-play-deliver-hint')).not.toBeNull();
    expect(mount.querySelector('.kb-play-deliver-btn')).toBeNull();

    // Quit to home, check UPGRADES uses Lv. wording, and verify home-upgrade-district-btn is disabled initially
    controller.quitPlayToHome();
    const upgradeBtn = mount.querySelector('[data-testid="home-upgrade-district-btn"]') as HTMLButtonElement | null;
    expect(upgradeBtn).not.toBeNull();
    expect(upgradeBtn?.disabled).toBe(true);

    controller.navigate('UPGRADES');
    expect(mount.textContent).toContain('建築 (Lv.0/5)');
    expect(mount.textContent).not.toContain('段0');
  });
});
