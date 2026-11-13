import { expect, test, type Page } from '@playwright/test';
import { beginMain, summarizeResult } from './helpers';

async function completeWord(page: Page) {
  const guide = (await page.locator('#romaji-guide').textContent())!;
  await page.locator('#game-input').pressSequentially(guide);
  await expect(page.locator('#cargo-count')).toHaveText('1');
  return guide.length * 10;
}

test.use({ viewport: { width: 1440, height: 900 } });

test('native input, delivery, 90-second finish, and same-plan retry', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('desktop-home.png'), fullPage: true });
  await beginMain(page, { fromHome: true });
  await expect(page.locator('#paused-layer')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('desktop-game.png'), fullPage: false });
  await expect(page.locator('#paused-layer')).toBeHidden();
  const firstWord = await page.locator('#prompt-word').textContent();
  await page.locator('#game-input').press('Space');
  await page.clock.runFor(5000);
  await expect(page.locator('#time-left')).toHaveText('90');
  const base = await completeWord(page);
  await expect(page.locator('#score')).toHaveText(String(base));
  await page.locator('#game-input').press('Space');
  await expect(page.locator('#cargo-count')).toHaveText('0');
  const total = base + Math.floor(base / 5);
  await expect(page.locator('#score')).toHaveText(String(total));
  await page.clock.runFor(90001);
  await expect(page.locator('.result-stage-value strong')).toContainText(String(total));
  await expect(page.locator('.result-stage-metrics')).toContainText('100.0');
  await page.screenshot({ path: testInfo.outputPath('desktop-result.png'), fullPage: true });
  await summarizeResult(page);
  await page.locator('[data-result-action="retry"]').click();
  await expect(page.locator('#prompt-word')).toHaveText(firstWord!);
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#time-left')).toHaveText('90');
  await expect(page.locator('#game-input')).toBeFocused();
});

test('mistakes preserve completion points and paused time does not consume the round', async ({ page }) => {
  await page.clock.install();
  await beginMain(page);
  const base = await completeWord(page);
  await page.locator('#game-input').press("'");
  await expect(page.locator('#cargo-count')).toHaveText('0');
  await expect(page.locator('#score')).toHaveText(String(base));
  await page.locator('#game-input').press('Space');
  await expect(page.locator('#game-message')).toContainText('このことばを完成');
  await page.clock.runFor(20000);
  await page.locator('#game-input').press('Escape');
  const remaining = await page.locator('#time-left').textContent();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(30000);
  await expect(page.locator('#time-left')).toHaveText(remaining!);
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('#game-input')).toBeFocused();
  await expect(page.locator('#time-left')).toHaveText(remaining!);
});

test('narrow screens receive the required-width guidance before starting', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-action="start"]')).toBeDisabled();
  await expect(page.getByText(/幅768px以上/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('narrow-home.png'), fullPage: true });
});
