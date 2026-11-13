import { expect, test } from '@playwright/test';
import { assertViewportFits, tabTo } from './keyboard';

for (const viewport of [{ width: 1180, height: 720 }, { width: 1180, height: 820 }, { width: 1024, height: 680 }, { width: 820, height: 1092 }]) {
  test(`keyboard-only round, retry and pause fit without scrolling at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await page.goto('/');
    await assertViewportFits(page);
    await page.screenshot({ path: testInfo.outputPath('tablet-home.png') });
    await tabTo(page, page.locator('[data-action="start"]'));
    await page.keyboard.press('Enter');
    await assertViewportFits(page);
    await expect(page.locator('#game-input')).toBeFocused();
    await page.keyboard.type('a');
    await tabTo(page, page.locator('[data-action="confirm"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'TUTORIAL');
    await assertViewportFits(page);
    // Navigation uses the pause menu; Tab and Enter must not become scoring keys.
    await page.keyboard.press('Escape');
    await expect(page.locator('#paused-layer')).toBeVisible();
    await tabTo(page, page.getByRole('button', { name: '導入を飛ばして本編へ', exact: true }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
    await expect(page.locator('#game-input')).toBeFocused();
    await assertViewportFits(page);
    await page.screenshot({ path: testInfo.outputPath('tablet-main.png') });
    const guide = (await page.locator('#romaji-guide > span:not(.accepted)').allTextContents()).join('');
    await page.keyboard.type(guide);
    await expect(page.locator('#completed-count')).toHaveText('完成 1語');
    await page.keyboard.press('Escape');
    await expect(page.locator('#paused-layer')).toBeVisible();
    await assertViewportFits(page);
    await page.screenshot({ path: testInfo.outputPath('tablet-pause.png') });
    await tabTo(page, page.locator('#paused-layer [data-action="resume"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#game-input')).toBeFocused();
    await page.clock.runFor(90000);
    await expect(page.locator('.result-page')).toBeVisible();
    await expect(page.locator('.result-metrics')).toContainText('100.0');
    await assertViewportFits(page);
    await page.screenshot({ path: testInfo.outputPath('tablet-result.png') });
    await tabTo(page, page.locator('[data-action="retry"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#game-input')).toBeFocused();
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#time-left')).toHaveText('90');
    await page.keyboard.press('Escape');
    await tabTo(page, page.locator('#paused-layer [data-action="settings"]'));
    await page.keyboard.press('Enter');
    await expect(page.locator('.settings-dialog')).toBeVisible();
    await assertViewportFits(page);
    await page.screenshot({ path: testInfo.outputPath('tablet-settings.png') });
    await page.keyboard.press('Escape');
    await expect(page.locator('.settings-dialog')).toBeHidden();
    await expect(page.locator('#paused-layer')).toBeVisible();
  });
}
