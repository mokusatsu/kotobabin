import { expect, type Page } from '@playwright/test';

export async function confirmHalfWidthInput(page: Page) {
  await page.locator('#game-input').pressSequentially('a');
  await expect(page.locator('[data-action="confirm"]')).toBeEnabled();
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('#game-input')).toBeFocused();
}

export async function beginTutorial(page: Page, options: { fromHome?: boolean } = {}) {
  if (!options.fromHome) await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await confirmHalfWidthInput(page);
  await expect(page.locator('.game-page')).toHaveAttribute('data-mode', 'TUTORIAL');
}

export async function beginMain(page: Page, options: { fromHome?: boolean } = {}) {
  await beginTutorial(page, options);
  await page.getByRole('button', { name: '導入を飛ばして本編へ', exact: true }).click();
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

/** Compatibility regressions may shorten presentation; individual real awards have their own E2E. */
export async function summarizeResult(page: Page) {
  await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'score');
  await page.keyboard.press('s');
  await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'summary');
}
