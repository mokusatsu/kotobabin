import { expect, test, type Page } from '@playwright/test';
import { keyboardMenuTo, keyboardRevealControl, tabTo, assertViewportFits } from './keyboard';
import { confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

async function savedCity(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kotobabin', 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ generatedMicro: string; packagingLevel: number }>((resolve, reject) => {
        const transaction = database.transaction('profile', 'readonly');
        const request = transaction.objectStore('profile').get('current');
        transaction.oncomplete = () => resolve(request.result.extensions.city);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  });
}

async function practiceDog(page: Page) {
  await keyboardMenuTo(page, 'catalogue');
  await page.locator('#catalogue-query').fill('犬');
  await keyboardRevealControl(page, page.locator('[data-action="practice-word"][data-word-id="living_r02"]'));
  await page.locator('[data-action="practice-word"][data-word-id="living_r02"]').click();
  if (await page.locator('#check-status').count()) await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'PRACTICE');
}

test('five real practice completions build the first district and fund a packaging purchase', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto('/');
  const worldDistrict = page.locator('.world-stage .town-map [data-action="city-district"][data-district-id="residential"]');
  await tabTo(page, worldDistrict); await page.keyboard.press('Enter');
  const map = page.locator('.district-map[data-district-id="residential"]');
  await expect(map).toHaveAttribute('data-stage', '0');
  await expect(map.locator('[data-visual-feature="plan"] image[href*="city_plot_empty.webp"]')).toBeVisible();
  await expect(map.locator('.dm-construction[data-plan-target="1"]')).toBeVisible();
  await assertViewportFits(page);
  await page.keyboard.press('Escape'); await expect(page.locator('.world-stage')).toBeVisible();
  await practiceDog(page);
  for (let completion = 0; completion < 5; completion++) {
    expect(await typeCurrentGuide(page)).toBe('inu');
    if (completion < 4) await page.locator('[data-action="repeat-word"]').click();
  }
  await expect(page.locator('#score')).toHaveText('300');
  await expect.poll(async () => (await savedCity(page)).generatedMicro).toBe('30000000');
  await page.clock.runFor(8000);
  await page.locator('[data-action="practice-end"]').click();
  await keyboardMenuTo(page, 'city');
  await expect(page.locator('#district-stage')).toHaveText('1/5');
  await expect(page.locator('#district-shops')).toHaveText('1/5軒');
  await expect(map).toHaveAttribute('data-stage', '1');
  await expect(map.locator('[data-visual-feature="plan"] image[href*="city_residential_s1.webp"]')).toBeVisible();
  await expect(map.locator('[data-visual-feature="plan"] image[href*="city_plot_empty.webp"]')).toHaveCount(0);
  await expect(map.locator('[data-visual-feature="shops"]')).toHaveAttribute('data-shops', '1');
  await expect(map.locator('.dm-construction')).toHaveCount(0);
  await assertViewportFits(page);
  await page.screenshot({ path: testInfo.outputPath('city-first-building.png'), fullPage: true });
  await keyboardMenuTo(page, 'equipment');
  await expect(page.locator('#purchase-current')).toHaveText('0');
  await expect(page.locator('#purchase-after')).toHaveText('1');
  await expect(page.locator('#purchase-cost')).toHaveText('50');
  await keyboardRevealControl(page, page.locator('[data-action="city-purchase"]'));
  for (const selector of ['#purchase-current', '#purchase-after', '#purchase-cost', '#purchase-count']) await expect(page.locator(selector)).toBeVisible();
  await expect(page.locator('[data-action="city-purchase"]')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('equipment-purchase-preview.png'), fullPage: true });
  const rack = page.locator('.district-map[data-district-id="residential"] [data-capacity-feature="packaging"] .dm-rack-filled');
  const beforeWidth = Number(await rack.getAttribute('width'));
  await page.locator('[data-action="city-purchase"]').click();
  await expect(page.locator('#purchase-current')).toHaveText('1');
  await expect.poll(async () => (await savedCity(page)).packagingLevel).toBe(1);
  await expect(page.locator('.district-map[data-district-id="residential"] [data-visual-feature="packaging"]')).toHaveAttribute('data-level', '1');
  await expect(page.locator('.district-map[data-district-id="residential"] .dm-parcel')).toHaveCount(1);
  await expect.poll(async () => Number(await rack.getAttribute('width'))).toBeGreaterThan(beforeWidth);
  await assertViewportFits(page);
  const before = BigInt((await savedCity(page)).generatedMicro);
  await practiceDog(page);
  await typeCurrentGuide(page);
  await expect(page.locator('#score')).toHaveText('30');
  await expect.poll(async () => BigInt((await savedCity(page)).generatedMicro) - before).toBe(3750000n);
  await page.locator('[data-action="practice-end"]').click();
  await page.reload();
  await expect(page.locator('.home-intro')).toBeVisible();
  expect((await savedCity(page)).packagingLevel).toBe(1);
  expect(BigInt((await savedCity(page)).generatedMicro) - before).toBe(3750000n);
});
