import { expect, test, type Route } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo } from './keyboard';

test('the first handbook commit and early frames fit before its pictures load', async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.addInitScript(() => {
    type Sample = { phase: string; elapsed: number; height: number; documentHeight: number; scrollY: number; pages?: string; focus: string; outside: string[] };
    const samples: Sample[] = []; Object.assign(window, { firstHandbookSamples: samples });
    let seen = false;
    new MutationObserver(() => {
      const handbook = document.querySelector<HTMLElement>('.handbook-page');
      if (seen || !handbook) return; seen = true;
      const start = performance.now();
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
  await page.goto('/');
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
});
