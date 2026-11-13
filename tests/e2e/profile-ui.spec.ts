import { expect, test } from '@playwright/test';
import { beginMain, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

test('practice progress reopens from IndexedDB without replaying the last completion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  await page.locator('[data-action="practice-word"][data-word-id="living_r01"]').click();
  await confirmHalfWidthInput(page);
  await typeCurrentGuide(page);
  await expect(page.locator('#practice-progress')).toContainText('1/3');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.locator('[data-action="practice-end"]').click();
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.locator('.home-intro')).toBeVisible();
  // A reloaded document may require explicit ownership handoff from its prior tab identity.
  if (await page.locator('#ownership-status').getAttribute('data-ownership') === 'readonly') {
    await page.locator('[data-action="takeover"]').click();
  }
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  const row = page.locator('.word-list li').filter({ has: page.locator('[data-word-id="living_r01"]') });
  await expect(row).toContainText('1 / 3');
  await row.locator('[data-action="practice-word"]').click();
  await confirmHalfWidthInput(page);
  await expect(page.locator('#practice-progress')).toContainText('1/3');
  await typeCurrentGuide(page);
  await expect(page.locator('#practice-progress')).toContainText('2/3');
});

test('a second tab is read-only and a paused owner can reclaim control using the keyboard', async ({ page, context }, testInfo) => {
  await beginMain(page);
  await typeCurrentGuide(page);
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await second.locator('[data-action="takeover"]').click();
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await expect(page.locator('#paused-layer')).toBeVisible();
  const takeover = page.locator('#paused-layer [data-action="takeover"]');
  await expect(takeover).toBeVisible();
  await page.bringToFront();
  for (let attempts = 0; attempts < 12; attempts++) {
    if (await takeover.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(takeover).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('readonly-paused-keyboard-takeover.png'), fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await expect(page.locator('#paused-layer')).toBeVisible();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('#game-input')).toBeFocused();
  await expect(page.locator('#completed-count')).toHaveText('完成 1語');
  await second.close();
});
