import { expect, test } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo, keyboardWalkPanels, tabTo } from './keyboard';

for (const height of [720, 820]) for (const scale of [100, 125, 150]) {
  test(`MM9C3J-A keyboard menu and screen panels fit1180x${height} at${scale}percent`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1180, height });
    await page.goto('/');
    if (scale !== 100) {
      await keyboardMenuTo(page, 'settings');
      const setting = page.locator(`.settings-dialog input[name="fontScale"][value="${scale}"]`);
      for (let panel = 0; panel < 30 && !await setting.isVisible(); panel++) {
        const next = page.locator('.settings-dialog [data-ipad-next]');
        await expect(next).toBeEnabled();
        await tabTo(page, next); await page.keyboard.press('Enter');
      }
      await tabTo(page, setting); await page.keyboard.press('Space');
      await expect(setting).toBeChecked();
      await assertViewportFits(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('.settings-dialog')).toBeHidden();
    }
    await assertViewportFits(page);
    for (const [action, selector] of [
      ['catalogue', '.catalogue-page'], ['handbook', '.handbook-page'], ['city', '.city-page'],
      ['equipment', '.equipment-page'], ['settings', '.settings-dialog'], ['help', '.help-dialog'],
    ]) {
      await keyboardMenuTo(page, action);
      await expect(page.locator(selector)).toBeVisible();
      await keyboardWalkPanels(page);
      await page.screenshot({ path: testInfo.outputPath(`${action}-${scale}.png`) });
      await page.keyboard.press('Escape');
      await expect(page.locator('.home-intro')).toBeVisible();
      await assertViewportFits(page);
    }
  });
}
