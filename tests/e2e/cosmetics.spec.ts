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
for (const height of [720, 820] as const) for (const font of [100, 125, 150] as const) test(`nonempty four-choice gallery and collection pages fit at1180x${height} ${font}% with keyboard`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1180, height });
  await seed(page, font);
  await assertViewportFits(page);
  expect(await page.locator('.cosmetic-home-gallery').evaluate(element => { const g = element.getBoundingClientRect(); const d = document.querySelector('.world-command-dock')!.getBoundingClientRect(); const m = document.querySelector('.home-city-slot')!.getBoundingClientRect(); return g.bottom <= d.top && g.bottom <= m.top; })).toBe(true);
  const before = await equipped(page);
  expect(before.homeBackgroundId).toBe('reward_total_36_background'); expect(before.ornamentId).toBe('reward_total_08_ornament');
  await page.screenshot({ path: info.outputPath(`home-1180x${height}-${font}.png`) });
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
  await page.screenshot({ path: info.outputPath(`collection-1180x${height}-${font}.png`) });
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

for (const height of [720, 820] as const) for (const font of [100, 125, 150] as const) test(`four-choice gallery survives readonly reload and keyboard ownership handoff at1180x${height} ${font}%`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height });
  await seed(page, font);
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  const before = await equipped(page);
  for (const slot of ['titleId', 'frameId', 'ornamentId', 'homeBackgroundId']) expect(before[slot]).toBeTruthy();
  await page.reload();
  const warning = page.locator('#ownership-status');
  await expect(warning).toHaveAttribute('data-ownership', 'readonly');
  await expect(warning).toBeVisible();
  expect(await equipped(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath(`readonly-gallery-1180x${height}-${font}.png`) });
  console.log('GALLERY_READONLY_LAYOUT', JSON.stringify(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentHeight: document.documentElement.scrollHeight,
    parts: ['.site-header', '#ownership-status', '.cosmetic-home-gallery', '.home-city-balance', '.world-command-dock', '.home-city-slot', '.site-footer'].map(selector => ({ selector, rectangle: document.querySelector(selector)?.getBoundingClientRect().toJSON() })) }))));
  await assertViewportFits(page);
  await assertHomeHudSeparated(page);
  const takeover = warning.locator('[data-action="takeover"]');
  await tabTo(page, takeover); await page.keyboard.press('Enter');
  await expect(warning).toHaveAttribute('data-ownership', 'owner');
  await expect(warning).toBeHidden();
  expect(await equipped(page)).toEqual(before);
  await expect(page.locator('.cosmetic-home-gallery')).toBeVisible();
  await assertViewportFits(page);
  await assertHomeHudSeparated(page);
});

async function assertHomeHudSeparated(page: Page) {
  const overlaps = await page.evaluate(() => {
    const warning = document.querySelector('#ownership-status')!.getBoundingClientRect();
    const balance = document.querySelector('.home-city-balance')!.getBoundingClientRect();
    const dock = document.querySelector('.world-command-dock')!.getBoundingClientRect();
    const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
    const help = document.querySelector('.world-map-help')!.getBoundingClientRect();
    const labels = [...document.querySelectorAll('.world-stage .map-label')].map(item => item.getBoundingClientRect());
    const overlaps = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    return { warningBalance: overlaps(warning, balance), warningLabels: labels.some(rect => overlaps(warning, rect)), balanceLabels: labels.some(rect => overlaps(balance, rect)), dockFooter: overlaps(dock, footer), helpLabels: labels.some(rect => overlaps(help, rect)) };
  });
  expect(overlaps).toEqual({ warningBalance: false, warningLabels: false, balanceLabels: false, dockFooter: false, helpLabels: false });
}


for (const height of [720, 820] as const) for (const font of [100, 125, 150] as const) for (const owned of [false, true]) test(`postcard ownership stays beside the visible artwork at1180x${height} ${font}% owned${owned}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height });
  // This fixture exercises the gallery; it does not prove normal economic earning of all rewards.
  await seed(page, font, owned);
  const before = await equipped(page);
  await keyboardMenuTo(page, 'handbook');
  const tab = page.locator('[data-action="handbook-tab"][data-tab="rewards"]');
  await keyboardRevealControl(page, tab); await tabTo(page, tab); await page.keyboard.press('Enter');
  await preview(page, 'reward_family_a_postcard');
  const artwork = page.locator('[data-preview-reward] .reward-view-art');
  const picture = artwork.locator('[data-reward-asset="postcard_a"]');
  await keyboardRevealControl(page, picture);
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  const context = artwork.locator('.reward-art-context');
  await expect(context).toBeVisible();
  await expect(context).toHaveText(`郵便局の絵葉書 · ${owned ? '獲得済み' : '未獲得のプレビュー'}`);
  expect(await context.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(16 * font / 100, 1);
  const geometry = await artwork.evaluate(element => {
    const context = element.querySelector('.reward-art-context')!.getBoundingClientRect();
    const art = element.querySelector('.reward-framed-content, .reward-postcard')!.getBoundingClientRect();
    return { context: context.toJSON(), art: art.toJSON(), separated: context.bottom <= art.top };
  });
  expect(geometry.separated, JSON.stringify(geometry)).toBe(true);
  await assertViewportFits(page);
  expect(await equipped(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath(`postcard-context-${height}-${font}-${owned}.png`) });
  await keyboardWalkPanels(page);
});
