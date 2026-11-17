// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AppController } from '@/ui/appController';
import { IndexedDbProfileRepository } from '@/progression/profileRepository';

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

function passInputCheck(mount: HTMLElement): void {
  const box = mount.querySelector<HTMLInputElement>('input.kb-input-check-box');
  if (!box) {
    throw new Error('Expected input.kb-input-check-box in DOM');
  }
  box.focus();
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
}

function getPromptRomaji(mount: HTMLElement): string {
  return mount.querySelector('.kb-prompt-roman')?.textContent?.trim() ?? '';
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

  it('walks through S1 -> S2 -> locked guard -> INPUT_CHECK -> S3 -> S4 (1-cargo guard & collapse lesson) -> S5 -> Home and persists completion', async () => {
    const { controller, mount } = await mountFreshApp();

    // S1: Smartphone-style backdrop + bottom goal spotlight (no map spotlight yet, downward pointer, Next button present)
    const s1Coach = mount.querySelector('[data-testid="onboarding-coach"]');
    expect(s1Coach).not.toBeNull();
    expect(s1Coach?.getAttribute('data-onboarding-step')).toBe('S1');
    expect(s1Coach?.getAttribute('data-pointer')).toBe('down');
    expect(s1Coach?.textContent).toContain('街を発展');
    expect(mount.querySelector('[data-testid="onboarding-backdrop"]')).not.toBeNull();
    expect(mount.querySelector('.kb-district-summary')?.classList.contains('is-onboard-spotlight-card')).toBe(true);
    expect(mount.querySelector('[data-testid="home-next-level-materials"]')?.classList.contains('is-onboard-highlight')).toBe(true);
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

    // S2: Map spotlight replaces goal card spotlight; no Next button; global Enter does NOT skip district selection
    const s2Coach = mount.querySelector('[data-testid="onboarding-coach"]');
    expect(s2Coach?.getAttribute('data-onboarding-step')).toBe('S2');
    expect(s2Coach?.getAttribute('data-pointer')).toBe('up');
    expect(s2Coach?.querySelector('.kb-coach-arrow.is-arrow-up')).not.toBeNull();
    expect(s2Coach?.textContent).toContain('住宅地');
    expect(s2Coach?.textContent).not.toContain('拠点');
    expect(mount.querySelector('[data-testid="onboarding-next-btn"]')).toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-action-hint"]')).toBeNull();
    expect(mount.querySelector('.kb-district-summary')?.classList.contains('is-onboard-spotlight-card')).toBe(false);
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
      (btn) => btn.textContent?.trim() === '戻る',
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
    passInputCheck(mount);
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

    // Deliver cargo -> Stage 1 (transit) -> Stage 2 (arrival celebration, modal still hidden) -> Stage 3 (S5 card)
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

    const completeCard = mount.querySelector('[data-testid="onboarding-complete-card"]');
    expect(completeCard).not.toBeNull();
    expect(completeCard?.textContent).toContain('できたことが、切手になります');
    expect(completeCard?.textContent).toContain('はじめのことば');
    expect(completeCard?.textContent).not.toContain('はじめの一歩');

    const matText = mount.querySelector('[data-testid="onboarding-s5-materials"]')?.textContent ?? '';
    expect(matText).toContain('今回生み出した資材: +');
    expect(matText).not.toContain('+0 資材');

    const finishBtn = mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-finish-home-btn"]');
    expect(finishBtn?.textContent).toContain('ホームへ戻る');
    finishBtn?.click();
    await flushUi();

    // Returned to normal Home without onboarding overlay and with generated materials retained
    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();
    const homeMaterials = mount.querySelector('[data-testid="home-next-level-materials"]')?.textContent ?? '';
    expect(homeMaterials).toMatch(/(輸送待ち \+[1-9]|[1-9]\d* \/ 30)/);

    // Verify UPGRADES displays consistent integer arrived vs remaining materials (arrived + remaining === 30)
    pressWindowKey('2', 'Digit2');
    const upgradesText = mount.textContent ?? '';
    const statusMatch = upgradesText.match(/到着済み (\d+) \/ 必要資材 (\d+)/);
    const remainMatch = upgradesText.match(/資材不足（あと (\d+)）/);
    if (statusMatch && remainMatch) {
      expect(Number(statusMatch[1]) + Number(remainMatch[1])).toBe(Number(statusMatch[2]));
    }

    // Verify dictionary counted completed words from tutorial, labels practice mastery clearly, and immediately prompts clicked practice word
    pressWindowKey('4', 'Digit4');
    expect(mount.textContent).toContain('ことば図鑑');
    expect(mount.textContent).toContain('完了 4 / 960語');
    const firstCard = mount.querySelector('.kb-word-card');
    expect(firstCard?.querySelector('.kb-badge')?.textContent).toBe('練習 0/3');
    const selectedWordText = firstCard?.querySelector('.kb-word-display')?.textContent ?? '';
    expect(selectedWordText.length).toBeGreaterThan(0);
    firstCard?.querySelector<HTMLButtonElement>('button')?.click();
    expect(mount.querySelector('[data-testid="play-word-ja"]')?.textContent).toBe(selectedWordText);
    controller.endPracticeToHome();

    // Replay onboarding from Settings and verify INPUT_CHECK gate opens consistently with 0 leaked mistakes
    controller.restartOnboarding();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S1');
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-input-check-note"]')).not.toBeNull();
    passInputCheck(mount);
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.getAttribute('data-onboarding-step')).toBe('S3');
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')?.textContent).not.toContain('打ち間違えても大丈夫');
    expect(mount.querySelector('.kb-mistake-pop')).toBeNull();

    // Quit replay back to Home and verify starting MAIN mode also goes cleanly through INPUT_CHECK with 0 leaked 'a'
    controller.skipOnboarding();
    await flushUi();
    controller.startMainRound(99);
    expect(mount.querySelector('.kb-input-check-box')).not.toBeNull();
    passInputCheck(mount);
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
  });

  it('teaches cargo collapse while preserving base materials and triggers 3-fail rescue bar with practice roundtrip', async () => {
    const { mount } = await mountFreshApp();
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-next-btn"]')?.click();
    mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')?.click();
    passInputCheck(mount);
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
    expect(mount.querySelector('[data-testid="onboarding-skip-btn"]')?.textContent).toContain('スキップ');

    // Rescue "ゆっくり練習する" opens PRACTICE, labels CTA "チュートリアルに戻る", and returns directly to S3 tutorial typing
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-rescue-practice-btn"]')?.click();
    expect(mount.querySelector('[data-testid="onboarding-play-guide"]')).toBeNull();
    const backToTutorialBtn = mount.querySelector<HTMLButtonElement>('[data-testid="practice-try-main-btn"]');
    expect(backToTutorialBtn?.textContent).toContain('チュートリアルに戻る');
    backToTutorialBtn?.click();
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
    passInputCheck(secondRun.mount);
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
  });

  it('supports skipping onboarding, restarting from Settings, and suppressing auto-start on prior-activity profiles', async () => {
    const { controller, mount } = await mountFreshApp();

    // Skip from S1
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-skip-btn"]')?.click();
    await flushUi();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')).toBeNull();

    // Navigating to Settings and restarting onboarding opens S1 on Home
    pressWindowKey('5', 'Digit5');
    const restartBtn = mount.querySelector<HTMLButtonElement>('[data-testid="settings-restart-onboarding-btn"]');
    expect(restartBtn).not.toBeNull();
    restartBtn?.click();
    await flushUi();

    expect(mount.querySelector('.kb-home-screen')).not.toBeNull();
    expect(mount.querySelector('[data-testid="onboarding-coach"]')?.getAttribute('data-onboarding-step')).toBe('S1');

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
