import { expect, type Page } from '@playwright/test';

export async function confirmHalfWidthInput(page: Page) {
  await page.locator('#game-input').pressSequentially('a');
  await expect(page.locator('[data-action="confirm"]')).toBeEnabled();
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('#game-input')).toBeFocused();
}

export async function beginTutorial(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'TUTORIAL');
}

export async function beginMain(page: Page) {
  await beginTutorial(page);
  await page.locator('[data-action="tutorial-skip"]').click();
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'MAIN');
  await expect(page.locator('#game-input')).toBeFocused();
  await expect(page.locator('#time-left')).toHaveText('90');
}

export async function typeCurrentGuide(page: Page) {
  const remaining = await page.locator('#romaji-guide > span:not(.accepted)').allTextContents();
  const guide = remaining.join('');
  expect(guide.length).toBeGreaterThan(0);
  await page.locator('#game-input').pressSequentially(guide);
  return guide;
}

export async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}
