import { expect, test } from '@playwright/test';
import { confirmHalfWidthInput } from './helpers';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl } from './keyboard';

for (const height of [720, 820]) for (const scale of [100, 125, 150]) {
  test(`MM9C3J-A input stays fixed across long prompts and expanded spellings1180x${height} at${scale}percent`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1180, height });
    await page.goto('/');
    if (scale !== 100) {
      await keyboardMenuTo(page, 'settings');
      const option = page.locator(`.settings-dialog input[name="fontScale"][value="${scale}"]`);
      await keyboardRevealControl(page, option); await option.check();
      await page.keyboard.press('Escape');
    }
    let baseline: number | undefined;
    for (const [id, query] of [
      ['living_r02', '犬'], ['food_c07', 'パフェにさくらんぼをのせる'],
      ['living_c66', 'ウナギが岩の間を抜ける'], ['daily_c39', 'ごみ袋の口を縛る'],
    ]) {
      await keyboardMenuTo(page, 'catalogue');
      const search = page.locator('#catalogue-query');
      await keyboardRevealControl(page, search); await search.fill(query);
      const practice = page.locator(`[data-action="practice-word"][data-word-id="${id}"]`);
      await keyboardRevealControl(page, practice); await practice.click();
      if (await page.locator('#check-status').count()) await confirmHalfWidthInput(page);
      await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'PRACTICE');
      await expect(page.locator('#game-input')).toBeFocused();
      await assertViewportFits(page);
      const current = (await page.locator('#game-input').boundingBox())!.y;
      baseline ??= current;
      await expect.poll(async () => Math.abs((await page.locator('#game-input').boundingBox())!.y - baseline!)).toBeLessThanOrEqual(1);
      for (const [selector, minimum] of [['#prompt-word', 32], ['#prompt-reading', 22], ['#romaji-guide', 24]] as const) {
        const size = await page.locator(selector).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(size).toBeGreaterThanOrEqual(minimum * scale / 100);
      }
      await expect(page.locator('#cargo-count')).toBeVisible();
      if (id === 'daily_c39') {
        // chi and shi make this accepted guide26 keys instead of canonical24, while the word is unfinished.
        await page.locator('#game-input').pressSequentially('gomibukuronokuchiwoshi');
        await expect(page.locator('#completed-count')).toHaveText('完成 0語');
        await expect(page.locator('#romaji-guide')).toHaveText('gomibukuronokuchiwoshibaru');
        expect(Math.abs((await page.locator('#game-input').boundingBox())!.y - baseline)).toBeLessThanOrEqual(1);
        await assertViewportFits(page);
        await page.screenshot({ path: testInfo.outputPath(`expanded-guide-${scale}.png`) });
      }
    }
  });
}
