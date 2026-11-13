import { expect, test, type Page } from '@playwright/test';
import { keyboardRevealControl } from './keyboard';
import { beginMain, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

async function savedProfile(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kotobabin', 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ settings: { fontScale: number }; tutorialSeen: boolean; metadata: { generation: number }; progress: { totalCompleted: number; recentRounds: unknown[]; words: Record<string, unknown> } }>((resolve, reject) => {
        const transaction = database.transaction('profile', 'readonly');
        const request = transaction.objectStore('profile').get('current');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  });
}
async function openReset(page: Page, scope: 'settings' | 'records' | 'collection') {
  if (!await page.locator('.settings-dialog').isVisible()) await page.locator('nav [data-action="settings"]').click();
  const settings = page.locator('.settings-dialog');
  await keyboardRevealControl(page, settings.locator('.profile-management > summary'));
  if (await settings.locator('.profile-management').getAttribute('open') === null) await settings.locator('.profile-management > summary').click();
  await keyboardRevealControl(page, settings.locator(`[data-action="profile-reset"][data-scope="${scope}"]`));
  await settings.locator(`[data-action="profile-reset"][data-scope="${scope}"]`).click();
  const confirmation = page.locator('.profile-confirm-dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator('[data-action="cancel-profile-operation"]')).toBeFocused();
  return confirmation;
}

test('confirmed record, collection and settings resets keep their promised separate scopes', async ({ page }, testInfo) => {
  await page.clock.install();
  await beginMain(page);
  await typeCurrentGuide(page);
  await page.clock.runFor(90000);
  await expect(page.locator('.result-page')).toBeVisible();
  await expect.poll(async () => (await savedProfile(page)).progress.recentRounds.length).toBe(1);
  const before = await savedProfile(page);
  let confirmation = await openReset(page, 'records');
  await page.screenshot({ path: testInfo.outputPath('records-reset-confirmation.png'), fullPage: true });
  await page.keyboard.press('Enter'); // Cancellation is the default and must not mutate storage.
  await expect(confirmation).toBeHidden();
  expect((await savedProfile(page)).progress).toEqual(before.progress);
  confirmation = await openReset(page, 'records');
  await keyboardRevealControl(page, confirmation.locator('[data-action="confirm-profile-reset"]'));
  await confirmation.locator('[data-action="confirm-profile-reset"]').click();
  await expect(confirmation).toBeHidden();
  await expect.poll(async () => (await savedProfile(page)).progress.recentRounds.length).toBe(0);
  expect((await savedProfile(page)).progress.totalCompleted).toBe(1);
  expect((await savedProfile(page)).metadata.generation).toBeGreaterThan(before.metadata.generation);

  if (await page.locator('.settings-dialog').isVisible()) await page.locator('.settings-dialog [data-action="close-settings"]').click();
  await page.locator('nav [data-action="home"]').click();
  await page.locator('[data-action="start"]').click();
  if (await page.locator('#check-status').count()) await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  await typeCurrentGuide(page); await page.clock.runFor(90000);
  await expect.poll(async () => (await savedProfile(page)).progress.recentRounds.length).toBe(1);
  await page.locator('nav [data-action="settings"]').click();
  await keyboardRevealControl(page, page.locator('.settings-dialog input[name="fontScale"][value="150"]'));
  await page.locator('.settings-dialog input[name="fontScale"][value="150"]').check();
  await expect.poll(async () => (await savedProfile(page)).settings.fontScale).toBe(150);
  const beforeCollectionReset = await savedProfile(page);
  confirmation = await openReset(page, 'collection');
  await expect(confirmation).toContainText('自己記録と設定は残ります');
  await page.screenshot({ path: testInfo.outputPath('collection-reset-confirmation.png'), fullPage: true });
  await keyboardRevealControl(page, confirmation.locator('[data-action="confirm-profile-reset"]'));
  await confirmation.locator('[data-action="confirm-profile-reset"]').click();
  await expect(confirmation).toBeHidden();
  await expect.poll(async () => (await savedProfile(page)).progress.totalCompleted).toBe(0);
  const reset = await savedProfile(page);
  expect(reset.progress.words).toEqual({});
  expect(reset.progress.recentRounds).toEqual(beforeCollectionReset.progress.recentRounds);
  expect(reset.settings.fontScale).toBe(150);
  expect(reset.tutorialSeen).toBe(true);
  confirmation = await openReset(page, 'settings');
  await keyboardRevealControl(page, confirmation.locator('[data-action="confirm-profile-reset"]'));
  await confirmation.locator('[data-action="confirm-profile-reset"]').click();
  await expect.poll(async () => (await savedProfile(page)).settings.fontScale).toBe(100);
  expect((await savedProfile(page)).progress.recentRounds).toEqual(reset.progress.recentRounds);
  expect((await savedProfile(page)).tutorialSeen).toBe(true);
});
