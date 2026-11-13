import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assertViewportFits, tabTo } from './keyboard';

async function activate(page: Page, selector: string) {
  const control = page.locator(selector); await tabTo(page, control); await page.keyboard.press('Enter');
}
async function edit(page: Page, id: string, value: string) {
  await tabTo(page, page.locator(`#${id}`)); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value); await page.keyboard.press('Tab');
}
async function choose(page: Page, id: string, position: number) {
  await tabTo(page, page.locator(`#${id}`)); await page.keyboard.press('Home');
  for (let step = 0; step < position; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
}
async function storedProfile(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open('kotobabin', 4); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    try { return await new Promise<string>((resolve, reject) => { const tx = db.transaction('profile', 'readonly'); const q = tx.objectStore('profile').get('current'); tx.oncomplete = () => resolve(JSON.stringify(q.result)); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  });
}
test.use({ viewport: { width: 1180, height: 720 } });
test('development comparisons use native input and engine facts without opening or changing normal storage', async ({ page, context }, info) => {
  await page.goto('/'); await expect(page.locator('[data-action="start"]')).toBeVisible(); await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved'); await page.close();
  const dev = await context.newPage();
  await dev.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    (window as Window & { devDatabaseOpens: number }).devDatabaseOpens = 0;
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => { (window as Window & { devDatabaseOpens: number }).devDatabaseOpens++; return open(...args); }) as IDBFactory['open'];
  });
  await dev.goto('/dev.html'); await expect(dev.locator('#dev-stage')).toHaveAttribute('data-phase', 'PAUSED');
  expect(await dev.evaluate(() => (window as Window & { devDatabaseOpens: number }).devDatabaseOpens)).toBe(0);
  const before = await storedProfile(dev);
  await dev.evaluate(() => { (window as Window & { devDatabaseOpens: number }).devDatabaseOpens = 0; });
  await activate(dev, '[data-left-tab="rules"]');
  await edit(dev, 'dev-duration', '60000'); await edit(dev, 'dev-point', '20'); await edit(dev, 'dev-max-cargo', '3');
  await expect(dev.locator('#dev-rates')).toHaveValue('1,2,3'); await expect(dev.locator('#dev-denominator')).toHaveValue('3');
  await activate(dev, '[data-left-tab="conditions"]'); await edit(dev, 'dev-cargo', '2'); await edit(dev, 'dev-remaining', '5000'); await activate(dev, '#dev-apply');
  await expect(dev.locator('#dev-base')).toHaveText('120'); await expect(dev.locator('#dev-cargo-state')).toHaveText('2 / 3'); await expect(dev.locator('#dev-time')).toHaveText('5000');
  await activate(dev, '#dev-resume'); await expect(dev.locator('#dev-input')).toBeFocused(); await expect(dev.locator('#dev-editing')).toHaveAttribute('disabled', ''); await expect(dev.locator('#dev-cargo')).toBeDisabled();
  await dev.keyboard.type('inu'); await expect(dev.locator('#dev-score')).toHaveText('360'); await expect(dev.locator('#dev-cargo-state')).toHaveText('0 / 3');
  await dev.keyboard.press('Escape'); await expect(dev.locator('#dev-stage')).toHaveAttribute('data-phase', 'PAUSED'); await expect(dev.locator('#dev-editing')).not.toHaveAttribute('disabled', ''); await expect(dev.locator('#dev-cargo')).toBeEnabled();
  await activate(dev, '[data-right-tab="facts"]'); await activate(dev, '#dev-facts-next'); await expect(dev.locator('#dev-facts')).toContainText('DeliveryCommitted full / 荷物3 / ボーナス180');
  const downloadPromise = dev.waitForEvent('download'); await activate(dev, '#dev-export'); const download = await downloadPromise;
  const output = info.outputPath('development-comparison.json'); await download.saveAs(output); const exported = JSON.parse(await readFile(output, 'utf8'));
  expect(exported).toMatchObject({ kind: 'kotobabin-development-comparison', normalRecord: false, rules: { maxCargo: 3 }, snapshot: { score: 360 } });
  expect(await dev.evaluate(() => (window as Window & { devDatabaseOpens: number }).devDatabaseOpens)).toBe(0);
  expect(await storedProfile(dev)).toBe(before); await assertViewportFits(dev);
});

test('IME pause requires an unscored half-width check and the same seed restarts the same word order', async ({ page }) => {
  await page.goto('/dev.html'); await tabTo(page, page.locator('#dev-ime')); await page.keyboard.press('Space'); await activate(page, '#dev-apply');
  await expect(page.locator('#dev-input-check')).toBeVisible(); await expect(page.locator('#dev-resume')).toBeDisabled();
  await tabTo(page, page.locator('#dev-check-input')); await page.keyboard.type('a'); await expect(page.locator('#dev-score')).toHaveText('0'); await expect(page.locator('#dev-counts')).toHaveText('0 / 0');
  await activate(page, '#dev-resume'); await expect(page.locator('#dev-input')).toBeFocused(); await page.keyboard.type('inu'); await expect(page.locator('#dev-score')).toHaveText('30'); await page.keyboard.press('Escape');
  await tabTo(page, page.locator('#dev-ime')); await page.keyboard.press('Space');
  await choose(page, 'dev-word-mode', 1); await edit(page, 'dev-seed', '77'); await choose(page, 'dev-event', 1); await activate(page, '#dev-apply');
  const firstId = await page.locator('#dev-stage').getAttribute('data-session-id');
  const firstScore = await page.locator('#dev-score').textContent();
  await activate(page, '[data-right-tab="facts"]'); const plan = await page.locator('#dev-plan').textContent(); const sequence = await page.locator('#dev-sequence').textContent();
  await activate(page, '#dev-apply'); await expect(page.locator('#dev-stage')).not.toHaveAttribute('data-session-id', firstId!); await expect(page.locator('#dev-plan')).toHaveText(plan!); await expect(page.locator('#dev-sequence')).toHaveText(sequence!); await expect(page.locator('#dev-score')).toHaveText(firstScore!);
  await assertViewportFits(page);
});

test('custom words and deadline reproduce real score and final facts', async ({ page }) => {
  await page.goto('/dev.html'); await choose(page, 'dev-word-mode', 2);
  await edit(page, 'dev-custom-display', '新聞'); await edit(page, 'dev-custom-reading', 'しんぶん'); await edit(page, 'dev-cargo', '2'); await edit(page, 'dev-remaining', '0'); await choose(page, 'dev-event', 6); await activate(page, '#dev-apply');
  await expect(page.locator('#dev-stage')).toHaveAttribute('data-phase', 'RESULT'); await expect(page.locator('#dev-time')).toHaveText('0'); await expect(page.locator('#dev-score')).toHaveText('196'); await expect(page.locator('#dev-resume')).toBeDisabled();
  await activate(page, '[data-right-tab="facts"]'); await activate(page, '#dev-facts-next'); await expect(page.locator('#dev-facts')).toContainText('RoundFinished / 期限完走 / 得点196'); await assertViewportFits(page);
});
for (const height of [720, 820]) test(`development conditions and parameter pages fit at1180x${height} with the keyboard`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height }); await page.goto('/dev.html'); await assertViewportFits(page);
  await activate(page, '[data-left-tab="rules"]'); await assertViewportFits(page);
  await activate(page, '[data-left-tab="catalog"]'); await assertViewportFits(page); await expect(page.locator('#dev-parameters article:visible')).toHaveCount(7);
  await activate(page, '#dev-parameters-next'); await expect(page.locator('#dev-parameters article:visible')).toHaveCount(6); await expect(page.locator('#dev-parameters')).toContainText('個別開封数は制限しない'); await assertViewportFits(page);
  await activate(page, '[data-left-tab="conditions"]'); await choose(page, 'dev-word-mode', 2); await edit(page, 'dev-custom-display', 'あ'.repeat(40)); await edit(page, 'dev-custom-reading', 'か'.repeat(40)); await activate(page, '#dev-apply');
  await expect(page.locator('#dev-word-display')).toHaveText('あ'.repeat(40)); await assertViewportFits(page); await page.screenshot({ path: info.outputPath(`development-${height}.png`) });
});
