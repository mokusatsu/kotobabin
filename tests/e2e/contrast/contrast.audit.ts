import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectContrast } from './collector';
import { confirmHalfWidthInput, typeCurrentGuide } from '../helpers';
import { keyboardMenuTo, keyboardRevealControl, tabTo } from '../keyboard';

test('read-only computed text contrast across actual main UI states', async ({ page, browser }, info) => {
  const screens: { name: string; measurement: ReturnType<typeof collectContrast> }[] = [];
  const capture = async (name: string) => { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); screens.push({ name, measurement: await page.evaluate(collectContrast) }); };
  const panels = async (name: string) => {
    for (let panel = 0; panel < 40; panel++) {
      await capture(`${name}-${panel + 1}`);
      const host = page.locator('.ipad-page-host:visible').last();
      const next = host.locator('[data-ipad-next]');
      if (!await host.count() || !await next.count() || await next.isDisabled()) return;
      await tabTo(page, next); await page.keyboard.press('ArrowRight');
    }
    throw new Error('Contrast traversal exceeded40 actual panels');
  };
  await page.clock.install(); await page.goto('/'); await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await capture('home');
  await keyboardMenuTo(page, 'city'); await capture('city');
  await keyboardMenuTo(page, 'equipment'); await capture('equipment');
  await keyboardMenuTo(page, 'home');
  await page.locator('[data-action="start"]').click(); await panels('input-check');
  await confirmHalfWidthInput(page); await capture('tutorial');
  await page.getByRole('button', { name: '導入を飛ばして本編へ', exact: true }).click();
  await capture('main-ready'); await typeCurrentGuide(page); await capture('main-playing');
  await page.keyboard.press('Escape'); await capture('pause');
  await keyboardMenuTo(page, 'settings'); await panels('settings'); await page.keyboard.press('Escape');
  await page.locator('[data-action="resume"]').click(); await page.clock.runFor(90001);
  await expect(page.locator('.result-stage')).toHaveAttribute('data-result-phase', 'score'); await capture('result-score');
  await expect(page.locator('[data-result-command="advance"]')).toBeEnabled(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await capture('result-award');
  await page.keyboard.press('s'); await capture('result-summary');
  await keyboardMenuTo(page, 'handbook'); await panels('handbook');
  await keyboardMenuTo(page, 'catalogue'); await panels('catalogue');
  const query = page.locator('#catalogue-query'); await keyboardRevealControl(page, query); await query.fill('猫');
  const word = page.locator('[data-action="practice-word"][data-word-id="living_r01"]'); await keyboardRevealControl(page, word); await word.click();
  if (await page.locator('#check-status').count()) await confirmHalfWidthInput(page);
  await capture('practice'); await typeCurrentGuide(page); await capture('practice-complete');
  const low = screens.flatMap(screen => screen.measurement.results.filter(row => row.status === 'low').map(row => ({ screen: screen.name, ...row })));
  const unmeasured = screens.flatMap(screen => screen.measurement.results.filter(row => row.status === 'unmeasured').map(row => ({ screen: screen.name, ...row })));
  const report = { browser: browser.version(), source: process.env.GITHUB_SHA ?? 'local-not-browser-executed', method: 'Computed foreground; solid ancestor background alpha composition until opaque; WCAG sRGB ratio4.5. Images/gradients/painted pseudo/blends/opacity unresolved; decorativeSVG/disabled/inert excluded. No application state injection.', screens, low, unmeasured };
  const file = info.outputPath('computed-contrast.json'); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(report, null, 2));
  await info.attach('computed-contrast', { path: file, contentType: 'application/json' });
  console.log('CONTRAST_SUMMARY', JSON.stringify({ browser: report.browser, screens: screens.length, measured: screens.flatMap(s => s.measurement.results).filter(r => r.ratio !== null).length, low: low.map(({ screen, selector, text, foreground, background, ratio }) => ({ screen, selector, text, foreground, background, ratio })), unmeasured: unmeasured.length }));
  expect(screens.length).toBeGreaterThan(12);
});
