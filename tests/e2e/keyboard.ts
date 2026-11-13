import { expect, type Locator, type Page } from '@playwright/test';

/** Real Tab navigation: never moves focus through DOM APIs or a pointer. */
export async function tabTo(page: Page, target: Locator, maximum = 100) {
  await expect(target).toBeVisible();
  for (let step = 0; step < maximum; step++) {
    if (await target.evaluate(element => element === document.activeElement)) {
      await expect(target).toBeFocused();
      expect(await target.evaluate(element => element.matches(':focus-visible'))).toBe(true);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus did not reach ${await target.evaluate(element => element.outerHTML.slice(0, 180))}`);
}

/** Hidden overflow is not acceptance: every visible, enabled control must fit too. */
export async function assertViewportFits(page: Page) {
  await expect(async () => {
  const report = await page.evaluate(() => {
    const outside = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary')]
      .filter(element => !element.closest('[inert]') && !element.closest('[aria-hidden="true"]'))
      .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
      .map(element => ({ element: element.outerHTML.slice(0, 160), rectangle: element.getBoundingClientRect() }))
      .filter(({ rectangle: r }) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
      .map(({ element, rectangle: r }) => ({ element, x: r.x, y: r.y, width: r.width, height: r.height }));
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight, scrollX, scrollY, outside };
  });
  expect(report.documentWidth, JSON.stringify(report)).toBeLessThanOrEqual(report.width + 1);
  expect(report.documentHeight, JSON.stringify(report)).toBeLessThanOrEqual(report.height + 1);
  expect(report.scrollX).toBe(0); expect(report.scrollY).toBe(0);
  expect(report.outside).toEqual([]);
  }).toPass({ timeout: 5000 });
}

export async function keyboardMenuTo(page: Page, action: string) {
  await page.keyboard.press('F2');
  const menu = page.locator('.navigation-dialog');
  await expect(menu).toBeVisible();
  await assertViewportFits(page);
  const target = menu.locator(`[data-navigation][data-action="${action}"]`);
  for (let step = 0; step < 10; step++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

export async function keyboardWalkPanels(page: Page) {
  const host = page.locator('.ipad-page-host:visible').last();
  if (!await host.count()) { await assertViewportFits(page); return; }
  for (let panel = 0; panel < 100; panel++) {
    await assertViewportFits(page);
    await expect(host).not.toHaveAttribute('data-ipad-overflow', 'true');
    const next = host.locator('[data-ipad-next]');
    if (!await next.count() || await next.isDisabled()) return;
    const previousPage = await host.getAttribute('data-ipad-page');
    await tabTo(page, next);
    await page.keyboard.press('ArrowRight');
    await expect(host).not.toHaveAttribute('data-ipad-page', previousPage!);
  }
  throw new Error('Panel navigation did not reach its end within100 pages');
}
