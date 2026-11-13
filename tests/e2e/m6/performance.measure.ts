import { test, expect } from '@playwright/test';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import type { ProfileDocument } from '../../../src/profile/repository';
import { beginMain } from '../helpers';
import { keyboardMenuTo, keyboardRevealControl, tabTo } from '../keyboard';

const percentile = (values: number[], proportion = .95) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * proportion) - 1];
const hardware = () => ({ os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), node: process.version, physicalTarget: false });

test('cold production transfer and start-ready: 20 uncached 10Mbps/100ms trials', async ({ browser }, info) => {
  const trials: { readyMs: number; wireBytes: number; encodings: string[] }[] = [];
  for (let trial = 0; trial < 20; trial++) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1180, height: 720 } });
    const page = await context.newPage(); const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 1250000, connectionType: 'ethernet' });
    let wireBytes = 0; const encodings = new Set<string>();
    cdp.on('Network.loadingFinished', event => { wireBytes += event.encodedDataLength; });
    cdp.on('Network.responseReceived', event => { const headers = event.response.headers; encodings.add(String(headers['Content-Encoding'] ?? headers['content-encoding'] ?? 'identity')); });
    const started = performance.now(); await page.goto('/');
    await expect(page.locator('[data-action="start"]')).toBeEnabled();
    const readyMs = performance.now() - started;
    await page.waitForLoadState('networkidle'); trials.push({ readyMs, wireBytes, encodings: [...encodings] });
    await context.close();
  }
  const report = { hardware: hardware(), browser: browser.version(), viewport: '1180x720', scale: 100,
    method: 'Chromium CDP uncached fresh contexts, actual Network.loadingFinished encoded bytes; identity is NOT described as compressed delivery', trials,
    readyP95: percentile(trials.map(row => row.readyMs)), largestWireBytes: Math.max(...trials.map(row => row.wireBytes)) };
  await info.attach('cold-load.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.largestWireBytes, JSON.stringify(report)).toBeLessThanOrEqual(3000000);
  expect(report.readyP95, JSON.stringify(report)).toBeLessThanOrEqual(3000);
});

test('960-word progress / 30 records: trusted native input latency and actual handbook/catalogue UI', async ({ page, browser }, info) => {
  const fixture = JSON.parse(readFileSync('work/m6-performance/profile.json', 'utf8')) as ProfileDocument;
  await page.goto('/'); await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await page.evaluate(async profile => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('kotobabin', 4); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('profile', 'readwrite'); const store = tx.objectStore('profile'); const read = store.get('current');
      read.onsuccess = () => { profile.metadata = { ...read.result.metadata, ownerTabId: null, writeEpoch: read.result.metadata.writeEpoch + 1, revision: read.result.metadata.revision + 1 }; store.put(profile, 'current'); };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); db.close();
  }, fixture);
  await page.reload(); await expect(page.locator('[data-action="start"]')).toBeEnabled();
  await beginMain(page, { fromHome: true });
  await page.evaluate(() => {
    const probe = { handlerMs: [] as number[], displayMs: [] as number[], longTasks: [] as number[], frames: [] as number[], active: true, changedFrames: 0 };
    Object.assign(window, { m6Probe: probe }); let downAt = 0; let inputAt = 0; let before = ''; let lastFrame = performance.now();
    const fingerprint = () => `${document.querySelector('#prompt-word')?.textContent}|${document.querySelector('#romaji-guide .accepted')?.textContent}|${document.querySelector('#score')?.textContent}`;
    document.addEventListener('keydown', event => { if (probe.active && event.isTrusted && (event.target as HTMLElement)?.id === 'game-input' && event.key.length === 1) { downAt = performance.now(); before = fingerprint(); } }, true);
    document.addEventListener('input', event => { if (probe.active && event.isTrusted && (event.target as HTMLElement)?.id === 'game-input') inputAt = performance.now(); }, true);
    document.addEventListener('input', event => { if (!probe.active || !event.isTrusted || (event.target as HTMLElement)?.id !== 'game-input') return;
      probe.handlerMs.push(performance.now() - inputAt); const keyAt = downAt; const original = before;
      requestAnimationFrame(() => { probe.displayMs.push(performance.now() - keyAt); if (fingerprint() !== original) probe.changedFrames++; });
    });
    new PerformanceObserver(list => { if (probe.active) probe.longTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: 'longtask', buffered: false });
    const frame = (now: number) => { if (!probe.active) return; probe.frames.push(now - lastFrame); lastFrame = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  });
  let accepted = 0;
  for (let word = 0; word < 48 || accepted < 240; word++) {
    const guide = (await page.locator('#romaji-guide > span:not(.accepted)').allTextContents()).join('');
    expect(guide.length).toBeGreaterThan(0); await page.keyboard.type(guide, { delay: 12 }); accepted += guide.length;
    if (word % 8 === 2) await page.keyboard.press('Space');
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const probe = await page.evaluate(() => { const value = (window as unknown as { m6Probe: { active: boolean; handlerMs: number[]; displayMs: number[]; longTasks: number[]; frames: number[]; changedFrames: number } }).m6Probe; value.active = false; return value; });
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state', 'saved');
  await page.keyboard.press('Escape'); await keyboardMenuTo(page, 'handbook');
  const familyMs: number[] = []; const ids = new Set<string>();
  for (const family of 'ABCDEFGHIJKL') {
    const button = page.locator(`[data-action="achievement-family"][data-family-id="${family}"]`);
    await keyboardRevealControl(page, button); await tabTo(page, button); const start = performance.now(); await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-current', 'true'); await expect(page.locator('#handbook-cards article')).toHaveCount(6); familyMs.push(performance.now() - start);
    for (const id of await page.locator('#handbook-cards article').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-achievement-id')!))) ids.add(id);
  }
  await keyboardMenuTo(page, 'catalogue'); await expect(page.locator('#catalogue-count')).toHaveText('960語が見つかりました');
  const state = page.locator('#catalogue-state'); await keyboardRevealControl(page, state); await tabTo(page, state);
  const filterStarted = performance.now(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(state).toHaveValue('practiceQualified'); await expect(page.locator('#catalogue-count')).toHaveText('960語が見つかりました');
  const report = { hardware: hardware(), browser: browser.version(), viewport: '1180x720', scale: 100,
    fixture: { canonicalWords: 960, practiceCleanRepetitions: 3, recentRounds: 30, syntheticDomainFixtureNotUserRecord: true }, accepted,
    samples: probe, handlerP95: percentile(probe.handlerMs), displayP95: percentile(probe.displayMs), frameP95: percentile(probe.frames),
    handbookDistinctIds: ids.size, familyMs, qualified960FilterMs: performance.now() - filterStarted,
    method: 'Trusted native input capture-to-bubble handler interval and native keydown-to-next-animation-frame DOM feedback proxy; includes browser scheduling, not physical display/IME latency. Catalogue filters all960 data while rendering paginated rows.' };
  await info.attach('populated-input-ui.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(ids.size).toBe(72); expect(probe.handlerMs.length).toBeGreaterThanOrEqual(240);
  expect(probe.changedFrames).toBe(probe.displayMs.length);
  expect(report.handlerP95, JSON.stringify(report)).toBeLessThanOrEqual(5);
  expect(report.displayP95, JSON.stringify(report)).toBeLessThanOrEqual(50);
  expect(probe.longTasks, JSON.stringify(report)).toEqual([]);
});
