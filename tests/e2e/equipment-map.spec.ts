import { expect, test, type Page } from '@playwright/test';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from './keyboard';

test.use({ viewport: { width: 1180, height: 720 } });
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('kotobabin', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<{ city: unknown; progress: unknown }>((resolve, reject) => {
      const tx = db.transaction('profile', 'readonly'); const r = tx.objectStore('profile').get('current');
      tx.oncomplete = () => resolve({ city: r.result.extensions.city, progress: r.result.progress }); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
}
async function fixture(page: Page) {
  await page.goto('/'); await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.evaluate(async () => {
    const source = '/tests/e2e/fixtures/mature-city.ts'; const { matureCityFixture } = await import(source);
    const city = matureCityFixture(Date.now());
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('kotobabin', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('profile', 'readwrite'); const store = tx.objectStore('profile'); const r = store.get('current');
      r.onsuccess = () => { const d = r.result; d.extensions.city = city; d.metadata.ownerTabId = null; d.metadata.writeEpoch++; d.metadata.revision++; store.put(d, 'current'); };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  await page.reload(); await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await keyboardMenuTo(page, 'settings');
  const font = page.locator('.settings-dialog input[name="fontScale"][value="150"]');
  await keyboardRevealControl(page, font); await tabTo(page, font); await page.keyboard.press('Space'); await page.keyboard.press('Escape');
  const district = page.locator('.world-stage .town-map [data-action="city-district"][data-district-id="residential"]');
  await tabTo(page, district); await page.keyboard.press('Enter');
  await expect(page.locator('.district-map[data-district-id="residential"]')).toBeVisible();
}
async function selectFeature(page: Page, feature: string) {
  const control = page.locator(`.district-map[data-district-id="residential"] [data-action="district-feature"][data-feature="${feature}"]`);
  await tabTo(page, control); await page.keyboard.press('Enter'); await expect(control).toHaveAttribute('aria-pressed', 'true');
  await assertViewportFits(page);
}
async function activate(page: Page, selector: string) {
  const button = page.locator(selector); await expect(button).toBeEnabled(); await tabTo(page, button); await page.keyboard.press('Enter');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
}
async function conserved(page: Page, before: Awaited<ReturnType<typeof saved>>, count: number) {
  const after = await saved(page); expect(after.progress).toEqual(before.progress);
  const report = await page.evaluate(async ({ before, after, count }) => {
    const source = '/src/economy/index.ts'; const { CityEconomy, decodeCityState, executeCityCommand } = await import(source);
    const start = decodeCityState(before); const end = decodeCityState(after);
    const commands = Object.entries(end.commandLedger).filter(([id]) => !start.commandLedger[id]).map(([,payload]) => JSON.parse(payload as string));
    const expected = new CityEconomy(start);
    for (const command of commands) executeCityCommand(expected, command);
    expected.advanceTo(end.clockMs);
    const fields = (s: typeof end) => ({ coins: String(s.coinsMicro), blueprints: s.blueprints, packaging: s.packagingLevel,
      generated: String(s.generatedMicro), arrived: String(s.arrivedMicro), research: s.research, synergies: s.synergies,
      districts: Object.fromEntries(Object.entries(s.districts).map(([id, d]) => { const x = d as typeof end.districts.residential; return [id, { stock: String(x.stockMicro), reserved: String(x.plan?.reservedMicro ?? 0n), shops: x.shops, crews: x.crews, railway: x.railway }]; })) });
    return { count: commands.length, expectedCount: count, actual: fields(end), expected: fields(expected.state) };
  }, { before: before.city, after: after.city, count });
  expect(report.count).toBe(report.expectedCount); expect(report.actual).toEqual(report.expected);
  await assertViewportFits(page);
}

for (const item of [{ kind: 'packaging', from: 7, to: 8 }, { kind: 'crews', from: 10, to: 11 }, { kind: 'shops', from: 7, to: 8 }]) {
  test(`native ${item.kind} purchase beyond sprite caps changes actual map geometry and persists one atomic command`, async ({ page }) => {
    await fixture(page); await selectFeature(page, item.kind);
    await expect(page.locator('#purchase-current')).toHaveText(String(item.from));
    const rect = page.locator(`.district-map[data-district-id="residential"] [data-capacity-feature="${item.kind}"] .dm-rack-filled`);
    await expect(rect).toBeVisible();
    const width = Number(await rect.getAttribute('width')); const renderedWidth = (await rect.boundingBox())!.width; const before = await saved(page);
    await activate(page, '[data-action="city-purchase"]'); await expect(page.locator('#purchase-current')).toHaveText(String(item.to));
    await expect.poll(async () => Number(await rect.getAttribute('width'))).toBeGreaterThan(width);
    await expect.poll(async () => (await rect.boundingBox())!.width).toBeGreaterThan(renderedWidth);
    await conserved(page, before, 1);
  });
}

test('native railway purchase replaces the selected district route with tracks and train while conserving stock', async ({ page }) => {
  await fixture(page); await selectFeature(page, 'railway');
  const visual = page.locator('.district-map[data-district-id="residential"] [data-visual-feature="railway"]');
  await expect(visual).toHaveAttribute('data-owned', 'false'); const before = await saved(page);
  await activate(page, '[data-action="city-buy-railway"]'); await expect(visual).toHaveAttribute('data-owned', 'true');
  await expect(visual.locator('.dm-train')).toBeVisible(); await conserved(page, before, 1);
  await expect(page.locator('[data-action="city-buy-railway"]')).toBeDisabled();
});

test('native synergy purchase adds the actual link to the map and cannot be purchased twice', async ({ page }) => {
  await fixture(page); await selectFeature(page, 'synergies');
  const visual = page.locator('.district-map[data-district-id="residential"] [data-synergy-id="joint_delivery"]');
  await expect(visual).toHaveAttribute('data-owned', 'false'); const before = await saved(page);
  await activate(page, '[data-action="city-buy-synergy"][data-synergy-id="joint_delivery"]');
  await expect(visual).toHaveAttribute('data-owned', 'true'); await expect(visual.locator('.dm-active-link')).toBeVisible();
  await conserved(page, before, 1); await expect(page.locator('[data-action="city-buy-synergy"]')).toBeDisabled();
  const committed = await saved(page); const geometry = await visual.innerHTML(); await page.keyboard.press('Enter');
  expect(await visual.innerHTML()).toBe(geometry); await conserved(page, committed, 0);
});

test('successive native research ranks each change map geometry and an unaffordable rank changes nothing', async ({ page }) => {
  await fixture(page); await selectFeature(page, 'research');
  const visual = page.locator('.district-map[data-district-id="residential"] [data-visual-feature="research"]');
  for (let rank = 1; rank <= 2; rank++) {
    const before = await saved(page); const geometry = await visual.innerHTML();
    await activate(page, '[data-action="city-buy-research"][data-research-kind="materials"]');
    await expect(visual).toHaveAttribute('data-materials', String(rank)); expect(await visual.innerHTML()).not.toBe(geometry);
    await conserved(page, before, 1);
  }
  await expect(page.locator('[data-action="city-buy-research"]')).toBeDisabled();
  const before = await saved(page); const geometry = await visual.innerHTML(); await page.keyboard.press('Enter');
  expect(await visual.innerHTML()).toBe(geometry); await conserved(page, before, 0);
});
