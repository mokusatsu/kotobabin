import { keyboardRevealControl, keyboardMenuTo, assertViewportFits } from './keyboard';
import { expect, test, type Page } from '@playwright/test';
import { beginMain, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
async function savedAchievements(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kotobabin', 4);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ unlocks: Record<string, unknown>; rewards: Record<string, unknown>; targetId: string | null; revealedIds: string[]; measuredProgress: { totalCompleted: number }; equipped: { titleId: string | null } }>((resolve, reject) => {
        const transaction = database.transaction('profile', 'readonly');
        const request = transaction.objectStore('profile').get('current');
        transaction.oncomplete = () => resolve(request.result.extensions.achievements);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  });
}

test('practice earns stamps without opening the handbook or choosing a goal and titles require explicit equipment', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('犬');
  await keyboardRevealControl(page, page.locator('[data-action="practice-word"][data-word-id="living_r02"]'));
  await page.locator('[data-action="practice-word"][data-word-id="living_r02"]').click();
  await confirmHalfWidthInput(page);
  for (let completion = 0; completion < 5; completion++) {
    await typeCurrentGuide(page);
    if (completion < 4) await page.locator('[data-action="repeat-word"]').click();
  }
  const required = ['A01', 'A03', 'A04', 'F01', 'F02', 'F05'];
  await expect.poll(async () => { const saved = await savedAchievements(page); return required.every(id => !!saved.unlocks[id]); }).toBe(true);
  const before = await savedAchievements(page);
  expect(before.targetId).toBeNull(); expect(before.equipped.titleId).toBeNull();
  for (const id of required) {
    expect(before.rewards[`stamp_${id.toLowerCase()}`]).toBeDefined();
    expect(before.rewards[`title_${id.toLowerCase()}`]).toBeDefined();
  }
  await page.locator('[data-action="practice-end"]').click();
  await expect(page.locator('.home-intro')).toBeVisible();
  await expect(page.locator('#practice-awards-summary')).toContainText('枚獲得');
  await page.locator('nav [data-action="handbook"]').click();
  await expect(page.locator('#handbook-count')).toContainText('/72');
  await expect(page.locator('article[data-achievement-id="A01"]')).toHaveAttribute('data-state', 'earned');
  await page.screenshot({ path: testInfo.outputPath('handbook-earned-stamps.png'), fullPage: false });
  await keyboardRevealControl(page, page.locator('[data-action="handbook-tab"][data-tab="rewards"]'));
  await page.locator('[data-action="handbook-tab"][data-tab="rewards"]').click();
  const title = page.locator('select[data-equip-slot="titleId"]');
  await expect(title).toHaveValue('');
  await keyboardRevealControl(page, title);
  await title.selectOption('title_a01');
  await expect.poll(async () => (await savedAchievements(page)).equipped.titleId).toBe('title_a01');
  const after = await savedAchievements(page);
  // The city keeps advancing while the handbook is open; existing ownership must not change.
  for (const [id, unlock] of Object.entries(before.unlocks)) expect(after.unlocks[id]).toEqual(unlock);
  for (const [id, reward] of Object.entries(before.rewards)) expect(after.rewards[id]).toEqual(reward);
  expect(Object.keys(after.unlocks).filter(id => !before.unlocks[id]).every(id => ['I01', 'J01'].includes(id))).toBe(true);
  await page.locator('[data-action="handbook-back"]').click();
  await page.locator('nav [data-action="handbook"]').click();
  await keyboardRevealControl(page, page.locator('[data-action="handbook-tab"][data-tab="rewards"]'));
  await page.locator('[data-action="handbook-tab"][data-tab="rewards"]').click();
  await keyboardRevealControl(page, page.locator('select[data-equip-slot="titleId"]'));
  await expect(page.locator('select[data-equip-slot="titleId"]')).toHaveValue('title_a01');
});

test('a normal delivery achievement stays provisional until completion and becomes ineligible after rescue', async ({ page }, testInfo) => {
  await page.clock.install();
  await beginMain(page);
  await typeCurrentGuide(page); await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await page.locator('#paused-layer [data-action="handbook"]').click();
  await keyboardRevealControl(page, page.locator('[data-action="achievement-family"][data-family-id="B"]'));
  await page.locator('[data-action="achievement-family"][data-family-id="B"]').click();
  const card = page.locator('article[data-achievement-id="B01"]');
  await expect(card).toHaveAttribute('data-state', 'provisional');
  await keyboardRevealControl(page, card.locator('[data-action="achievement-select"]'));
  await card.locator('[data-action="achievement-select"]').click();
  await keyboardRevealControl(page, page.locator('[data-action="achievement-target"][data-achievement-id="B01"]'));
  await page.locator('[data-action="achievement-target"][data-achievement-id="B01"]').click();
  await page.screenshot({ path: testInfo.outputPath('normal-achievement-provisional.png'), fullPage: false });
  await page.locator('[data-action="handbook-back"]').click();
  await expect(page.locator('#paused-layer')).toBeVisible();
  await page.locator('#paused-layer [data-action="skip"]').click();
  await page.locator('[data-action="confirm-skip"]').click();
  await page.locator('#paused-layer [data-action="handbook"]').click();
  await keyboardRevealControl(page, page.locator('[data-action="achievement-family"][data-family-id="B"]'));
  await page.locator('[data-action="achievement-family"][data-family-id="B"]').click();
  await expect(page.locator('article[data-achievement-id="B01"]')).toHaveAttribute('data-state', 'ineligible');
  await page.screenshot({ path: testInfo.outputPath('normal-achievement-ineligible.png'), fullPage: false });
  await page.locator('[data-action="handbook-back"]').click();
  await page.locator('#paused-layer [data-action="resume"]').click();
  await page.clock.runFor(90000);
  await expect(page.locator('.result-page')).toBeVisible();
  await expect.poll(async () => !!(await savedAchievements(page)).unlocks.A05).toBe(true);
  const saved = await savedAchievements(page);
  expect(saved.unlocks.A01).toBeDefined(); expect(saved.unlocks.A02).toBeDefined(); expect(saved.unlocks.B01).toBeUndefined();
});

test('revealing a hidden condition changes its display without granting progress or rewards', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.goto('/');
  await keyboardMenuTo(page, 'handbook');
  const family = page.locator('[data-action="achievement-family"][data-family-id="B"]');
  await keyboardRevealControl(page, family); await family.click();
  const card = page.locator('article[data-achievement-id="B05"]');
  const select = card.locator('[data-action="achievement-select"]');
  await keyboardRevealControl(page, select);
  await expect(card).toContainText('小さく送ったあとに');
  await expect(card).not.toContainText('荷物2個の手動配達の後');
  await select.click();
  const reveal = page.locator('[data-action="achievement-reveal"][data-achievement-id="B05"]');
  await keyboardRevealControl(page, reveal);
  const before = await savedAchievements(page);
  await reveal.click();
  const condition = page.locator('#achievement-detail .achievement-detail-condition');
  await keyboardRevealControl(page, condition);
  await expect(condition).toBeVisible();
  await expect(condition).toContainText('荷物2個の手動配達の後');
  await expect.poll(async () => (await savedAchievements(page)).revealedIds.includes('B05')).toBe(true);
  const after = await savedAchievements(page);
  expect(after.unlocks).toEqual(before.unlocks); expect(after.rewards).toEqual(before.rewards);
  expect(after.measuredProgress.totalCompleted).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('hidden-condition-revealed.png'), fullPage: false });
  await page.locator('[data-action="handbook-back"]').click();
  await keyboardMenuTo(page, 'handbook');
  await keyboardRevealControl(page, select);
  await expect(card).toContainText('荷物2個の手動配達の後');
});

test('five real qualified practice words keep F04 card compact and every word detail reachable on the target iPad', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.goto('/');
  await keyboardMenuTo(page, 'settings');
  const scale = page.locator('.settings-dialog input[name="fontScale"][value="150"]');
  await keyboardRevealControl(page, scale); await scale.check(); await page.keyboard.press('Escape');
  await keyboardMenuTo(page, 'catalogue');
  for (const [selector, value] of [['#catalogue-set', 'kotobabin-ja-relaxed-v2'], ['#catalogue-topic', 'living']]) {
    const filter = page.locator(selector); await keyboardRevealControl(page, filter); await filter.selectOption(value);
  }
  const start = page.locator('[data-action="practice-word"][data-word-id="living_r01"]');
  await keyboardRevealControl(page, start); await start.click(); await confirmHalfWidthInput(page);
  const names: string[] = [];
  for (let word = 0; word < 5; word++) {
    names.push((await page.locator('#prompt-word').innerText()).trim());
    for (let completion = 0; completion < 3; completion++) {
      await typeCurrentGuide(page);
      if (completion < 2) await page.locator('[data-action="repeat-word"]').click();
    }
    await expect(page.locator('#practice-progress')).toContainText('3/3');
    if (word < 4) await page.locator('[data-action="next-practice-word"]').click();
  }
  expect(new Set(names).size).toBe(5);
  await expect.poll(async () => !!(await savedAchievements(page)).unlocks.F04).toBe(true);
  await page.locator('[data-action="practice-end"]').click();
  await keyboardMenuTo(page, 'handbook');
  const family = page.locator('[data-action="achievement-family"][data-family-id="F"]');
  await keyboardRevealControl(page, family); await family.click();
  const card = page.locator('article[data-achievement-id="F04"]');
  const select = card.locator('[data-action="achievement-select"]');
  await keyboardRevealControl(page, select);
  await expect(card).toHaveAttribute('data-state', 'earned');
  await expect(card.locator('.achievement-progress > div')).toHaveCount(2);
  await expect(card).toContainText(/ほか\d+項目は詳細へ/);
  await assertViewportFits(page);
  await page.screenshot({ path: testInfo.outputPath('f04-qualified-card-150.png') });
  await select.click();
  const lines = page.locator('#achievement-detail .achievement-progress > div');
  expect(await lines.count()).toBeGreaterThan(2);
  for (const name of names) {
    const line = lines.filter({ hasText: `${name}：` });
    await keyboardRevealControl(page, line); await expect(line).toBeVisible();
    await expect(line).toContainText('3/3回');
    await assertViewportFits(page);
  }
  await page.screenshot({ path: testInfo.outputPath('f04-qualified-detail-150.png') });
});
