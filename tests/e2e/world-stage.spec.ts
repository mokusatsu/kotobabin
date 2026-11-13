import { expect, test, type Locator, type Page } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from './keyboard';

async function wholeMap(page: Page, map: Locator) {
  await expect(map).toBeVisible();
  await expect(async () => {
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(150);
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual((await page.viewportSize())!.height + 1);
  await assertViewportFits(page);
  }).toPass({ timeout: 5000 });
}

for (const height of [720, 820]) for (const scale of [100, 125, 150]) {
  test(`world and entire district remain playable with the keyboard at1180x${height} font${scale}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1180, height }); await page.goto('/');
    await keyboardMenuTo(page, 'settings');
    const font = page.locator(`.settings-dialog input[name="fontScale"][value="${scale}"]`);
    await keyboardRevealControl(page, font); await tabTo(page, font); await page.keyboard.press('Space');
    await expect(font).toBeChecked(); await page.keyboard.press('Escape');
    await expect(page.locator('.world-stage.game-stage')).toBeVisible();
    await expect(page.locator('.world-stage [data-ipad-controls]')).toHaveCount(0);
    expect(await page.locator('#app').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(16 * scale / 100);
    const world = page.locator('.world-stage .town-map'); await wholeMap(page, world);
    const ids = ['residential', 'market', 'workshop', 'park', 'harbor', 'station'];
    for (const id of ids) {
      const district = world.locator(`[data-action="city-district"][data-district-id="${id}"]`);
      await expect(district).toBeVisible(); await tabTo(page, district);
    }
    const selected = world.locator('[data-action="city-district"][data-district-id="residential"]');
    await tabTo(page, selected); await page.keyboard.press('Enter');
    const district = page.locator('.district-map[data-district-id="residential"]');
    await expect(district).toBeVisible(); await wholeMap(page, district.locator('[data-map-bounds="district"]'));
    await expect(district.locator('[data-visual-feature="plan"]')).toBeVisible();
    for (const feature of ['plan', 'shops', 'crews', 'railway', 'packaging', 'research', 'synergies']) {
      const control = district.locator(`[data-action="district-feature"][data-feature="${feature}"]`);
      await tabTo(page, control); await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await wholeMap(page, district.locator('[data-map-bounds="district"]'));
    }
    await page.screenshot({ path: testInfo.outputPath(`district-stage-${scale}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.locator('.world-stage.game-stage')).toBeVisible();
    await wholeMap(page, page.locator('.world-stage .town-map'));
  });
}
