import { keyboardRevealControl } from './keyboard';
import { expect, test } from '@playwright/test';
import { beginMain, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

test('practice progress reopens from IndexedDB without replaying the last completion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  await keyboardRevealControl(page, page.locator('[data-action="practice-word"][data-word-id="living_r01"]'));
  await page.locator('[data-action="practice-word"][data-word-id="living_r01"]').click();
  await confirmHalfWidthInput(page);
  await typeCurrentGuide(page);
  await expect(page.locator('#practice-progress')).toContainText('1/3');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.locator('[data-action="practice-end"]').click();
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.locator('.home-intro')).toBeVisible();
  // A reloaded document may require explicit ownership handoff from its prior tab identity.
  if (await page.locator('#ownership-status').getAttribute('data-ownership') === 'readonly') {
    await page.locator('[data-action="takeover"]').click();
  }
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  const row = page.locator('.word-list li').filter({ has: page.locator('[data-word-id="living_r01"]') });
  await expect(row).toContainText('1 / 3');
  await keyboardRevealControl(page, row.locator('[data-action="practice-word"]'));
  await row.locator('[data-action="practice-word"]').click();
  await confirmHalfWidthInput(page);
  await expect(page.locator('#practice-progress')).toContainText('1/3');
  await typeCurrentGuide(page);
  await expect(page.locator('#practice-progress')).toContainText('2/3');
});

test('a second tab is read-only and a paused owner can reclaim control using the keyboard', async ({ page, context }, testInfo) => {
  await beginMain(page);
  const firstGuide = await typeCurrentGuide(page);
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await second.locator('[data-action="takeover"]').click();
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await expect(page.locator('#paused-layer')).toBeVisible();
  const takeover = page.locator('#paused-layer [data-action="takeover"]');
  await expect(takeover).toBeVisible();
  await page.bringToFront();
  for (let attempts = 0; attempts < 12; attempts++) {
    if (await takeover.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(takeover).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('readonly-paused-keyboard-takeover.png'), fullPage: true });
  await page.keyboard.press('Enter');
  const confirmation = page.locator('dialog[data-role="ownership-confirm"]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator('[data-action="cancel-ownership"]')).toBeFocused();
  await page.keyboard.press('Enter'); // The default cancels; the old paused round stays intact.
  await expect(confirmation).toBeHidden();
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await expect(page.locator('#paused-layer')).toBeVisible();
  await expect(page.locator('#completed-count')).toHaveText('完成 1語');
  for (let attempts = 0; attempts < 12; attempts++) {
    if (await takeover.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(takeover).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(confirmation.locator('[data-action="confirm-ownership"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership', 'owner');
  await expect(second.locator('#ownership-status')).toHaveAttribute('data-ownership', 'readonly');
  await expect(page.locator('.home-intro')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  const readSaved = () => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kotobabin', 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const document = await new Promise<{ progress: { totalCompleted: number }; extensions: { city: { generatedMicro: string } } }>((resolve, reject) => {
      const transaction = database.transaction('profile', 'readonly');
      const request = transaction.objectStore('profile').get('current');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return document;
  });
  const beforeNewRound = await readSaved();
  expect(beforeNewRound.progress.totalCompleted).toBe(1);
  expect(beforeNewRound.extensions.city.generatedMicro).toBe(String(firstGuide.length * 1000000));
  await page.locator('[data-action="start"]').click();
  if (await page.locator('#check-status').count()) await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  const newGuide = await typeCurrentGuide(page);
  await expect(page.locator('#completed-count')).toHaveText('完成 1語');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  const afterNewRound = await readSaved();
  expect(afterNewRound.progress.totalCompleted).toBe(2);
  expect(BigInt(afterNewRound.extensions.city.generatedMicro) - BigInt(beforeNewRound.extensions.city.generatedMicro))
    .toBe(BigInt(newGuide.length) * 1000000n);
  await second.close();
});
