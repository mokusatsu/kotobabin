import { expect, test, type Page } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo, keyboardWalkPanels } from './keyboard';
import catalog from '../../spec/initial/data/achievement_catalog.json' with { type: 'json' };

test.use({ viewport: { width: 1180, height: 820 } });
async function seed(page: Page, font: 100 | 125 | 150, earned = true) {
  await page.route('**/src/main.ts', route => route.abort());
  await page.goto('/');
  await page.evaluate(async ({ font, earned }) => {
    const source = '/tests/e2e/fixtures/cosmetics.ts'; const { cosmeticsFixture } = await import(source);
    let profile;
    if (earned) profile = cosmeticsFixture(font);
    else { const source = '/src/profile/repository.ts'; const { createProfileDocument } = await import(source); profile = createProfileDocument(); profile.settings.fontScale = font; profile.tutorialSeen = true; }
    await new Promise<void>((resolve, reject) => {
      const q = indexedDB.open('kotobabin', 4);
      q.onupgradeneeded = () => q.result.createObjectStore('profile');
      q.onerror = () => reject(q.error);
      q.onsuccess = () => { const db = q.result; const tx = db.transaction('profile', 'readwrite'); tx.objectStore('profile').put(profile, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
  }, { font, earned });
  await page.unroute('**/src/main.ts'); await page.reload();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
}
async function equipped(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open('kotobabin', 4); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    return await new Promise<Record<string, string | null>>((resolve, reject) => { const tx = db.transaction('profile', 'readonly'); const q = tx.objectStore('profile').get('current'); tx.oncomplete = () => { db.close(); resolve(q.result.extensions.achievements?.equipped ?? {}); }; tx.onerror = () => reject(tx.error); });
  });
}
async function preview(page: Page, id: string) {
  const picker = page.locator('#reward-view-choice'); await keyboardRevealControl(page, picker); await tabTo(page, picker);
  await page.keyboard.press('Home');
  for (let index = 0; index < catalog.rewards.findIndex(reward => reward.id === id); index++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await expect(picker).toHaveValue(id);
  const open = page.locator('[data-action="reward-preview-choice"]'); await keyboardRevealControl(page, open); await tabTo(page, open); await page.keyboard.press('Enter');
  await expect(page.locator('[data-preview-reward]')).toHaveAttribute('data-preview-reward', id);
}
for (const font of [100, 125, 150] as const) test(`nonempty four-choice gallery and collection pages fit at ${font}% with keyboard`, async ({ page }, info) => {
  test.setTimeout(120000);
  await seed(page, font);
  await assertViewportFits(page);
  expect(await page.locator('.cosmetic-home-gallery').evaluate(element => { const g = element.getBoundingClientRect(); const d = document.querySelector('.world-command-dock')!.getBoundingClientRect(); const m = document.querySelector('.home-city-slot')!.getBoundingClientRect(); return g.bottom <= d.top && g.bottom <= m.top; })).toBe(true);
  const before = await equipped(page);
  expect(before.homeBackgroundId).toBe('reward_total_36_background'); expect(before.ornamentId).toBe('reward_total_08_ornament');
  await page.screenshot({ path: info.outputPath(`home-${font}.png`) });
  await keyboardMenuTo(page, 'handbook');
  expect(await page.locator('[data-cosmetic-gallery="handbook"] [data-reward-asset="reward_evening_panel"]').count()).toBe(0);
  const tab = page.locator('[data-action="handbook-tab"][data-tab="rewards"]'); await keyboardRevealControl(page, tab); await tabTo(page, tab); await page.keyboard.press('Enter');
  await preview(page, 'reward_first_collection_board');
  await expect(page.locator('.reward-album-navigation').first()).toContainText('1 / 8ページ');
  await expect(page.locator('[data-family-board="A"] .reward-stamp-select')).toHaveCount(6);
  await expect(page.locator('[data-family-board="A"]')).toHaveAttribute('data-family-foil', 'true');
  await keyboardWalkPanels(page);
  const close = page.locator('[data-action="reward-close"]').last(); await keyboardRevealControl(page, close); await tabTo(page, close); await page.keyboard.press('Enter');
  await preview(page, 'reward_complete_72_board');
  await expect(page.locator('.reward-album-navigation').first()).toContainText('1 / 12ページ');
  const next = page.locator('[data-action="reward-page"][data-reward-page="1"]').first(); await keyboardRevealControl(page, next); await tabTo(page, next); await page.keyboard.press('Enter');
  await expect(page.locator('[data-family-board="B"] .reward-stamp-select')).toHaveCount(6);
  await keyboardWalkPanels(page);
  expect(await equipped(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath(`collection-${font}.png`) });
});

test('unowned preview does not equip and viewing objects never require equipment', async ({ page }) => {
  await seed(page, 150, false); await keyboardMenuTo(page, 'handbook');
  const tab = page.locator('[data-action="handbook-tab"][data-tab="rewards"]'); await keyboardRevealControl(page, tab); await tabTo(page, tab); await page.keyboard.press('Enter');
  const before = await equipped(page);
  await preview(page, 'reward_total_08_frame');
  await expect(page.locator('[data-preview-reward]')).toContainText('未獲得のプレビュー');
  await expect(page.locator('[data-action="reward-equip"]')).toHaveCount(0);
  expect(await equipped(page)).toEqual(before);
  await keyboardWalkPanels(page);
});
