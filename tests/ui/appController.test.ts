// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import visualResourceManifest from '@spec-data/visual_resource_manifest.json';
import { ROMAJI_RULES } from '@/contracts/data';
import type { RoundResultRecord } from '@/progression/profileRepository';
import { CATALOG_ACHIEVEMENTS, CATALOG_REWARDS } from '@/progression/achievementEngine';
import { getEquippedStampFrameAsset, STAMP_FRAMES } from '@/progression/stampFrameCatalog';
import { AppController } from '@/ui/appController';
import { getRewardPreviewAsset } from '@/ui/screens/handbookScreen';
import { passStartGate } from './startHelpers';

describe('AppController UI integration', () => {
  let controller: AppController | null = null;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
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
    expect(mount.textContent).toContain('Fを押すと開始します');
    expect(mount.querySelector('[data-testid="header-coins"]')).toBeNull();

    // Complete input check -> READY
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="play-word-ja"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="header-coins"]')).toBeNull();

    // Pause -> hides prompt
    const input = mount.querySelector<HTMLInputElement>('input.kb-hidden-input')!;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(mount.textContent).toContain('一時停止中');
    expect(mount.querySelector('[data-testid="play-word-ja"]')).toBeNull();

    // Quit to home
    controller.quitPlayToHome();
    expect(mount.querySelector('[data-testid="home-practice-btn"]')).not.toBeNull();

    // Practice intentionally uses Escape to quit rather than pause.
    controller.startPractice();
    await passStartGate(mount);
    const practiceInput = mount.querySelector<HTMLInputElement>('input.kb-hidden-input')!;
    practiceInput.focus();
    practiceInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
    expect(mount.querySelector('[data-testid="home-practice-btn"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="play-word-ja"]')).toBeNull();
  }, 12000);

  it('freezes independent comparison bests from eligible normal rounds of the same conditions', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.startMainRound(123);
    const fixture: RoundResultRecord = {
      sessionId: 'prior', timestamp: controller['settings'].catalogStartedAt,
      courseId: controller['selectedCourseId'], planId: controller['currentPlanId'],
      comparisonKey: controller['currentComparisonKey'], wordIds: [],
      ruleVersion: ROMAJI_RULES.inputRuleVersion, completed: true, completedWordCount: 10,
      correctKeyCount: 55, mistakeCount: 0, totalCanonicalLength: 55, score: 500,
      canonicalKpm: 55 / 90 * 60, rescueUsed: false, guideUsed: true,
    };

    const ineligible: Partial<RoundResultRecord>[] = [
      { completedWordCount: 9 },
      { rescueUsed: true },
      { guideUsed: false },
      { timestamp: fixture.timestamp - 1 },
      { ruleVersion: 'older' },
      { completed: false },
      { comparisonKey: 'different' },
    ];

    for (const overrides of ineligible) {
      controller['recentResults'] = [{ ...fixture, ...overrides }];
      controller.startMainRound(123);
      expect(controller['currentSessionContext'], JSON.stringify(overrides)).toMatchObject({
        comparisonBestScore: null,
        comparisonBestCanonicalLength: null,
      });
    }

    controller['recentResults'] = [fixture, {
      ...fixture, sessionId: 'faster', score: 400, totalCanonicalLength: 70,
      canonicalKpm: 70 / 90 * 60,
    }];
    controller.startMainRound(123);
    expect(controller['currentSessionContext']).toMatchObject({
      comparisonBestScore: 500,
      comparisonBestCanonicalLength: 70,
      comparisonGuideUsed: true,
    });
  });

  it('keeps a paused round stopped until the player releases and presses a resume key again', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.startMainRound(123);
    await passStartGate(mount);

    const press = (key: string, repeat = false) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
        key, repeat, bubbles: true, cancelable: true,
      }));
    };
    press('Escape');
    expect(mount.textContent).toContain('一時停止中');

    for (const key of ['Escape', 'Enter']) {
      press(key, true);
      expect(mount.textContent).toContain('一時停止中');
    }
    press('Escape');
    expect(mount.textContent).not.toContain('一時停止中');
    expect(mount.querySelector('[data-testid="play-word-ja"]')).not.toBeNull();
  }, 12000);

  it.each(['Escape', 'Enter', 'h', 'blur', 'IME', 'delivery button'])(
    'renders results immediately when %s reaches the deadline between timer ticks',
    async (action) => {
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      controller = new AppController(mount);
      const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
      try {
        await controller.init();
        controller.startMainRound(123);
        await passStartGate(mount);
        const input = mount.querySelector<HTMLInputElement>('input.kb-hidden-input');
        expect(input).not.toBeNull();
        input!.focus();
        expect(mount.querySelector('[data-testid="play-word-ja"]')).not.toBeNull();

        let deliveryButton: HTMLButtonElement | null = null;
        if (action === 'delivery button') {
          const romaji = mount.querySelector('.kb-prompt-roman')!.textContent!.trim();
          for (const key of romaji) {
            input!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          }
          deliveryButton = mount.querySelector<HTMLButtonElement>('button[data-testid="play-deliver-hint"]');
          expect(deliveryButton).not.toBeNull();
        }

        // Advance only the session clock, not the periodic UI timer, then send
        // a user action that sees the deadline before the next timer tick.
        clock.mockReturnValue(90_000);
        if (deliveryButton) {
          deliveryButton.click();
        } else if (action === 'blur') {
          input!.blur();
        } else if (action === 'IME') {
          input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        } else {
          input!.dispatchEvent(new KeyboardEvent('keydown', {
            key: action,
            bubbles: true,
            cancelable: true,
          }));
        }
        // A completed delivery may unlock a stamp before the score grid appears.
        expect(mount.querySelector('.kb-grid-result, [data-testid="gacha-reveal-card"]')).not.toBeNull();
        expect(mount.querySelector('[data-testid="play-word-ja"]')).toBeNull();
      } finally {
        clock.mockRestore();
      }
    },
    12000,
  );

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

  it('places every catalog stamp on exactly one handbook sheet', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('HANDBOOK');

    const pagePicker = () => mount.querySelector<HTMLSelectElement>('[data-testid="handbook-page"]')!;
    const pages = [...pagePicker().options].map((option) => option.value);
    const seenStamps: string[] = [];
    const titles: string[] = [];
    for (const page of pages) {
      const select = pagePicker();
      select.value = page;
      select.dispatchEvent(new Event('change'));
      const sheets = [...mount.querySelectorAll<HTMLButtonElement>('[data-sheet-id]')].map((button) => button.dataset.sheetId);
      for (const sheet of sheets) {
        mount.querySelector<HTMLButtonElement>(`[data-sheet-id="${sheet}"]`)!.click();
        seenStamps.push(...[...mount.querySelectorAll<HTMLElement>('[data-stamp-id]')].map((tile) => tile.dataset.stampId!));
        titles.push(mount.querySelector('[data-testid="handbook-sheet-title"]')!.textContent!);
      }
    }
    expect(seenStamps.sort()).toEqual(CATALOG_ACHIEVEMENTS.map(({ id }) => id).sort());
    const stampNames = CATALOG_ACHIEVEMENTS.flatMap((stamp) =>
      'tierLabel' in stamp ? [stamp.name, stamp.tierLabel] : [stamp.name]);
    expect([...titles, ...stampNames].filter((name) => /第[\d一二三四五六七八九十]+段階/.test(name))).toEqual([]);
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
    expect(mount.textContent).toContain('Fを押すと開始します');

    // Complete input check and verify fixed-slot play layout elements
    await passStartGate(mount);
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
  }, 12000);

  it('resolves all reward preview assets and lists 50 frames across five handbook groups', async () => {
    const fsMod = (await import(/* @vite-ignore */ `${'node:'}fs`)) as { existsSync: (p: string) => boolean };
    const pathMod = (await import(/* @vite-ignore */ `${'node:'}path`)) as { resolve: (...parts: string[]) => string };
    const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';
    const manifestExports = new Set(
      visualResourceManifest.assets.flatMap((asset) => asset.runtime_exports ?? []),
    );

    expect(CATALOG_REWARDS).toHaveLength(86);
    for (const reward of CATALOG_REWARDS) {
      const assetPath = getRewardPreviewAsset(reward);
      expect(assetPath.startsWith('./assets/')).toBe(true);
      const relPath = assetPath.replace(/^\.\//, '');
      if (!relPath.startsWith('assets/equipped_stamp_frame/')) {
        expect(manifestExports.has(relPath), `Asset not listed in manifest runtime_exports: ${relPath}`).toBe(true);
      }
      const diskPath = pathMod.resolve(cwd, 'public', relPath);
      expect(fsMod.existsSync(diskPath), `Missing reward preview asset: ${diskPath}`).toBe(true);
    }

    const releasedFrames = CATALOG_REWARDS.filter((reward) => reward.kind === 'frame');
    expect(STAMP_FRAMES).toHaveLength(50);
    expect(new Set(STAMP_FRAMES.map(({ filename }) => filename)).size).toBe(50);
    expect(STAMP_FRAMES.map(({ rewardId }) => rewardId).sort()).toEqual(releasedFrames.map(({ id }) => id).sort());
    for (const frame of STAMP_FRAMES) {
      const frameAsset = getEquippedStampFrameAsset(frame.rewardId);
      expect(frameAsset).toBe(`./assets/equipped_stamp_frame/${frame.filename}`);
      expect(fsMod.existsSync(pathMod.resolve(cwd, 'public', frameAsset!))).toBe(true);
    }

    const mount = document.createElement('div');
    document.body.appendChild(mount);

    controller = new AppController(mount);
    await controller.init();
    controller.navigate('HANDBOOK');

    const collectionTabBtn = Array.from(mount.querySelectorAll('.kb-pill-btn')).find((btn) =>
      btn.textContent?.includes('絵葉書・称号・額縁'),
    ) as HTMLButtonElement | undefined;
    expect(collectionTabBtn).toBeDefined();
    collectionTabBtn?.click();

    const seenFrames: string[] = [];
    for (let group = 0; group < 5; group += 1) {
      const picker = mount.querySelector<HTMLSelectElement>('[data-testid="handbook-frame-group"]')!;
      picker.value = String(group);
      picker.dispatchEvent(new Event('change'));
      const cards = [...mount.querySelectorAll<HTMLElement>('[data-frame-reward]')];
      expect(cards).toHaveLength(10);
      seenFrames.push(...cards.map((card) => card.dataset.frameReward!));
    }
    expect(seenFrames).toEqual(STAMP_FRAMES.map(({ rewardId }) => rewardId));

    const postcard = mount.querySelector<HTMLButtonElement>('[data-postcard-id="reward_family_a_postcard"]')!;
    postcard.click();
    const preview = mount.querySelector<HTMLDialogElement>('[data-testid="postcard-preview"]')!;
    expect(preview.open).toBe(true);
    expect(preview.querySelector('.kb-postcard-preview-art')?.getAttribute('src')).toBe(
      postcard.querySelector('.kb-postcard-thumbnail')?.getAttribute('src'),
    );
    preview.querySelector<HTMLButtonElement>('[aria-label="絵葉書を閉じる"]')!.click();
    expect(preview.open).toBe(false);
    expect(document.activeElement).toBe(postcard);
  });

  it('generates all 92 manifest SVG assets with unique bespoke artwork and zero placeholder polygons', async () => {
    const fsMod = (await import(/* @vite-ignore */ `${'node:'}fs`)) as {
      existsSync: (p: string) => boolean;
      readFileSync: (p: string, enc: string) => string;
    };
    const pathMod = (await import(/* @vite-ignore */ `${'node:'}path`)) as { resolve: (...parts: string[]) => string };
    const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';

    const svgAssets = visualResourceManifest.assets.filter((asset) => asset.kind === 'svg');
    expect(svgAssets).toHaveLength(92);

    const uniqueBodies = new Set<string>();
    for (const asset of svgAssets) {
      for (const relPath of asset.runtime_exports ?? []) {
        const diskPath = pathMod.resolve(cwd, 'public', relPath);
        expect(fsMod.existsSync(diskPath), `Missing SVG asset: ${diskPath}`).toBe(true);
        const content = fsMod.readFileSync(diskPath, 'utf-8');
        expect(content).toContain('<svg ');
        expect(content).not.toContain('<polygon points=');
        expect(content).not.toContain('<circle cx="32" cy="32" r="22"');
        const innerBody = content.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
        expect(innerBody.length).toBeGreaterThan(20);
        expect(uniqueBodies.has(innerBody), `Duplicate SVG artwork for ${asset.id}`).toBe(false);
        uniqueBodies.add(innerBody);
      }
    }
    expect(uniqueBodies.size).toBe(92);
  });

  it('assigns unique stamp_asset_id values to all 500 stamps and resolves every stamp image on disk', async () => {
    const fsMod = (await import(/* @vite-ignore */ `${'node:'}fs`)) as { existsSync: (p: string) => boolean };
    const pathMod = (await import(/* @vite-ignore */ `${'node:'}path`)) as { resolve: (...parts: string[]) => string };
    const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';

    expect(CATALOG_ACHIEVEMENTS).toHaveLength(500);
    const assetIds = CATALOG_ACHIEVEMENTS.map((a) => a.stamp_asset_id);
    expect(new Set(assetIds).size).toBe(500);

    for (const a of CATALOG_ACHIEVEMENTS) {
      const diskPath = pathMod.resolve(cwd, 'public', 'assets', 'achievement_stamp', `${a.stamp_asset_id}.webp`);
      expect(fsMod.existsSync(diskPath), `Missing stamp artwork for ${a.id}: ${diskPath}`).toBe(true);
    }
  });

  it('exports all 4 reward frames with square 512x512 viewBox and true transparent center without SVG masks', async () => {
    const fsMod = (await import(/* @vite-ignore */ `${'node:'}fs`)) as {
      existsSync: (p: string) => boolean;
      readFileSync: (p: string, enc: string) => string;
    };
    const pathMod = (await import(/* @vite-ignore */ `${'node:'}path`)) as { resolve: (...parts: string[]) => string };
    const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';

    for (const frameId of ['reward_frame_leaf', 'reward_frame_plaza', 'reward_frame_sunset', 'reward_frame_journey']) {
      const milestonePath = pathMod.resolve(cwd, 'public', 'assets', 'milestone_svg', `${frameId}.svg`);
      const equippedPath = pathMod.resolve(cwd, 'public', 'assets', 'equipped_stamp_frame', `${frameId}.svg`);
      expect(fsMod.existsSync(milestonePath)).toBe(true);
      expect(fsMod.existsSync(equippedPath)).toBe(true);
      const milestoneSvg = fsMod.readFileSync(milestonePath, 'utf-8');
      const equippedSvg = fsMod.readFileSync(equippedPath, 'utf-8');
      expect(milestoneSvg).toContain('viewBox="0 0 512 512"');
      expect(milestoneSvg).toContain('data:image/webp;base64,');
      expect(milestoneSvg).not.toContain('<mask');
      expect(equippedSvg).toBe(milestoneSvg);
    }
  });

  it('provides all 46 additional stamp frames as 1024x1024 RGBA PNGs under equipped_stamp_frame', async () => {
    const fsMod = (await import(/* @vite-ignore */ `${'node:'}fs`)) as {
      existsSync: (p: string) => boolean;
      readFileSync: (p: string) => Uint8Array;
    };
    const pathMod = (await import(/* @vite-ignore */ `${'node:'}path`)) as { resolve: (...parts: string[]) => string };
    const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';

    const additionalFrames = STAMP_FRAMES.filter(({ stampCount }) => stampCount !== undefined);
    expect(additionalFrames).toHaveLength(46);

    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const frame of additionalFrames) {
      expect(frame.filename.endsWith('.png')).toBe(true);
      const pngPath = pathMod.resolve(cwd, 'public', 'assets', 'equipped_stamp_frame', frame.filename);
      expect(fsMod.existsSync(pngPath), `Missing additional frame PNG: ${pngPath}`).toBe(true);

      const bytes = fsMod.readFileSync(pngPath);
      expect(bytes.length).toBeGreaterThan(33);
      expect(Array.from(bytes.slice(0, 8))).toEqual(pngSignature);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(16, false), `${frame.filename} width`).toBe(1024);
      expect(view.getUint32(20, false), `${frame.filename} height`).toBe(1024);
      expect(bytes[25], `${frame.filename} colorType (RGBA=6)`).toBe(6);
    }
  });
});
