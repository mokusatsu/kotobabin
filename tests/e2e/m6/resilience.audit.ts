import { expect, test, type Page } from '@playwright/test';
import { beginMain, typeCurrentGuide } from '../helpers';
import { assertViewportFits, tabTo } from '../keyboard';

async function finishWithSixWords(page: Page, inspectFirstReveal?: () => Promise<void>) {
  await beginMain(page, { fromHome: true });
  for (let i = 0; i < 6; i++) await typeCurrentGuide(page);
  await expect(page.locator('#completed-count')).toHaveText('完成 6語');
  await page.clock.runFor(90001);
  await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'score');
  expect(Number((await page.locator('.result-stage-value strong').innerText()).replaceAll(',', ''))).toBeGreaterThan(0);
  await expect(page.locator('.result-stage [data-result-command="advance"]')).toBeEnabled();
  await page.keyboard.press('Enter'); await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'sealed');
  await page.keyboard.press('Escape'); await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'reveal');
  await expect(page.getByRole('heading', { name: 'はじめのことば', exact: true })).toBeVisible();
  await inspectFirstReveal?.();
  await page.keyboard.press('s'); await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'summary');
  await assertViewportFits(page);
}
async function retryAndType(page: Page) {
  const retry = page.locator('[data-result-action="retry"]'); await tabTo(page, retry); await page.keyboard.press('Enter');
  await expect(page.locator('#game-input')).toBeFocused(); await expect(page.locator('#score')).toHaveText('0');
  await typeCurrentGuide(page); await expect(page.locator('#completed-count')).toHaveText('完成 1語');
}

test('failed terrain vehicles and earned art cannot gate real typing or result navigation', async ({ page }, info) => {
  await page.clock.install(); const aborted: string[] = []; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/assets\/(terrain\/terrain_riverside|vehicle\/[^/]+|achievement_stamp\/stamp_a01)\.webp$/, route => {
    aborted.push(new URL(route.request().url()).pathname); return route.abort('failed');
  });
  await page.goto('/'); await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await finishWithSixWords(page, async () => {
    const failedStamp = page.locator('.result-stage img.stamp-picture[src$="/stamp_a01.webp"]');
    await expect(failedStamp).toHaveClass(/asset-load-failed/);
    await expect(failedStamp).toHaveCSS('visibility', 'hidden');
    await expect(failedStamp.locator('..').locator('.stamp-frame')).toBeVisible();
  });
  await retryAndType(page);
  expect(aborted.some(path => path.includes('terrain_riverside'))).toBe(true);
  expect(aborted.some(path => path.includes('stamp_a01'))).toBe(true); expect(errors).toEqual([]);
  await info.attach('failed-assets', { body: JSON.stringify({ aborted, applicationErrors: errors }), contentType: 'application/json' });
});

test('a fully loaded production page remains playable after the network disconnects', async ({ page, context }) => {
  await page.clock.install(); await page.goto('/'); await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await page.waitForLoadState('networkidle'); await context.setOffline(true);
  await finishWithSixWords(page); await retryAndType(page);
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await context.setOffline(false);
});

test('denied IndexedDB is visibly temporary and does not block a round or the next play', async ({ page }) => {
  // Explicit browser fault injection, not a claim about any OS privacy-mode implementation.
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true,
    get() { throw new DOMException('QA: storage permission denied', 'SecurityError'); } }));
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'memory');
  await expect(page.locator('#save-status')).toContainText('ページを閉じると');
  await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await finishWithSixWords(page); await retryAndType(page);
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'memory');
});

test('an unavailable production core shows the cause and a keyboard reload recovers', async ({ page }) => {
  const core = /\/assets\/main-[^/?]+\.js(?:\?.*)?$/; const blocked: string[] = [];
  await page.route(core, route => { blocked.push(new URL(route.request().url()).pathname); return route.abort('failed'); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('必要なデータの読み込み');
  await expect(page.locator('[data-action="start"]')).toHaveCount(0); expect(blocked.length).toBeGreaterThan(0);
  const reload = page.getByRole('link', { name: 'もう一度読み込む', exact: true }); await expect(reload).toBeVisible();
  await page.unroute(core); await tabTo(page, reload); await page.keyboard.press('Enter');
  await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await beginMain(page, { fromHome: true }); await typeCurrentGuide(page);
  await expect(page.locator('#completed-count')).toHaveText('完成 1語');
});
