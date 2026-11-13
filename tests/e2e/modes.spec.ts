import { expect, test } from '@playwright/test';
import { beginMain, beginTutorial, confirmHalfWidthInput, typeCurrentGuide } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

test('tutorial requires a real delivery and continues after an error', async ({ page }, testInfo) => {
  await page.clock.install();
  await beginTutorial(page);
  await page.locator('#game-input').press("'");
  await typeCurrentGuide(page);
  await expect(page.locator('#cargo-count')).toHaveText('0');
  await expect(page.locator('#tutorial-status')).toHaveAttribute('data-delivered', 'false');
  await page.clock.runFor(180000);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'TUTORIAL');
  await typeCurrentGuide(page);
  await expect(page.locator('#cargo-count')).toHaveText('1');
  await expect(page.locator('#tutorial-status')).toHaveAttribute('data-delivered', 'false');
  await page.locator('#game-input').press('Space');
  await expect(page.locator('#tutorial-status')).toHaveAttribute('data-delivered', 'true');
  await page.screenshot({ path: testInfo.outputPath('tutorial-delivered.png'), fullPage: true });
  await page.locator('[data-action="tutorial-main"]').click();
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#time-left')).toHaveText('90');
});

test('three unsuccessful tutorial words offer practice without restarting the introduction', async ({ page }) => {
  await beginTutorial(page);
  await expect(page.locator('#tutorial-fallback')).toBeHidden();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#game-input').press("'");
    await typeCurrentGuide(page);
  }
  await expect(page.locator('#tutorial-fallback')).toBeVisible();
  await page.locator('[data-action="tutorial-practice"]').click();
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'PRACTICE');
  await expect(page.locator('#game-input')).toBeFocused();
});

test('selected-word practice earns three clean completions and enters a fixed preferred-word MAIN plan', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  await page.locator('[data-action="practice-word"][data-word-id="living_r01"]').click();
  await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'PRACTICE');
  await expect(page.locator('#practice-progress')).toContainText('0/3');
  for (let completed = 1; completed <= 3; completed++) {
    await typeCurrentGuide(page);
    await expect(page.locator('#practice-progress')).toContainText(`${completed}/3`);
    await expect(page.locator('#prompt-word')).toHaveText('猫');
    if (completed < 3) await page.locator('[data-action="repeat-word"]').click();
  }
  await page.screenshot({ path: testInfo.outputPath('practice-qualified.png'), fullPage: true });
  await page.locator('[data-action="practice-main"]').click();
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  await expect(page.locator('#time-left')).toHaveText('90');
  let selectedWordAppeared = false;
  for (let position = 0; position < 5; position++) {
    selectedWordAppeared ||= (await page.locator('#prompt-word').textContent()) === '猫';
    await typeCurrentGuide(page);
  }
  expect(selectedWordAppeared).toBe(true);
});

test('rescue skip explains the record change, ships held cargo and stays paused', async ({ page }) => {
  await beginMain(page);
  const guide = await typeCurrentGuide(page);
  const completionScore = guide.length * 10;
  await expect(page.locator('#cargo-count')).toHaveText('1');
  await page.locator('#game-input').press('Escape');
  await page.locator('[data-action="skip"]').click();
  await expect(page.getByRole('dialog')).toContainText('救済あり');
  await page.locator('[data-action="confirm-skip"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#cargo-count')).toHaveText('0');
  await expect(page.locator('#score')).toHaveText(String(completionScore + Math.floor(completionScore / 5)));
  await expect(page.locator('#completed-count')).toHaveText('完成 1語');
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('#game-input')).toBeFocused();
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
});

test('practice completion choices work with the keyboard and preserve focus for the next attempt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ことば図鑑', exact: true }).click();
  await page.locator('#catalogue-query').fill('猫');
  await page.locator('[data-action="practice-word"][data-word-id="living_r01"]').click();
  await confirmHalfWidthInput(page);
  for (let completed = 1; completed <= 3; completed++) {
    await typeCurrentGuide(page);
    await expect(page.locator('#practice-progress')).toContainText(`${completed}/3`);
    await expect(page.locator('[data-action="repeat-word"]')).toBeFocused();
    await expect(page.locator('#paused-layer')).toBeHidden();
    if (completed < 3) {
      await page.keyboard.press('Enter');
      await expect(page.locator('#game-input')).toBeFocused();
    }
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action="next-practice-word"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action="practice-main"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  await expect(page.locator('#game-input')).toBeFocused();
});
