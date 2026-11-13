import { expect, test, type Route } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo, keyboardWalkPanels } from './keyboard';

for (const height of [720, 820]) for (const font of [100, 125, 150]) test(`first handbook commit and early frames fit at1180x${height} font${font} before pictures load`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height });
  await page.addInitScript(() => {
    type Sample = { phase: string; elapsed: number; height: number; documentHeight: number; scrollY: number; pages?: string; focus: string; outside: string[] };
    const samples: Sample[] = []; Object.assign(window, { firstHandbookSamples: samples });
    let seen = false; let enteredAt = 0;
    document.addEventListener('keydown', event => {
      if (event.isTrusted && event.key === 'Enter' && (event.target as HTMLElement).dataset.action === 'handbook') enteredAt = performance.now();
    }, true);
    new MutationObserver(() => {
      const handbook = document.querySelector<HTMLElement>('.handbook-page');
      if (seen || !handbook) return; seen = true;
      const start = enteredAt || performance.now();
      const sample = (phase: string) => samples.push({ phase, elapsed: performance.now() - start, height: innerHeight,
        documentHeight: document.documentElement.scrollHeight, scrollY, pages: handbook.dataset.ipadPages,
        focus: document.activeElement?.textContent?.trim() ?? '',
        outside: [...handbook.querySelectorAll<HTMLElement>('button,input,select,a')].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
          .filter(element => { const r = element.getBoundingClientRect(); return r.bottom > innerHeight + 1 || r.top < -1; }).map(element => element.outerHTML.slice(0, 100)) });
      queueMicrotask(() => sample('committed'));
      requestAnimationFrame(() => requestAnimationFrame(() => sample('early-frame')));
      for (const delay of [100, 300, 1000]) setTimeout(() => sample(`after-${delay}ms`), delay);
    }).observe(document, { childList: true, subtree: true });
  });
  if (font === 100) await page.goto('/');
  else {
    await page.route('**/src/main.ts', route => route.abort()); await page.goto('/');
    await page.evaluate(async scale => {
      const source = '/src/profile/repository.ts'; const { createProfileDocument } = await import(source);
      const profile = createProfileDocument(); profile.settings.fontScale = scale; profile.tutorialSeen = true;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('kotobabin', 4);
        request.onupgradeneeded = () => request.result.createObjectStore('profile');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const tx = db.transaction('profile', 'readwrite'); tx.objectStore('profile').put(profile, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
    }, font);
    await page.unroute('**/src/main.ts'); await page.reload();
  }
  await expect(page.locator('#app')).toHaveCSS('font-size', `${16 * font / 100}px`);
  const held: Route[] = []; let release = false;
  await page.route(/\/assets\/(achievement_stamp|shared_frame)\//, route => release ? route.continue() : void held.push(route));
  await keyboardMenuTo(page, 'handbook');
  await expect.poll(() => page.evaluate(() => (window as unknown as { firstHandbookSamples: unknown[] }).firstHandbookSamples.length)).toBeGreaterThanOrEqual(5);
  const samples = await page.evaluate(() => (window as unknown as { firstHandbookSamples: { phase: string; height: number; documentHeight: number; scrollY: number; pages?: string; focus: string; outside: string[] }[] }).firstHandbookSamples);
  console.log('FIRST_HANDBOOK_EARLY', JSON.stringify(samples));
  await info.attach('first-handbook-samples.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  expect(held.length).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(sample.pages, JSON.stringify(sample)).toBeTruthy();
    expect(sample.documentHeight, JSON.stringify(sample)).toBeLessThanOrEqual(sample.height + 1);
    expect(sample.scrollY).toBe(0); expect(sample.outside, JSON.stringify(sample)).toEqual([]);
    expect(sample.focus).toBe('配達手帳');
  }
  release = true; await Promise.all(held.map(route => route.continue()));
  await expect(page.locator('.handbook-page img').first()).toHaveJSProperty('complete', true);
  await assertViewportFits(page);
  await keyboardWalkPanels(page);
  await keyboardMenuTo(page, 'home'); await keyboardMenuTo(page, 'handbook');
  await expect(page.locator('.handbook-title-panel h1')).toBeFocused();
  await assertViewportFits(page);
});
