import { expect, test, type Page } from '@playwright/test';
import { beginMain, typeCurrentGuide } from './helpers';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from './keyboard';

type SavedAwards = { unlocks: Record<string, unknown>; rewards: Record<string, unknown> };
async function awards(page: Page): Promise<SavedAwards> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('kotobabin', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      return await new Promise<SavedAwards>((resolve, reject) => {
        const tx = db.transaction('profile', 'readonly'); const r = tx.objectStore('profile').get('current');
        tx.oncomplete = () => resolve(r.result.extensions.achievements); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
async function prepare(page: Page, height: number, scale: number, reducedMotion = false) {
  await page.setViewportSize({ width: 1180, height }); await page.clock.install(); await page.goto('/');
  await keyboardMenuTo(page, 'settings');
  const font = page.locator(`.settings-dialog input[name="fontScale"][value="${scale}"]`);
  await keyboardRevealControl(page, font); await tabTo(page, font); await page.keyboard.press('Space');
  if (reducedMotion) {
    const reduce = page.locator('.settings-dialog input[name="reducedMotion"]');
    await keyboardRevealControl(page, reduce); await tabTo(page, reduce); await page.keyboard.press('Space'); await expect(reduce).toBeChecked();
  }
  await page.keyboard.press('Escape'); await beginMain(page, { fromHome: true });
  const before = await awards(page);
  // The awards come from real native completions and deliveries, never a fabricated award fixture.
  for (let word = 0; word < 6; word++) await typeCurrentGuide(page);
  await page.keyboard.press('Space'); await page.clock.runFor(90001);
  const stage = page.locator('.result-stage'); await expect(stage).toHaveAttribute('data-result-phase', 'score');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  const saved = await awards(page);
  const ids = Object.keys(saved.unlocks).filter(id => !before.unlocks[id]);
  expect(ids.length).toBeGreaterThan(2);
  await expect(stage.locator('.result-stage-new-count')).toContainText(`${ids.length}枚`);
  return { stage, ids, saved };
}

for (const height of [720, 820]) for (const scale of [100, 125, 150]) {
  test(`actual earned stamps open individually once in a keyboard result stage1180x${height} font${scale}`, async ({ page }, testInfo) => {
    const { stage, ids, saved } = await prepare(page, height, scale);
    await assertViewportFits(page); await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
    const seen: string[] = [];
    for (let index = 0; index < ids.length; index++) {
      await expect(stage).toHaveAttribute('data-result-phase', 'sealed'); await assertViewportFits(page);
      // Escape opens this envelope immediately; it must not skip its actual award.
      await page.keyboard.press('Escape'); await expect(stage).toHaveAttribute('data-result-phase', 'reveal');
      const current = stage.locator('[data-result-award]'); const id = (await current.getAttribute('data-result-award'))!;
      expect(ids).toContain(id); expect(seen).not.toContain(id); seen.push(id);
      await expect(current.locator('.result-stage-award-condition')).not.toHaveText('');
      await expect(current).toContainText('切手を獲得'); await expect(current).toContainText('称号');
      await assertViewportFits(page);
      if (index === 0) await page.screenshot({ path: testInfo.outputPath('first-actual-award.png') });
      await page.keyboard.press('Space');
    }
    await expect(stage).toHaveAttribute('data-result-phase', 'summary'); expect(seen.sort()).toEqual(ids.sort());
    await expect(stage.locator('.result-stage-collection-count')).toHaveText(`${ids.length}枚`);
    expect(await awards(page)).toMatchObject({ unlocks: saved.unlocks, rewards: saved.rewards });
    await assertViewportFits(page);
    await tabTo(page, stage.locator('[data-result-action="handbook"]')); await page.keyboard.press('Enter');
    await tabTo(page, page.locator('[data-action="handbook-back"]')); await page.keyboard.press('Enter');
    await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'summary');
    expect(await awards(page)).toMatchObject({ unlocks: saved.unlocks, rewards: saved.rewards });
  });
}

for (const height of [720, 820]) {
  test(`reduced motion and native S retain all actual earned stamps1180x${height}`, async ({ page }) => {
    const { stage, ids, saved } = await prepare(page, height, 150, true);
    await page.keyboard.press('Enter'); await expect(stage).toHaveAttribute('data-result-phase', 'reveal');
    await expect(stage).toHaveAttribute('data-animating', 'false');
    expect(ids).toContain(await stage.locator('[data-result-award]').getAttribute('data-result-award'));
    await assertViewportFits(page); await page.keyboard.press('s');
    await expect(stage).toHaveAttribute('data-result-phase', 'summary');
    await expect(stage.locator('.result-stage-collection-count')).toHaveText(`${ids.length}枚`);
    expect(await awards(page)).toMatchObject({ unlocks: saved.unlocks, rewards: saved.rewards });
    await assertViewportFits(page);
  });
}
