import { expect, test, type Locator, type Page } from '@playwright/test';
import { beginTutorial, typeCurrentGuide } from './helpers';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from './keyboard';

interface AudioProbe {
  attempts: number;
  created: number;
  decoded: number[];
  starts: { milliseconds: number; loop: boolean; active: boolean }[];
  stops: number;
}
/** Instruments native Web Audio; asset fetch/decode and source playback remain real. */
async function observeNativeAudio(page: Page, denyFirstCreation = false) {
  await page.addInitScript(({ denyFirstCreation }) => {
    const native = globalThis.AudioContext;
    const probe = { attempts: 0, created: 0, decoded: [] as number[], starts: [] as { milliseconds: number; loop: boolean; active: boolean }[], stops: 0 };
    Object.defineProperty(window, '__audioProbe', { value: probe });
    class ObservedAudioContext extends native {
      constructor() {
        probe.attempts++;
        if (denyFirstCreation && probe.attempts === 1) throw new Error('Audio context temporarily unavailable');
        super(); probe.created++;
      }
      decodeAudioData(data: ArrayBuffer) {
        return super.decodeAudioData(data).then(buffer => { probe.decoded.push(Math.round(buffer.duration * 1000)); return buffer; });
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source); const stop = source.stop.bind(source);
        let entry: { milliseconds: number; loop: boolean; active: boolean } | undefined;
        source.start = (when = 0, offset = 0, duration?: number) => {
          entry = { milliseconds: Math.round((source.buffer?.duration ?? 0) * 1000), loop: source.loop, active: true };
          probe.starts.push(entry);
          if (duration === undefined) start(when, offset); else start(when, offset, duration);
        };
        source.stop = (when = 0) => { if (entry) entry.active = false; probe.stops++; stop(when); };
        source.addEventListener('ended', () => { if (entry) entry.active = false; });
        return source;
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: ObservedAudioContext });
  }, { denyFirstCreation });
}
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe);
const musicCount = async (page: Page) => (await probe(page)).starts.filter(start => start.loop).length;
const count = async (page: Page, milliseconds: number) => (await probe(page)).starts.filter(start => start.milliseconds === milliseconds).length;
async function openAudioSettings(page: Page) {
  await keyboardMenuTo(page, 'settings');
  const settings = page.locator('.settings-dialog');
  await expect(settings).toBeVisible();
  return settings;
}
async function setVolume(page: Page, slider: Locator, percent: number) {
  await keyboardRevealControl(page, slider); await tabTo(page, slider); await page.keyboard.press('Home');
  for (let step = 0; step < percent; step++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(percent));
}

test('sound opt-in persists independent volumes and confirms native key/word/delivery/mistake feedback without replay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await observeNativeAudio(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/sound_effect/')) requests.push(request.url()); });
  await page.goto('/');
  expect((await probe(page)).created).toBe(0); expect(requests).toEqual([]);
  const settings = await openAudioSettings(page);
  const sound = settings.locator('input[name="sound"]');
  await keyboardRevealControl(page, sound); await expect(sound).not.toBeChecked();
  await expect(settings.locator('#audio-master')).toHaveValue('50');
  await expect(settings.locator('#audio-effects')).toHaveValue('70');
  await expect(settings.locator('#audio-music')).toHaveValue('25');
  await sound.check();
  await expect.poll(() => musicCount(page)).toBe(1);
  await expect.poll(async () => { const decoded = (await probe(page)).decoded; return [80, 100, 150, 250, 350, 450].every(duration => decoded.includes(duration)); }).toBe(true);
  await setVolume(page, settings.locator('#audio-master'), 30);
  await setVolume(page, settings.locator('#audio-effects'), 60);
  await setVolume(page, settings.locator('#audio-music'), 15);
  await expect(settings.locator('[data-save-status]')).toContainText('保存済み');
  await page.keyboard.press('Escape');
  await beginTutorial(page, { fromHome: true });
  expect((await probe(page)).starts.filter(start => !start.loop)).toEqual([]); // input-check a is not a game operation
  await typeCurrentGuide(page);
  await expect.poll(() => count(page, 80)).toBe(3);
  await expect.poll(() => count(page, 150)).toBe(1);
  await expect(page.locator('#score')).toHaveText('40');
  await page.locator('#game-input').press('Space');
  await expect.poll(() => count(page, 250)).toBe(1);
  await expect(page.locator('#score')).toHaveText('48');
  const startsAfterDelivery = (await probe(page)).starts.length;
  await expect(page.getByRole('button', { name: '90秒の配達へ →' })).toBeVisible();
  await page.waitForTimeout(350); // exercise several80ms redraws and asynchronous save completions
  expect((await probe(page)).starts.length).toBe(startsAfterDelivery);
  await page.getByRole('button', { name: '90秒の配達へ →' }).click();
  const reading = await page.locator('#prompt-reading').textContent();
  const wrong = await page.evaluate(async text => {
    const { RomajiEngine } = await import('/src/typing/index.ts');
    return 'abcdefghijklmnopqrstuvwxyz'.split('').find(key => !new RomajiEngine(text!).input(key).accepted)!;
  }, reading);
  await page.locator('#game-input').press(wrong);
  await expect.poll(() => count(page, 100)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#paused-layer')).toBeVisible();
  await expect.poll(async () => (await probe(page)).starts.filter(start => start.active).length).toBe(0);
  const beforeResume = (await probe(page)).starts.length;
  await page.waitForTimeout(350); expect((await probe(page)).starts.length).toBe(beforeResume);
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await probe(page)).starts.filter(start => start.active && start.loop).length).toBe(1);
  await page.reload();
  expect((await probe(page)).created).toBe(0);
  const reopened = await openAudioSettings(page);
  await expect(reopened.locator('input[name="sound"]')).toBeChecked();
  await expect(reopened.locator('#audio-master')).toHaveValue('30');
  await expect(reopened.locator('#audio-effects')).toHaveValue('60');
  await expect(reopened.locator('#audio-music')).toHaveValue('15');
});

test('an audio startup failure stays silent without blocking real typing, and explicit retry uses native MP3 fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await observeNativeAudio(page, true);
  await page.route('**/audio_theme.ogg', route => route.abort());
  const requested: string[] = []; page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  let settings = await openAudioSettings(page);
  const sound = settings.locator('input[name="sound"]'); await keyboardRevealControl(page, sound); await sound.check();
  await expect(settings.locator('[data-audio-status]')).toContainText('消音で配達を続けられます');
  await page.keyboard.press('Escape'); await beginTutorial(page, { fromHome: true }); await typeCurrentGuide(page);
  await expect(page.locator('#score')).toHaveText('40');
  expect((await probe(page)).attempts).toBe(1); // game input never retries failure on every keystroke
  settings = await openAudioSettings(page);
  const retry = settings.locator('[data-action="enable-audio"]'); await keyboardRevealControl(page, retry); await retry.click();
  await expect.poll(async () => (await probe(page)).created).toBe(1);
  await expect(settings.locator('[data-audio-status]')).not.toContainText('再生できません');
  await page.keyboard.press('Escape'); await page.locator('[data-action="resume"]').click();
  await expect.poll(() => musicCount(page)).toBeGreaterThan(0);
  expect(requested.some(url => url.endsWith('audio_theme.ogg'))).toBe(true);
  expect(requested.some(url => url.endsWith('audio_theme.mp3'))).toBe(true);
  await expect(page.locator('#score')).toHaveText('40');
});

test('sound controls remain reachable by keyboard at150percent in the target landscape viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await observeNativeAudio(page); await page.goto('/');
  const settings = await openAudioSettings(page);
  const scale = settings.locator('input[name="fontScale"][value="150"]');
  await keyboardRevealControl(page, scale); await scale.check();
  const sound = settings.locator('input[name="sound"]'); await keyboardRevealControl(page, sound); await tabTo(page, sound); await page.keyboard.press('Space');
  await expect(sound).toBeChecked();
  for (const channel of ['master', 'effects', 'music']) {
    const slider = settings.locator(`#audio-${channel}`); await keyboardRevealControl(page, slider); await tabTo(page, slider);
    await page.keyboard.press('ArrowLeft'); await assertViewportFits(page);
    const size = await slider.locator('..').locator('label').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBeGreaterThanOrEqual(24);
  }
});
