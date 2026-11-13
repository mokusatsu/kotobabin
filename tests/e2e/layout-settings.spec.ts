import { expect, test } from '@playwright/test';
import { assertNoHorizontalOverflow, beginMain, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

for (const viewport of [{ width: 1366, height: 768 }, { width: 959, height: 900 }, { width: 767, height: 900 }]) {
  test(`readable layout and map fallback at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.home-intro')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const helperSize = await page.locator('.keyboard-note').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(helperSize).toBeGreaterThanOrEqual(16);
    if (await page.locator('.town-map').isVisible()) {
      expect((await page.locator('.town-map').boundingBox())!.width).toBeGreaterThanOrEqual(800);
      const labels = await page.locator('.town-map .map-label').evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { name: element.textContent, x, y, width, height };
      }));
      for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
        const a = labels[left], b = labels[right];
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width
          && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps, `${a.name} / ${b.name}`).toBe(false);
      }
    } else {
      await expect(page.locator('.compact-town')).toBeVisible();
      await expect(page.locator('.compact-town .district-list-button')).toHaveCount(6);
    }
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), fullPage: true });
    if (viewport.width >= 768) {
      await beginMain(page, { fromHome: true });
      await assertNoHorizontalOverflow(page);
      for (const selector of ['.continue-hint', '.risk-hint', '.typing-input-label']) {
        const size = await page.locator(selector).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(size, selector).toBeGreaterThanOrEqual(16);
      }
      await expect(page.locator('#paused-layer')).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`main-${viewport.width}.png`), fullPage: false });
      await expect(page.locator('#paused-layer')).toBeHidden();
    } else {
      await expect(page.locator('[data-action="start"]')).toBeDisabled();
      await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
      await expect(page.locator('#catalogue-count')).toContainText('960');
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('catalogue-767.png'), fullPage: true });
    }
  });
}

test('150% text, Enter delivery, reduced motion and sticky guide history keep the game usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.clock.install();
  await page.goto('/');
  await page.locator('[data-action="settings"]').click();
  const settings = page.locator('.settings-dialog');
  await settings.locator('input[name="fontScale"][value="150"]').check();
  await settings.locator('input[name="deliveryKeys"][value="Enter"]').check();
  await settings.locator('input[name="guide"]').uncheck();
  await settings.locator('input[name="reducedMotion"]').check();
  await settings.locator('[data-action="close-settings"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('home-font-150.png'), fullPage: true });
  await page.locator('[data-action="start"]').click();
  await confirmHalfWidthInput(page);
  await page.getByRole('button', { name: '導入を飛ばして本編へ', exact: true }).click();
  await expect(page.locator('#romaji-guide')).toBeHidden();
  const promptSize = await page.locator('#prompt-word').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(promptSize).toBeGreaterThanOrEqual(72);
  const guide = await typeCurrentGuide(page);
  await expect(page.locator('#cargo-count')).toHaveText('1');
  const baseScore = guide.length * 10;
  await page.locator('#game-input').press('Space');
  await expect(page.locator('#score')).toHaveText(String(baseScore));
  await expect(page.locator('#cargo-count')).toHaveText('1');
  await page.locator('#game-input').press('Enter');
  await expect(page.locator('#cargo-count')).toHaveText('0');
  await expect(page.locator('#score')).toHaveText(String(baseScore + Math.floor(baseScore / 5)));
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('main-font-150-guide-off.png'), fullPage: true });
  await page.locator('#game-input').press('Escape');
  await page.locator('#paused-layer [data-action="settings"]').click();
  await page.locator('.settings-dialog input[name="guide"]').check();
  await page.locator('.settings-dialog input[name="guide"]').uncheck();
  await page.locator('.settings-dialog [data-action="close-settings"]').click();
  await expect(page.locator('#paused-layer')).toBeVisible();
  await page.locator('[data-action="resume"]').click();
  await page.clock.runFor(90001);
  await expect(page.locator('.result-heading')).toContainText('ガイド表示あり');
  await page.screenshot({ path: testInfo.outputPath('result-font-150.png'), fullPage: true });
});
