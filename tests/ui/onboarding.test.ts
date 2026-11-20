// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AppController } from '@/ui/appController';
import { IndexedDbProfileRepository } from '@/progression/profileRepository';
import { STAMP_REVEAL_DURATION_MS } from '@/ui/components/stampReveal';
import { passStartGate } from './startHelpers';

async function flushUi(ms = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function typeKeys(mount: HTMLElement, text: string): void {
  const input = mount.querySelector<HTMLInputElement>('input.kb-hidden-input');
  if (!input) {
    throw new Error('Expected .kb-hidden-input in DOM');
  }
  input.focus();
  for (const ch of text) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
  }
}

function pressKey(mount: HTMLElement, key: string): void {
  const input = mount.querySelector<HTMLInputElement>('input.kb-hidden-input');
  if (!input) {
    throw new Error('Expected .kb-hidden-input in DOM');
  }
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function pressWindowKey(key: string, code?: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
}

function getPromptRomaji(mount: HTMLElement): string {
  return mount.querySelector('.kb-prompt-roman')?.textContent?.trim() ?? '';
}

async function watchStampReveals(mount: HTMLElement, ids = ['A01', 'A02', 'A03', 'reward_family_a_postcard']): Promise<void> {
  for (const id of ids) {
    const card = mount.querySelector('[data-testid="gacha-reveal-card"]');
    expect(card?.getAttribute('data-reveal-id')).toBe(id);
    if (id === 'reward_family_a_postcard') {
      expect(card?.textContent).toContain('絵葉書を獲得');
      expect(card?.querySelector('img')?.getAttribute('src')).toContain('postcard_a.webp');
    } else {
      expect(card?.querySelector('.kb-gacha-reward')?.textContent).toContain('報酬');
    }
    const next = card?.querySelector<HTMLButtonElement>('[data-testid="gacha-next-btn"]');
    expect(next?.disabled).toBe(true);
    next?.click();
    expect(mount.querySelector('[data-testid="gacha-reveal-card"]')).toBe(card);
    expect(mount.querySelector('[data-testid="gacha-skip-btn"]')).toBeNull();
    await flushUi(STAMP_REVEAL_DURATION_MS + 100);
    expect(next?.disabled).toBe(false);
    next?.click();
    await flushUi();
  }
}

describe('Onboarding / Tutorial Integration', () => {
  const originalIndexedDB = globalThis.indexedDB;
  let controllers: AppController[] = [];

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    globalThis.indexedDB = new IDBFactory();
    window.localStorage.clear();
    controllers = [];
  });

  afterEach(() => {
    for (const c of controllers) {
      c.destroy();
    }
    controllers = [];
    vi.restoreAllMocks();
    globalThis.indexedDB = originalIndexedDB;
  });

  async function mountFreshApp(): Promise<{ controller: AppController; mount: HTMLElement }> {
    document.body.innerHTML = '<div id="app"></div>';
    const mount = document.getElementById('app') as HTMLElement;
    const controller = new AppController(mount);
    controllers.push(controller);
    await controller.init();
    return { controller, mount };
  }

  it('continues from typing through the earned stamp, building a house, and buying the first facility before completion', async () => {
    const { controller, mount } = await mountFreshApp();

    // S1: Open the goal dialog on the first visit.
    const intro = mount.querySelector('dialog[open][data-testid="onboarding-coach"]');
    expect(intro?.getAttribute('data-onboarding-step')).toBe('S1');
    expect(intro?.querySelector('h2')?.textContent).toBe('このゲームの目的');
    expect(intro?.textContent).toContain('街を発展');
    expect(document.activeElement).toBe(intro?.querySelector('[data-testid="onboarding-next-btn"]'));
    expect(mount.querySelector('[data-testid="map-onboard-target-badge"]')).toBeNull();
    expect(Array.from(mount.querySelectorAll<HTMLButtonElement>('.kb-nav-btn')).every((b) => b.disabled)).toBe(true);

    // Global shortcuts (Digit1-5, p, t, Escape) are blocked and Tab focus is trapped within S1
    pressWindowKey('2', 'Digit2');
    pressWindowKey('p', 'KeyP');
    pressWindowKey('t', 'KeyT');
    pressWindowKey('Escape');
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S1');
    pressWindowKey('Tab');
    expect(document.activeElement).toBe(mount.querySelector('[data-testid="onboarding-skip-btn"]'));
    pressWindowKey('Tab');
    expect(document.activeElement).toBe(mount.querySelector('[data-testid="onboarding-next-btn"]'));
    pressWindowKey('Tab');
    expect(document.activeElement).toBe(mount.querySelector('[data-testid="onboarding-skip-btn"]'));

    // S1 -> S2
    const nextBtn = mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]');
    expect(nextBtn).not.toBeNull();
    nextBtn?.click();

    // S2: Close the goal dialog and highlight residential on the map.
    const s2Coach = mount.querySelector('[data-testid="onboarding-coach"]');
    expect(s2Coach?.getAttribute('data-onboarding-step')).toBe('S2');
    expect(s2Coach?.getAttribute('data-pointer')).toBe('up');
    expect(s2Coach?.querySelector('.kb-coach-arrow.is-arrow-up')).not.toBeNull();
    expect(s2Coach?.textContent).toContain('住宅地');
    expect(s2Coach?.textContent).not.toContain('拠点');
    expect(mount.querySelector('[data-testid="onboarding-next-btn"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-action-hint"]')).toBeNull();
    expect(mount.querySelector('dialog[data-testid="onboarding-coach"]')).toBeNull();
    expect(mount.querySelector('.kb-home-map-viewport')?.classList.contains('is-onboard-spotlight-map')).toBe(true);
    expect(mount.querySelector('.kb-city-map')?.classList.contains('has-onboard-spotlight')).toBe(true);
    expect(mount.querySelector('.kb-map-district-btn[data-district-id="residential"]')?.classList.contains('is-onboard-target')).toBe(true);
    expect(mount.querySelector('[data-testid="map-onboard-target-badge"]')?.textContent).toContain('ここを選択');
    expect(mount.querySelector<HTMLButtonElement>('[data-testid="home-practice-btn"]')?.disabled).toBe(true);
    expect(Array.from(mount.querySelectorAll<HTMLButtonElement>('.kb-nav-btn')).every((b) => b.disabled)).toBe(true);
    controller.navigate('UPGRADES');
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();

    // Pressing Enter, p, t, or Escape in S2 must NOT auto-launch typing or skip onboarding
    pressWindowKey('Enter');
    pressWindowKey('p', 'KeyP');
    pressWindowKey('t', 'KeyT');
    pressWindowKey('Escape');
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S2');
    expect(mount.querySelector('[data-testid="onboarding-input-check-note"]')).toBeNull();

    // Clicking locked market district in S2 displays notice and stays on Home without difficulty popup
    const lockedMarketBtn = mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="market"]');
    lockedMarketBtn?.click();
    expect(mount.querySelector('[data-testid="difficulty-popup"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S2');
    expect(mount.querySelector('[data-testid="onboarding-subnote"]')?.textContent).toContain('住宅地');

    // Clicking residential launches TUTORIAL directly without difficulty popup
    const residentialBtn = mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]');
    residentialBtn?.click();
    expect(mount.querySelector('[data-testid="difficulty-popup"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-input-check-note"]')).not.toBeNull();

    // Cancelling INPUT_CHECK (戻る) returns to Home at S2 with onboarding backdrop visible
    const inputCheckBackBtn = Array.from(mount.querySelectorAll<HTMLButtonElement>('.kb-play-paper button')).find(
      (btn) => btn.textContent?.trim().startsWith('戻る'),
    );
    expect(inputCheckBackBtn).not.toBeUndefined();
    inputCheckBackBtn?.click();
    await flushUi();
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-backdrop"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S2');

    // Re-selecting residential launches TUTORIAL again -> Pass INPUT_CHECK with 'a' -> S3
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-input-check-note"]')).not.toBeNull();

    // Pass INPUT_CHECK with 'a' -> S3
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S3');
    expect(mount.querySelector('[data-testid="onboarding-efficiency-table"]')).toBeNull();

    // Mistake at 0 cargo shows reassurance without blocking progress; resets on next word after completion
    pressKey(mount, 'z');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('打ち間違えても大丈夫');
    expect(mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('積載 0/5');
    typeKeys(mount, getPromptRomaji(mount));
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S3');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).not.toContain('打ち間違えても大丈夫');

    // Complete next tutorial word cleanly -> S4 + 1 cargo
    typeKeys(mount, getPromptRomaji(mount));
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S4');
    expect(mount.querySelector('[data-testid="onboarding-efficiency-table"]')).not.toBeNull();
    expect(mount.querySelector('[data-cargo-tier="1"]')?.classList.contains('is-current')).toBe(true);
    expect(mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('積載 1/5');

    // Manual 1-cargo delivery is guarded in S4: keeps 1 cargo and prompts for 2+ cargo summary delivery
    pressKey(mount, 'Enter');
    expect(mount.querySelector('[data-testid="onboarding-complete-card"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S4');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('2個以上まとめて');
    expect(mount.querySelector('[data-cargo-tier="1"]')?.classList.contains('is-current')).toBe(true);

    // Complete 1 more clean word -> cargo becomes 2 -> collapse lesson shown
    typeKeys(mount, getPromptRomaji(mount));
    expect(mount.querySelector('[data-cargo-tier="2"]')?.classList.contains('is-current')).toBe(true);
    const collapseLesson = mount.querySelector('[data-testid="onboarding-collapse-lesson"]');
    expect(collapseLesson).not.toBeNull();
    expect(collapseLesson?.textContent).toContain('積んだ荷物が崩れます');

    // Mid-word in S4 updates coach text and mid-word Enter keeps cargo count + avoids red error highlight
    const midWordRomaji = getPromptRomaji(mount);
    pressKey(mount, midWordRomaji[0]);
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('打ち終えてから');
    pressKey(mount, 'Enter');
    expect(mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('積載 2/5');
    expect(mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('打ち切ってから');
    typeKeys(mount, midWordRomaji.slice(1));

    // Deliver cargo, watch it arrive, and show the earned stamp with support supplies.
    pressKey(mount, 'Enter');
    expect(mount.querySelector('[data-testid="onboarding-complete-card"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('荷馬車が出発しました');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-pointer')).toBe('none');
    expect(mount.querySelector('[data-world-dest-label]')?.textContent).toContain('在庫 0');
    await flushUi(800);
    expect(mount.querySelector('[data-testid="onboarding-complete-card"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('住宅地に資材が到着しました');
    expect(mount.querySelector('[data-world-dest-label]')?.textContent).not.toContain('在庫 0');
    await flushUi(900);

    controller.beginOnboardingConstruction();
    expect(mount.querySelector('[data-testid="onboarding-stamp-reveal"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-receipt"]')).toBeNull();
    await watchStampReveals(mount);
    const receipt = mount.querySelector('dialog[open][data-testid="onboarding-receipt"]');
    expect(receipt?.textContent).toContain('実績を獲得');
    expect(receipt?.textContent).toContain('はじめのことば');
    expect(receipt?.textContent).toContain('街づくり支援');
    expect(controller.getSettings().onboarding?.status).toBe('in_progress');
    expect(controller.getSettings().tutorialCompleted).toBe(false);
    expect(controller.getUnlocks().A01).toBeDefined();

    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-build-next-btn"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S6');
    controller.navigate('HOME');
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('select');
    expect(mount.querySelector('[data-testid="upgrade-district-btn"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.textContent).toContain('住宅地を選ぼう');
    expect(mount.querySelector<HTMLButtonElement>('[data-testid="town-node-packaging"]')?.disabled).toBe(true);
    controller.upgradeDistrict('residential');
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S6');
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('upgrade');
    const buildBtn = mount.querySelector<HTMLButtonElement>('[data-testid="upgrade-district-btn"]');
    expect(buildBtn?.classList.contains('kb-onboard-action-target')).toBe(true);
    expect(buildBtn?.disabled).toBe(false);
    buildBtn?.click();
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S7');
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('select');
    expect(mount.querySelector('[data-testid="buy-packaging-btn"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.textContent).toContain('荷づくり台を選ぼう');
    const packagingTarget = mount.querySelector<HTMLButtonElement>('[data-testid="town-node-packaging"]');
    expect(packagingTarget?.classList.contains('is-onboard-target')).toBe(true);
    expect(mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.disabled).toBe(true);
    controller.buyEquipment('packaging');
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S7');
    packagingTarget?.click();
    const buyBtn = mount.querySelector<HTMLButtonElement>('[data-testid="buy-packaging-btn"]');
    expect(buyBtn?.classList.contains('kb-onboard-action-target')).toBe(true);
    expect(buyBtn?.disabled).toBe(false);
    buyBtn?.click();
    buyBtn?.click();
    expect(mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S8');
    expect(mount.textContent).toContain('施設を拡張できました');
    await vi.waitFor(() => expect(mount.querySelector('dialog[open][data-testid="onboarding-complete-dialog"]')).not.toBeNull());
    expect(Object.keys(controller.getUnlocks())).toHaveLength(3);
    expect(mount.textContent).toContain('荷づくり台 Lv.1');
    expect(controller.getSettings().onboarding?.status).toBe('completed');
    const finishBtn = mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-finish-home-btn"]');
    finishBtn?.click();
    await flushUi();

    // Returned to normal Home without onboarding overlay and with generated materials retained
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();
    const homeMaterials = mount.querySelector('[data-testid="home-next-level-materials"]')?.textContent ?? '';
    expect(homeMaterials).toContain('/ 150 資材');
    expect(mount.textContent).toContain('住宅地（Lv.1 / 5）');

    // Verify UPGRADES displays consistent integer arrived vs remaining materials (arrived + remaining === 30)
    pressWindowKey('j', 'KeyJ');
    const upgradesText = mount.textContent ?? '';
    const statusMatch = upgradesText.match(/到着済み (\d+) \/ 必要資材 (\d+)/);
    const remainMatch = upgradesText.match(/資材不足（あと (\d+)）/);
    if (statusMatch && remainMatch) {
      expect(Number(statusMatch[1]) + Number(remainMatch[1])).toBe(Number(statusMatch[2]));
    }

    // Verify dictionary counted completed words from tutorial, labels practice mastery clearly, and immediately prompts clicked practice word
    pressWindowKey('l', 'KeyL');
    expect(mount.textContent).toContain('ことば図鑑');
    expect(mount.textContent).toContain('完了 4 / 960語');
    const firstCard = mount.querySelector('.kb-word-card');
    expect(firstCard?.querySelector('.kb-badge')?.textContent).toBe('練習 0/3');
    const selectedWordText = firstCard?.querySelector('.kb-word-display')?.textContent ?? '';
    expect(selectedWordText.length).toBeGreaterThan(0);
    firstCard?.querySelector<HTMLButtonElement>('button')?.click();
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="play-word-ja"]')?.textContent).toBe(selectedWordText);
    controller.endPracticeToHome();

    // Replay onboarding from Settings and verify INPUT_CHECK gate opens consistently with 0 leaked mistakes
    controller.restartOnboarding();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S1');
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-input-check-note"]')).not.toBeNull();
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S3');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).not.toContain('打ち間違えても大丈夫');
    expect(mount.querySelector('.kb-mistake-pop')).toBeNull();

    // Quit replay back to Home and verify starting MAIN mode also goes cleanly through INPUT_CHECK with 0 leaked 'a'
    controller.skipOnboarding();
    await flushUi();
    controller.startMainRound(99);
    expect(mount.querySelector('.kb-input-start-key')).not.toBeNull();
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="play-word-ja"]')).not.toBeNull();
    expect(mount.querySelector('.kb-mistake-pop')).toBeNull();

    controller.destroy();

    const verifyRepo = new IndexedDbProfileRepository();
    await verifyRepo.init('verify-tab');
    const saved = await verifyRepo.loadAll();
    expect(saved.profile.onboarding?.status).toBe('completed');
    verifyRepo.close();

    // Reloading app in a new AppController does not re-open onboarding S1
    const second = await mountFreshApp();
    expect(second.mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(second.mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();
  }, 45000);

  it('reveals the earned postcard after the three stamps from automatic delivery', async () => {
    const { controller, mount } = await mountFreshApp();
    controller.updateSettings({ reduceMotion: true });
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    await passStartGate(mount);
    for (let count = 0; count < 5; count += 1) typeKeys(mount, getPromptRomaji(mount));
    await flushUi(600);
    expect(controller.getUnlocks().A02).toBeUndefined();
    expect(controller.getUnlocks().A04).toBeDefined();
    await watchStampReveals(mount, ['A01', 'A03', 'A04', 'reward_family_a_postcard']);
    expect(mount.querySelector('[data-testid="onboarding-receipt"]')).not.toBeNull();
  }, 20000);

  it('restores completed words, held cargo, partial input, and the earned stamp before the first delivery', async () => {
    let app = await mountFreshApp();
    app.mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    app.mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    await passStartGate(app.mount);
    typeKeys(app.mount, 'neko');
    typeKeys(app.mount, 'ha');
    app.controller.destroy();
    await flushUi(100);
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-input-check-note"]')?.textContent).toContain('完了 1語・積載 1/5');
    await passStartGate(app.mount);
    expect(app.mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S4');
    expect(app.mount.querySelector('.kb-roman-typed')?.textContent).toBe('ha');
    expect(app.mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('積載 1/5');
    expect(app.mount.textContent).toContain('スコア 40点');
    expect(app.mount.querySelector('[data-world-dest-label]')?.textContent).toContain('在庫 0');
    typeKeys(app.mount, 'na');
    expect(app.mount.textContent).toContain('完了 2語');
    expect(app.mount.querySelector('[data-testid="play-deliver-hint"]')?.textContent).toContain('積載 2/5');
    await flushUi();
    expect(app.controller.getUnlocks().A01).toBeDefined();
    app.controller.skipOnboarding();
    await flushUi();
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();
  }, 15000);

  it('saves earned stamps, support supplies, and each expansion checkpoint across reloads', async () => {
    let app = await mountFreshApp();
    app.controller.updateSettings({ reduceMotion: true });
    app.mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    app.mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    await passStartGate(app.mount);
    typeKeys(app.mount, getPromptRomaji(app.mount));
    typeKeys(app.mount, getPromptRomaji(app.mount));
    await flushUi();
    const saveFailure = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy')
      .mockRejectedValueOnce(new Error('Temporary storage failure'));
    pressKey(app.mount, 'Enter');
    await flushUi(500);
    expect(app.mount.querySelector('[data-testid="onboarding-retry-save-btn"]')).not.toBeNull();
    app.mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-retry-save-btn"]')?.click();
    await flushUi();
    saveFailure.mockRestore();
    expect(app.mount.querySelector('dialog[open][data-testid="onboarding-stamp-reveal"]')).not.toBeNull();
    const receipt = app.controller.getSettings().onboarding?.receipt;
    expect(receipt?.generatedMaterialsMicro).toBe('11200000');
    expect(receipt?.supportMaterialsMicro).toBe('19000000');
    expect(BigInt(receipt?.supportCoinsMicro ?? '0')).toBeGreaterThan(0n);
    await watchStampReveals(app.mount, ['A01']);

    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.controller.getSettings().onboarding?.status).toBe('in_progress');
    expect(app.controller.getSettings().tutorialCompleted).toBe(false);
    expect(app.controller.getSettings().onboarding?.receipt).toEqual(receipt);
    expect(app.controller.getUnlocks().A01).toBeDefined();
    expect(app.mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id')).toBe('A02');
    await watchStampReveals(app.mount, ['A02', 'A03', 'reward_family_a_postcard']);
    expect(app.mount.querySelector('dialog[open][data-testid="onboarding-receipt"]')).not.toBeNull();
    app.mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-build-next-btn"]')?.click();
    await flushUi();
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S6');
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('select');
    app.mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    await flushUi();
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('upgrade');
    app.mount.querySelector<HTMLButtonElement>('[data-testid="upgrade-district-btn"]')?.click();
    await flushUi();
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-step')).toBe('S7');
    expect(app.controller.getSettings().tutorialCompleted).toBe(false);
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('select');
    app.mount.querySelector<HTMLButtonElement>('[data-testid="town-node-packaging"]')?.click();
    await flushUi();
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')?.getAttribute('data-onboarding-phase')).toBe('upgrade');
    app.mount.querySelector<HTMLButtonElement>('[data-testid="buy-packaging-btn"]')?.click();
    await flushUi();
    const completedUnreadCount = app.mount.querySelector('.kb-unread-pill')?.textContent;
    expect(app.mount.querySelector('.kb-onboarding-final-stamps')?.textContent).toContain('はじめのことば');
    app.controller.destroy();
    app = await mountFreshApp();
    expect(app.mount.querySelector('[data-testid="onboarding-upgrades"]')).toBeNull();
    expect(app.controller.getSettings().onboarding?.status).toBe('completed');
    expect(app.controller.getSettings().tutorialCompleted).toBe(true);
    expect(app.mount.querySelector('.kb-unread-pill')?.textContent).toBe(completedUnreadCount);
    app.controller.navigate('UPGRADES');
    expect(app.mount.textContent).toContain('荷づくり台 Lv.1');
  }, 45000);

  it('teaches cargo collapse while preserving base materials and triggers 3-fail rescue bar with practice roundtrip', async () => {
    const { mount } = await mountFreshApp();
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    await passStartGate(mount);
    typeKeys(mount, getPromptRomaji(mount));

    // Now in S4 with 1 cargo loaded; trigger mistake to collapse cargo back to 0
    expect(mount.querySelector('[data-cargo-tier="1"]')?.classList.contains('is-current')).toBe(true);
    pressKey(mount, 'x');
    expect(mount.querySelector('[data-testid="onboarding-collapse-lesson"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-collapse-lesson"]')?.textContent).toContain('荷物が崩れました');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).toContain('2語ノーミス');

    // Trigger 4 consecutive key mistakes on the current word to immediately surface the rescue bar while keeping Skip
    for (let i = 0; i < 4; i++) {
      pressKey(mount, 'z');
    }
    expect(mount.querySelector('[data-testid="onboarding-rescue-bar"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"] [data-testid="onboarding-rescue-bar"]')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-skip-btn"]')?.textContent).toContain('スキップ');

    // Rescue "ゆっくり練習する" opens PRACTICE, labels CTA "チュートリアルに戻る", and returns directly to S3 tutorial typing
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-rescue-practice-btn"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')).toBeNull();
    await passStartGate(mount);
    const backToTutorialBtn = mount.querySelector<HTMLButtonElement>('[data-testid="practice-try-main-btn"]');
    expect(backToTutorialBtn?.textContent).toContain('チュートリアルに戻る');
    backToTutorialBtn?.click();
    await passStartGate(mount);
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S3');

    // Re-enter practice via rescue and confirm Escape restores S2 on Home
    for (let i = 0; i < 4; i++) {
      pressKey(mount, 'z');
    }
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-rescue-practice-btn"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')).toBeNull();
    pressWindowKey('Escape');
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S2');

    // Completing 3 words with mistakes also triggers rescue bar in a fresh session, and a clean word clears it
    const secondRun = await mountFreshApp();
    secondRun.mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    secondRun.mount
      .querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')
      ?.click();
    await passStartGate(secondRun.mount);
    for (let i = 0; i < 3; i++) {
      const target = getPromptRomaji(secondRun.mount);
      pressKey(secondRun.mount, 'z');
      if (target) {
        typeKeys(secondRun.mount, target);
      }
    }
    expect(secondRun.mount.querySelector('[data-testid="onboarding-rescue-bar"]')).not.toBeNull();
    typeKeys(secondRun.mount, getPromptRomaji(secondRun.mount));
    expect(secondRun.mount.querySelector('[data-testid="onboarding-rescue-bar"]')).toBeNull();
  }, 25000);

  it('supports skipping onboarding, restarting from Settings, and suppressing auto-start on prior-activity profiles', async () => {
    const { controller, mount } = await mountFreshApp();

    // Skip from S1
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-skip-btn"]')?.click();
    await flushUi();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();

    // Navigating to Settings and restarting onboarding opens S1 on Home
    pressWindowKey('s', 'KeyS');
    const restartBtn = mount.querySelector<HTMLButtonElement>('[data-testid="settings-restart-onboarding-btn"]');
    expect(restartBtn).not.toBeNull();
    restartBtn?.click();
    await flushUi();

    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('dialog[open][data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S1');

    // Verify fontScale persists in localStorage and restores across controller reload
    controller.setFontScale('1.3');
    controller.destroy();
    const reloadedWithFontScale = await mountFreshApp();
    expect(document.documentElement.style.getPropertyValue('--kb-font-scale')).toBe('1.3');
    reloadedWithFontScale.controller.destroy();

    // Seed prior activity (tutorialCompleted = true) into a fresh DB and confirm auto-start stays suppressed
    window.localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    const seedRepo = new IndexedDbProfileRepository();
    const meta = await seedRepo.init('seed-tab');
    await seedRepo.saveProfile(
      { tutorialCompleted: true },
      { tabId: 'seed-tab', writeEpoch: meta.writeEpoch, resetGeneration: meta.resetGeneration },
    );
    seedRepo.close();

    const third = await mountFreshApp();
    expect(third.mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(third.mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();

    // Verify Settings reset confirmation modal (open -> cancel -> open -> confirm) & status banner
    third.controller.setFontScale('1.3');
    third.controller.navigate('SETTINGS');
    const resetSettingsBtn = third.mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-settings-btn"]');
    expect(resetSettingsBtn).not.toBeNull();
    resetSettingsBtn?.click();
    expect(third.mount.querySelector('[data-testid="settings-reset-confirm-dialog"]')).not.toBeNull();

    third.mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-cancel-btn"]')?.click();
    expect(third.mount.querySelector('[data-testid="settings-reset-confirm-dialog"]')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--kb-font-scale')).toBe('1.3');

    third.mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-settings-btn"]')?.click();
    third.mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-confirm-btn"]')?.click();
    await flushUi();
    expect(third.mount.querySelector('[data-testid="settings-reset-confirm-dialog"]')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--kb-font-scale')).toBe('1.0');
    expect(third.mount.querySelector('[data-testid="settings-status-banner"]')?.textContent).toContain('初期化しました');

    // Navigating back to Home confirms tutorialCompleted was preserved after resetting settings
    third.controller.navigate('HOME');
    expect(third.mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();
    third.controller.destroy();
  });
});
