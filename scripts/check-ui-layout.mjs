import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { auditUiBounds } from './ui-bounds.mjs';

function resolveChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const defaultPath = chromium.executablePath();
  if (defaultPath && fsSync.existsSync(defaultPath)) {
    return undefined;
  }
  const cacheDir = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
    : path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fsSync.existsSync(cacheDir)) {
    return undefined;
  }
  const candidates = fsSync.readdirSync(cacheDir)
    .filter((name) => /^chromium(?:_headless_shell)?-\d+$/.test(name))
    .sort()
    .reverse();
  for (const dir of candidates) {
    const subpaths = [
      path.join(cacheDir, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
      path.join(cacheDir, dir, 'chrome-win64', 'chrome.exe'),
      path.join(cacheDir, dir, 'chrome-linux', 'chrome'),
      path.join(cacheDir, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    ];
    for (const candidate of subpaths) {
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const output = path.resolve(root, process.env.UI_LAYOUT_OUTPUT ?? '.codex-temp/ui-layout');
assert(output.startsWith(path.join(root, '.codex-temp') + path.sep), 'UI evidence must remain under .codex-temp/.');
const report = { detectorChecks: [], scenarios: [] };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
await fs.mkdir(output, { recursive: true });
const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

async function verifyDetector() {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  try {
    await page.setContent('<style>*{box-sizing:border-box}#fixture{width:300px;height:120px;overflow:auto;position:relative}button{width:100%;height:56px;outline:2px solid green;outline-offset:3px}</style><div id="fixture"><button>次へ</button></div>');
    assert.equal(await page.locator('#fixture').evaluate((el) => el.scrollWidth - el.clientWidth), 0);
    assert((await page.evaluate(auditUiBounds, '#fixture')).some((issue) => issue.kind === 'focus-clipped'));
    await page.locator('#fixture').evaluate((el) => { el.style.padding = '5px'; });
    assert.deepEqual(await page.evaluate(auditUiBounds, '#fixture'), []);
    report.detectorChecks.push('focus outline is detected even when scrollWidth equals clientWidth');
    await page.setContent('<div id="fixture" style="overflow:hidden;width:60px;white-space:nowrap">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>');
    assert((await page.evaluate(auditUiBounds, '#fixture')).some((issue) => issue.kind === 'text-clipped'));
    report.detectorChecks.push('text rectangles are checked against clipping ancestors');
    await page.setContent('<button id="fixture" style="width:60px;height:40px;white-space:nowrap">ABCDEFGHIJKLMN</button>');
    assert((await page.evaluate(auditUiBounds, '#fixture')).some((issue) => issue.kind === 'text-outside-control'));
    report.detectorChecks.push('labels must stay inside their controls even when overflow is visible');
    await page.setContent('<div id="fixture" style="position:relative;width:200px;height:60px"><button style="width:200px;height:60px">次へ</button><div style="position:absolute;inset:0;background:white"></div></div>');
    assert((await page.evaluate(auditUiBounds, '#fixture')).some((issue) => issue.kind === 'control-covered'));
    report.detectorChecks.push('covered controls are detected by hit testing');
  } finally { await page.close(); }
}

async function scenario(scale) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: 'ja-JP' });
  const result = { scale, phases: [], frames: 0, issues: [], browserErrors: [] };
  report.scenarios.push(result);
  try {
    await context.addInitScript((value) => localStorage.setItem('kotobabin:fontScale', value), scale);
    await context.addInitScript({ content: `window.__auditUiBounds = ${auditUiBounds.toString()};` });
    await context.route('http://ui-check.local/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(dist + path.sep)) return route.fulfill({ status: 403 });
      try { await route.fulfill({ body: await fs.readFile(file), contentType: types[path.extname(file)] ?? 'application/octet-stream' }); }
      catch { await route.fulfill({ status: 404 }); }
    });
    const page = await context.newPage();
    await page.clock.install();
    page.on('pageerror', (error) => result.browserErrors.push(error.message));
    await page.goto('http://ui-check.local/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.__layoutIssues = new Map();
      window.__layoutFrames = 0;
      window.__layoutPhase = 'intro';
      const sample = () => {
        if (document.querySelector('dialog:modal')) {
          window.__layoutFrames += 1;
          for (const issue of window.__auditUiBounds('dialog:modal')) {
            const item = { phase: window.__layoutPhase, ...issue };
            window.__layoutIssues.set(JSON.stringify(item), item);
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const inspect = async (phase, selector, focus = false) => {
      result.phases.push(phase);
      await page.evaluate((name) => { window.__layoutPhase = name; }, phase);
      if (focus) {
        await page.keyboard.press('Tab');
        const controls = page.locator(selector).locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        for (let i = 0; i < await controls.count(); i += 1) {
          await controls.nth(i).focus();
          result.issues.push(...(await page.evaluate(auditUiBounds, selector)).map((issue) => ({ phase, ...issue })));
        }
      }
      result.issues.push(...(await page.evaluate(auditUiBounds, selector)).map((issue) => ({ phase, ...issue })));
      await page.screenshot({ path: path.join(output, `${scale}-${phase}.png`) });
    };
    const start = async (name = 'tutorial') => {
      assert.equal(await page.locator('.kb-input-check-box').count(), 0);
      await inspect(`${name}-start-F`, '.kb-play-paper', true);
      await page.keyboard.press('f');
      assert.equal(await page.getByTestId('start-countdown').innerText(), '3');
      await page.keyboard.press('z');
      await inspect(`${name}-countdown-3`, '.kb-play-paper');
      await page.waitForFunction(() => document.querySelector('[data-testid="start-countdown"]')?.textContent === '2');
      await page.waitForFunction(() => document.querySelector('[data-testid="start-countdown"]')?.textContent === '1');
      await page.getByTestId('play-word-ja').waitFor();
      const typed = page.locator('.kb-roman-typed');
      assert.equal(await typed.count() ? await typed.innerText() : '', '');
      assert(!(await page.locator('body').innerText()).includes('ミス！'));
    };
    const typeWords = async (count) => {
      const firstWord = (await page.getByTestId('play-word-ja').textContent()).trim();
      for (let word = 0; word < count; word += 1) {
        const romaji = (await page.locator('.kb-prompt-roman').textContent()).trim();
        assert.match(romaji, /^[a-z'-]+$/);
        await page.keyboard.type(romaji, { delay: 10 });
      }
      return firstWord;
    };
    const intro = page.locator('.kb-onboarding-intro-art');
    await intro.evaluate((image) => image.decode());
    assert((await intro.boundingBox()).width >= 800, 'The goal illustration must be large.');
    await inspect('intro', 'dialog:modal', true);
    await page.getByTestId('onboarding-next-btn').tap();
    await page.locator('.kb-map-district-btn[data-district-id="residential"]').tap();
    await start();
    await inspect('typing', '.kb-play-paper');
    assert.equal(await page.locator('.kb-play-world-bg').evaluate((el) => getComputedStyle(el, '::after').content), 'none');
    await typeWords(1);
    await inspect('tutorial-loading-rule', '.kb-play-tutorial-banner');
    await inspect('tutorial-dispatch-progress', '.kb-play-paper');
    await typeWords(4);
    for (const id of ['A01', 'A02', 'A04', 'reward_family_a_postcard']) {
      await page.waitForFunction((stampId) => document.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id') === stampId, id);
      await page.waitForTimeout(450);
      if (id === 'reward_family_a_postcard') {
        await page.getByTestId('gacha-reveal-card').getByText('絵葉書を獲得', { exact: true }).waitFor();
        await page.locator('.kb-reward-reveal-art').evaluate((img) => img.decode());
      }
      await inspect(`${id}-disabled`, 'dialog:modal');
      await page.waitForFunction(() => document.querySelector('[data-testid="gacha-next-btn"]')?.disabled === false);
      await inspect(`${id}-focused`, 'dialog:modal', true);
      await page.getByTestId('gacha-next-btn').tap();
    }
    await inspect('receipt', 'dialog:modal', true);
    await page.getByTestId('onboarding-build-next-btn').tap();
    await page.locator('.kb-map-district-btn[data-district-id="residential"]').tap();
    await inspect('build-guide', '.is-onboard-action-dock', true);
    await page.getByTestId('upgrade-district-btn').tap();
    await page.getByTestId('town-node-packaging').tap();
    await inspect('equipment-guide', '.is-onboard-action-dock', true);
    await page.getByTestId('buy-packaging-btn').tap();
    await page.getByTestId('onboarding-complete-dialog').waitFor({ state: 'visible' });
    await inspect('complete', 'dialog:modal', true);
    assert.match(await page.getByTestId('onboarding-complete-dialog').evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor), /0\.6/);
    await page.getByTestId('onboarding-finish-home-btn').tap();
    assert.equal((await page.locator('.kb-unread-pill').innerText()).trim(), '3');
    for (const [key, title] of [['h', 'ホーム'], ['j', '街の設備'], ['k', '配達手帳'], ['l', 'ことば図鑑'], ['s', '設定']]) {
      await page.locator('.kb-nav-btn').first().focus();
      await page.keyboard.press(key);
      assert((await page.locator('.kb-nav-btn[aria-current="page"]').innerText()).includes(title));
      await inspect(`navigation-${key}`, '.kb-header', true);
    }
    assert(!(await page.locator('.kb-settings-screen').innerText()).includes('手動配達キー'));
    await inspect('settings-delivery-controls', '.kb-settings-screen', true);
    await page.keyboard.press('k');
    assert.match(await page.getByTestId('handbook-stamps-tab').innerText(), /\/500/);
    const sheetTitle = page.getByTestId('handbook-sheet-title');
    const firstSheetTitle = await sheetTitle.innerText();
    await inspect('handbook-board-first', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-next').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByTestId('handbook-page').inputValue(), '1');
    assert.equal(await sheetTitle.innerText(), firstSheetTitle);
    await page.locator('[data-sheet-id="G"]').tap();
    assert.match(await sheetTitle.innerText(), /^G\./);
    await inspect('handbook-list-second-page', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-prev').tap();
    await page.locator('[data-sheet-id="A"]').tap();
    await page.locator('.kb-stamp-tile').first().tap();
    assert.match(await page.locator('dialog:modal .kb-stamp-flavor').innerText(), /小さな紙の鳥/);
    assert.equal(await page.locator('dialog:modal').getByText('獲得報酬', { exact: true }).count(), 0);
    await inspect('handbook', 'dialog:modal', true);
    await page.locator('.kb-stamp-dialog-close').tap();
    await page.getByTestId('handbook-collection-tab').tap();
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.kb-reward-art')];
      return imgs.length === 46 && imgs.every((img) => img.complete);
    });
    const rewardArtCheck = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.kb-reward-art')];
      const broken = imgs
        .filter((img) => img.naturalWidth === 0 || getComputedStyle(img).display === 'none')
        .map((img) => img.getAttribute('src'));
      return { total: imgs.length, broken };
    });
    assert.equal(rewardArtCheck.total, 46, 'Expected 36 other rewards and 10 frames in the selected group');
    assert.deepEqual(rewardArtCheck.broken, [], `Hidden or broken reward images: ${JSON.stringify(rewardArtCheck.broken)}`);
    const frameSection = page.getByTestId('handbook-frames');
    const framePicker = page.getByTestId('handbook-frame-group');
    await framePicker.selectOption('4');
    assert.equal(await frameSection.locator('[data-frame-reward]').count(), 10);
    await frameSection.locator('[data-frame-reward="reward_frame_mother_of_pearl"] img.kb-reward-art').evaluate((img) => img.decode());
    await frameSection.scrollIntoViewIfNeeded();
    await inspect('handbook-frame-catalog', '[data-testid="handbook-frames"]', true);
    await framePicker.selectOption('0');
    const ownedPostcard = page.locator('[data-postcard-id="reward_family_a_postcard"]');
    const lockedPostcard = page.locator('[data-postcard-id="reward_family_b_postcard"]');
    await page.keyboard.press('Tab');
    await ownedPostcard.focus();
    await ownedPostcard.evaluate((tile) => tile.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const cover = await ownedPostcard.locator('.kb-postcard-thumbnail').boundingBox();
    const tile = await ownedPostcard.boundingBox();
    assert(cover.width >= 200 && Math.abs(cover.width - tile.width) <= 4, 'Postcard art should fill its card');
    await inspect('handbook-postcard-tile', '[data-postcard-id="reward_family_a_postcard"]');
    await page.keyboard.press('Enter');
    const postcardPreview = page.getByTestId('postcard-preview');
    await postcardPreview.getByRole('heading', { name: '郵便局の絵葉書' }).waitFor();
    const postcardArt = postcardPreview.locator('.kb-postcard-preview-art');
    await postcardArt.evaluate((img) => img.decode());
    assert((await postcardArt.boundingBox()).width >= cover.width * 2);
    assert.equal(await postcardArt.evaluate((img) => getComputedStyle(img).objectFit), 'contain');
    await postcardPreview.getByText('獲得済み', { exact: true }).waitFor();
    await inspect('handbook-postcard-preview', 'dialog:modal', true);
    await page.keyboard.press('Escape');
    await postcardPreview.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-postcard-id') === 'reward_family_a_postcard');

    await lockedPostcard.tap();
    await postcardPreview.getByText('未獲得', { exact: true }).waitFor();
    await postcardPreview.getByText('B系統の実績を3件解除').waitFor();
    await inspect('handbook-locked-postcard', 'dialog:modal', true);
    await postcardPreview.getByRole('button', { name: '絵葉書を閉じる' }).tap();
    await postcardPreview.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-postcard-id') === 'reward_family_b_postcard');
    await page.locator('.kb-reward-card').first().scrollIntoViewIfNeeded();
    await inspect('handbook-collection', '.kb-reward-card', false);
    await page.getByTestId('handbook-stamps-tab').tap();
    const listPage = page.getByTestId('handbook-page');
    await listPage.selectOption({ index: await listPage.locator('option').count() - 1 });
    assert.equal(await page.getByTestId('handbook-next').isDisabled(), true);
    assert.equal(await sheetTitle.innerText(), firstSheetTitle);
    await page.locator('[data-sheet-id="rails_and_research"]').tap();
    assert.equal(await sheetTitle.innerText(), '秘密の切手 12');
    await inspect('handbook-board-last', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-group').selectOption('typing');
    assert.equal(await page.getByTestId('handbook-page').inputValue(), '0');
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.kb-stamp-inner-art')];
      return imgs.length === 7 && imgs.every((img) => img.complete);
    });
    const seriesStampCheck = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.kb-stamp-inner-art')];
      const broken = imgs
        .filter((img) => img.naturalWidth === 0 || getComputedStyle(img).display === 'none')
        .map((img) => img.getAttribute('src'));
      return { total: imgs.length, broken };
    });
    assert.equal(seriesStampCheck.total, 7, 'Expected all seven speed stamps on a single sheet');
    assert.deepEqual(seriesStampCheck.broken, [], `Hidden or broken series stamp images: ${JSON.stringify(seriesStampCheck.broken)}`);
    await inspect('handbook-typing', '.kb-grid-handbook', true);
    const speedTile = page.locator('[data-stamp-id="series-speed-200"]');
    await speedTile.tap();
    await page.getByTestId('series-tier').selectOption('series-speed-400');
    await page.getByRole('heading', { name: /草の波の向こう/ }).waitFor();
    await page.locator('dialog:modal').getByText(/風が追いついて/).waitFor();
    await inspect('series-long-text', 'dialog:modal', true);
    await page.locator('.kb-stamp-dialog-close').tap();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-stamp-id') === 'series-speed-200');
    await page.getByTestId('handbook-group').selectOption('city');
    const sheetStamps = () => page.locator('.kb-stamp-tile').evaluateAll(
      (stamps) => stamps.map((stamp) => stamp.getAttribute('data-stamp-id')),
    );
    const districts = ['residential', 'market', 'workshop', 'park', 'station', 'harbor'];
    assert.equal(await sheetTitle.innerText(), '小さな屋根');
    assert.deepEqual(await sheetStamps(), districts.map((district) => `series-stage_${district}-1`));
    assert.equal(await page.locator('[data-stamp-id="series-stage_residential-1"] .kb-stamp-tile-title').innerText(),
      '住宅地の風景・小さな屋根');
    await inspect('handbook-city-stage-one', '.kb-grid-handbook', true);
    await page.locator('[data-sheet-id="stage-tier-2"]').tap();
    assert.equal(await sheetTitle.innerText(), '石だたみの小道');
    assert.deepEqual(await sheetStamps(), districts.map((district) => `series-stage_${district}-2`));
    await page.locator('[data-sheet-id="shops-tier-1"]').tap();
    assert.equal(await sheetTitle.innerText(), 'はじめの看板');
    assert.deepEqual(await sheetStamps(), districts.map((district) => `series-shops_${district}-1`));
    await inspect('handbook-city-shops-one', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-next').tap();
    await page.locator('[data-sheet-id="crews-tier-1"]').tap();
    assert.equal(await sheetTitle.innerText(), '荷車の初仕事');
    await inspect('handbook-city-crews-one', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-group').selectOption('words');
    assert.equal(await sheetTitle.innerText(), 'ポケットの手帳');
    await inspect('handbook-topic-title', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-group').selectOption('lifetime');
    assert.equal((await sheetStamps()).length, 8);
    await inspect('handbook-eight-stamps', '.kb-grid-handbook', true);
    await page.getByTestId('handbook-next').tap();
    await page.locator('[data-sheet-id="lifetime_materials"]').tap();
    await page.locator('[data-stamp-id="series-lifetime_materials-2500"]').tap();
    assert.match(await page.locator('dialog:modal').innerText(), /あと \d+ 資材/);
    await inspect('series-lifetime', 'dialog:modal', true);
    await page.locator('.kb-stamp-dialog-close').tap();
    await page.getByTestId('handbook-group').selectOption('secret');
    await page.locator('[data-stamp-id="series-small_steps-1"]').tap();
    assert.equal(await page.locator('dialog:modal .kb-stamp-flavor').count(), 0);
    await inspect('series-secret', 'dialog:modal', true);
    await page.getByRole('button', { name: '条件を見る' }).tap();
    await page.locator('dialog:modal .kb-stamp-flavor').waitFor();
    await inspect('series-secret-revealed', 'dialog:modal', true);
    await page.locator('.kb-stamp-dialog-close').tap();
    await page.locator('dialog:modal').waitFor({ state: 'hidden' });
    await page.getByTestId('handbook-filter').selectOption('unlocked');
    await page.getByText('この条件の切手はありません。').waitFor();
    await page.getByTestId('handbook-group').tap({ trial: true });
    await inspect('handbook-empty-filter', '.kb-grid-handbook', true);
    {
      await page.evaluate((seedOtherFrames) => new Promise((resolve, reject) => {
        const request = indexedDB.open('kotobabin');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['city', 'unlocks', 'rewards'], 'readwrite');
          const store = transaction.objectStore('city');
          const get = store.get('current');
          get.onsuccess = () => { const value = get.result; value.state.districts.residential.stock_micro = '150000000'; value.state.coins_micro = '10000000000'; store.put(value); };
          const unlocks = transaction.objectStore('unlocks');
          const keys = unlocks.getAllKeys();
          keys.onsuccess = () => {
            const allStamps = new Set(keys.result);
            const originalStamps = new Set(keys.result.filter((key) => /^[A-L]0[1-6]$/.test(key)));
            for (const achievementId of ['F01', 'G01', 'H01', 'L01', 'D01', 'K02', 'E01']) {
              if (originalStamps.size >= 7) break;
              if (originalStamps.has(achievementId)) continue;
              originalStamps.add(achievementId);
              allStamps.add(achievementId);
              unlocks.put({ achievementId, unlockedAt: Date.now(), conditionRevision: 'layout-check', scope: 'all', evidenceSummary: '' });
            }
            for (const achievementId of ['series-lifetime_materials-2500', 'series-lifetime_materials-5000']) {
              if (allStamps.size >= 9) break;
              if (allStamps.has(achievementId)) continue;
              allStamps.add(achievementId);
              unlocks.put({ achievementId, unlockedAt: Date.now(), conditionRevision: 'layout-check', scope: 'all', evidenceSummary: '' });
            }
          };
          if (seedOtherFrames) {
            const rewards = transaction.objectStore('rewards');
            for (const total of [16, 36, 60]) {
              rewards.put({ rewardId: `reward_total_${total}_frame`, unlockedAt: Date.now(), kind: 'frame' });
            }
          }
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      }), scale === '1.3');
      const beforeReload = await page.evaluate(() => ({ frames: window.__layoutFrames, issues: [...window.__layoutIssues.values()] }));
      result.frames += beforeReload.frames;
      result.issues.push(...beforeReload.issues);
      await page.reload({ waitUntil: 'networkidle' });
      await page.keyboard.press('j');
      await page.getByTestId('upgrade-district-btn').tap();
      await page.getByTestId('city-stamp-reveal').waitFor({ state: 'visible' });
      await inspect('city-unlock', 'dialog:modal', true);
      assert.equal(await page.getByTestId('gacha-reveal-card').getAttribute('data-reveal-id'), 'I01');
      const reveal = page.getByTestId('gacha-reveal-card');
      for (let i = 0; i < 5 && await reveal.getAttribute('data-reveal-id') !== 'reward_total_08_frame'; i += 1) {
        await page.getByTestId('gacha-next-btn').tap();
      }
      assert.equal(await reveal.getAttribute('data-reveal-id'), 'reward_total_08_frame');
      await reveal.getByText('額縁を獲得', { exact: true }).waitFor();
      await reveal.locator('.kb-reward-reveal-art').evaluate((img) => img.decode());
      await inspect('frame-award-animated', 'dialog:modal');
      await page.waitForTimeout(500);
      await inspect('frame-award-focused', 'dialog:modal', true);
      for (let i = 0; i < 5 && await reveal.getAttribute('data-reveal-id') !== 'reward_frame_red_postbox'; i += 1) {
        await page.getByTestId('gacha-next-btn').tap();
      }
      assert.equal(await reveal.getAttribute('data-reveal-id'), 'reward_frame_red_postbox');
      await reveal.locator('.kb-reward-reveal-art').evaluate((img) => img.decode());
      await inspect('frame-count-award', 'dialog:modal', true);
      await page.getByTestId('city-stamp-reveal').getByTestId('gacha-skip-btn').tap();

      await page.keyboard.press('k');
      const collectionTab = page.getByTestId('handbook-collection-tab');
      const stampsTab = page.getByTestId('handbook-stamps-tab');
      const equippedFrame = page.locator('dialog:modal [data-stamp-frame]');
      const closeStamp = page.locator('dialog:modal .kb-stamp-dialog-close');
      const verifyFrame = () => equippedFrame.evaluate(async (frame) => {
        const art = frame.querySelector('img.kb-stamp-inner-art');
        await art.decode();
        const artRect = art.getBoundingClientRect();
        const { width, height } = artRect;
        if (Math.abs(width / height - art.naturalWidth / art.naturalHeight) > 0.002) throw new Error('Stamp artwork was distorted');
        const overlayImg = frame.querySelector('img.kb-equipped-stamp-frame-overlay');
        if (!overlayImg) throw new Error('Frame overlay img is missing');
        await overlayImg.decode();
        const style = getComputedStyle(overlayImg);
        if (style.zIndex !== '1') throw new Error('Frame is missing its foreground overlay');
        if (overlayImg.naturalWidth !== overlayImg.naturalHeight) throw new Error('Frame overlay intrinsic size is not square');
        const overlayRect = overlayImg.getBoundingClientRect();
        if (Math.abs(overlayRect.width / overlayRect.height - 1) > 0.002) throw new Error('Frame overlay rendered box is not square');
        const margins = [artRect.left - overlayRect.left, overlayRect.right - artRect.right,
          artRect.top - overlayRect.top, overlayRect.bottom - artRect.bottom];
        if (margins.some((margin) => Math.abs(margin / overlayRect.width - 0.193) > 0.002)) {
          throw new Error('Stamp artwork does not fill the frame opening');
        }
        const canvas = document.createElement('canvas');
        canvas.width = overlayImg.naturalWidth;
        canvas.height = overlayImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(overlayImg, 0, 0);
        const openingSize = Math.floor(canvas.width * 0.5);
        const openingStart = Math.floor((canvas.width - openingSize) / 2);
        const opening = ctx.getImageData(openingStart, openingStart, openingSize, openingSize).data;
        if (opening.some((channel, index) => index % 4 === 3 && channel !== 0)) {
          throw new Error('Expected a transparent center opening');
        }
      });
      const inspectFrame = async (name) => {
        await page.locator('[data-stamp-id="A01"]').tap();
        assert.equal(await equippedFrame.getAttribute('data-stamp-frame'), `reward_frame_${name}`);
        await verifyFrame();
        if (scale === '1.3' && name === 'leaf') {
          const tablet = page.viewportSize();
          await page.setViewportSize({ width: 680, height: 820 });
          try {
            await verifyFrame();
          } finally {
            await page.setViewportSize(tablet);
          }
        }
        await inspect(`handbook-equipped-${name}`, 'dialog:modal', true);
        await closeStamp.tap();
      };
      const frames = scale === '1.3'
        ? [['leaf', '2', 'reward_total_08_frame'], ['plaza', '1', 'reward_total_16_frame'],
          ['sunset', '3', 'reward_total_36_frame'], ['journey', '0', 'reward_total_60_frame'], ['red_postbox', '0', 'reward_frame_red_postbox']]
        : [['leaf', '2', 'reward_total_08_frame'], ['red_postbox', '0', 'reward_frame_red_postbox']];
      for (const [id, group, rewardId] of frames) {
        await collectionTab.tap();
        await framePicker.selectOption(group);
        await frameSection.locator(`[data-equip-frame="${rewardId}"]`).tap();
        if (scale === '1.3' && id === 'red_postbox') {
          await inspect('handbook-frame-catalog-equipped', '[data-testid="handbook-frames"]', true);
        }
        await stampsTab.tap();
        await inspectFrame(id);
      }

      await collectionTab.tap();
      await ownedPostcard.tap();
      await postcardArt.evaluate(async (image) => {
        await image.decode();
        const { width, height } = image.getBoundingClientRect();
        if (Math.abs(width / height - image.naturalWidth / image.naturalHeight) > 0.002) throw new Error('Postcard was distorted');
      });
      assert.equal(await equippedFrame.count(), 0);
      await inspect('handbook-postcard-with-frame-equipped', 'dialog:modal', true);
      await postcardPreview.getByRole('button', { name: '絵葉書を閉じる' }).tap();

      if (scale === '1.3') {
        const beforeFrameReload = await page.evaluate(() => ({ frames: window.__layoutFrames ?? 0, issues: [...(window.__layoutIssues?.values() ?? [])] }));
        result.frames += beforeFrameReload.frames;
        result.issues.push(...beforeFrameReload.issues);
        await page.reload({ waitUntil: 'networkidle' });
        await page.keyboard.press('k');
        await inspectFrame('red_postbox');
        await page.locator('[data-stamp-id="A06"]').tap();
        assert.equal(await equippedFrame.count(), 0);
        await closeStamp.tap();
        await collectionTab.tap();
      }
      await page.getByRole('button', { name: '装着中（外す）', exact: true }).tap();
      await stampsTab.tap();
      await page.locator('[data-stamp-id="A01"]').tap();
      assert.equal(await equippedFrame.count(), 0);
      await page.locator('dialog:modal .kb-stamp-frame-overlay').waitFor();
      await closeStamp.tap();
    }
    await page.locator('.kb-nav-btn').filter({ hasText: 'ホーム' }).tap();
    await page.locator('.kb-nav-btn[aria-current="page"]').getByText('ホーム', { exact: true }).waitFor();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Enter');
    await page.getByTestId('launch-course-relaxed').tap();
    await start('main');
    const readRemaining = async () => Number((await page.getByTestId('play-timer').innerText()).match(/\d+(?:\.\d+)?/)[0]);
    const initialRemaining = await readRemaining();
    assert(initialRemaining >= 88.5 && initialRemaining <= 90, `Countdown consumed round time: ${initialRemaining}`);
    await page.clock.runFor(1100);
    assert((await readRemaining()) < initialRemaining - 0.5, 'The round clock did not start after the countdown.');
    const firstWord = await typeWords(4);
    const dispatchHint = page.getByTestId('play-deliver-hint');
    const extraProgress = page.getByTestId('extra-delivery-progress');
    const assertDeliveryProgressLayout = async () => {
      assert(await extraProgress.evaluate((meter, fontScale) => {
        const row = meter.parentElement;
        const progress = meter.getBoundingClientRect();
        const cargo = row.querySelector('.kb-deliver-cargo-count').getBoundingClientRect();
        const group = row.getBoundingClientRect();
        const paper = meter.closest('.kb-play-paper').getBoundingClientRect();
        const aligned = Math.abs(cargo.top + cargo.height / 2 - progress.top - progress.height / 2) < 1;
        const centered = Math.abs(group.left + group.width / 2 - paper.left - paper.width / 2) < 1;
        const marks = [...meter.querySelectorAll('.kb-extra-mark')];
        return cargo.right < progress.left && aligned && centered && marks.length === 5
          && marks.every((mark) => Math.abs(mark.clientWidth - 36 * Number(fontScale)) < 1);
      }, scale), 'Cargo and extra delivery should share a centered row with large envelope marks.');
    };
    assert.match(await dispatchHint.innerText(), /積載 4\/5/);
    assert.equal(await extraProgress.locator('.is-lit').count(), 4);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.match(await dispatchHint.innerText(), /積載 4\/5/);
    await assertDeliveryProgressLayout();
    await inspect('main-dispatch-waiting', '.kb-play-paper');
    await typeWords(1);
    const landingOffset = await page.evaluate(() => {
      const parcel = document.querySelector('.kb-flying-parcel[data-cargo-stage="5"]');
      const train = document.querySelector('[data-delivery-kind="full"]');
      const wagon = train?.querySelector('.kb-world-courier-wagon');
      const falling = parcel?.getAnimations().find((animation) => animation.animationName === 'kb-parcel-drop');
      const travel = train?.getAnimations().find((animation) => animation.animationName === 'kb-world-deliver');
      if (!falling || !travel || !wagon) throw new Error('Missing full wagon or last falling parcel');
      falling.pause();
      travel.pause();
      falling.currentTime = Number(falling.effect.getTiming().duration) * 0.85;
      travel.currentTime = 0;
      const box = parcel.getBoundingClientRect();
      const car = wagon.getBoundingClientRect();
      window.__loadingReviewAnimations = [falling, travel];
      return {
        x: box.left + box.width / 2 - (car.left + car.width * 131 / 216),
        y: box.top + box.height / 2 - (car.top + car.height * 43 / 160),
      };
    });
    assert(Math.abs(landingOffset.x) < 1 && Math.abs(landingOffset.y) < 1, JSON.stringify(landingOffset));
    await inspect('main-fifth-parcel-landing', '.kb-play-paper');
    await page.evaluate(() => window.__loadingReviewAnimations.forEach((animation) => animation.play()));
    assert.match(await dispatchHint.innerText(), /通常便と追加便が出発/);
    assert.equal(await extraProgress.locator('.is-lit').count(), 5);
    await assertDeliveryProgressLayout();
    await inspect('main-double-dispatch', '.kb-play-paper');
    await typeWords(1);
    assert.match(await dispatchHint.innerText(), /追加便が出発/);
    assert.equal(await extraProgress.locator('.is-lit').count(), 5);
    const extraWagon = page.locator('[data-delivery-kind="extra"] .kb-world-courier-wagon').last();
    assert.match(await extraWagon.evaluate((el) => getComputedStyle(el).backgroundImage), /anim_wagon_stage1\.png/);
    await inspect('main-extra-dispatch-next-word', '.kb-play-paper');
    await typeWords(3);
    assert.equal(await extraProgress.locator('.is-lit').count(), 5);
    await page.keyboard.press("'");
    assert.equal(await extraProgress.locator('.is-lit').count(), 0);
    assert.match(await dispatchHint.innerText(), /積載 4\/5/);
    await inspect('main-dispatch-streak-reset', '.kb-play-paper');
    await typeWords(1);
    assert.match(await dispatchHint.innerText(), /通常便が出発/);
    assert.equal(await extraProgress.locator('.is-lit').count(), 0);
    await inspect('main-regular-dispatch', '.kb-play-paper');
    await page.clock.fastForward(90_000);
    await page.getByTestId('gacha-reveal-card').waitFor();
    await inspect('series-result-animation', 'dialog:modal', true);
    await page.keyboard.press('Escape');
    await inspect('series-result-stamps', '.kb-celebration-banner', false);
    if (scale === '1.3') {
      await page.getByRole('button', { name: /同じ問題でもう一度/ }).tap();
      await start('same-order');
      assert.equal(await typeWords(11), firstWord);
      await page.clock.fastForward(90_000);
      await page.getByTestId('gacha-skip-btn').tap();
      const best = page.getByText(/自己ベスト更新！.*速さ/);
      await best.waitFor();
      await best.evaluate((element) => element.setAttribute('data-ui-inspect', 'best'));
      await inspect('series-personal-best', '[data-ui-inspect="best"]');
      await page.reload({ waitUntil: 'networkidle' });
      await page.keyboard.press('k');
      await page.getByTestId('handbook-group').selectOption('typing');
      await page.getByTestId('handbook-next').tap();
      await page.locator('[data-sheet-id="speed_pb-tier-1"]').tap();
      const speedRecord = page.locator('[data-stamp-id="series-speed_pb_relaxed-1"]');
      await speedRecord.getByText('✓ 獲得', { exact: true }).waitFor();
    }
    if (scale === '1.3') await page.locator('.kb-nav-btn').first().focus();
    await page.keyboard.press('l');
    await page.getByRole('button', { name: '未完成のみ' }).waitFor();
    await page.getByRole('searchbox', { name: 'ことば検索' }).fill(firstWord);
    const masteryCard = page.locator('.kb-word-card').filter({ hasText: '熟練度 銅' }).first();
    assert.match(await masteryCard.getByTestId('word-mastery').innerText(),
      new RegExp(`銀まであと${scale === '1.3' ? 1 : 2}回.*最短`, 's'));
    await masteryCard.scrollIntoViewIfNeeded();
    await masteryCard.evaluate((card) => card.setAttribute('data-ui-inspect', 'dictionary'));
    await inspect('dictionary-mastery', '[data-ui-inspect="dictionary"]', true);
    const sampled = await page.evaluate(() => ({ frames: window.__layoutFrames ?? 0, issues: window.__layoutIssues ? [...window.__layoutIssues.values()] : [] }));
    result.frames += sampled.frames;
    result.issues.push(...sampled.issues);
    assert.equal(result.browserErrors.length, 0, JSON.stringify(result.browserErrors));
  } finally { await context.close(); }
}

try {
  await verifyDetector();
  const scaleArg = process.argv.find((arg) => arg.startsWith('--scale='));
  const scales = scaleArg ? [scaleArg.slice('--scale='.length)] : ['1.0', '1.15', '1.3'];
  assert(scales.every((scale) => ['1.0', '1.15', '1.3'].includes(scale)), 'Unsupported font scale.');
  for (const scale of scales) await scenario(scale);
  const issues = report.scenarios.flatMap((scenario) => scenario.issues);
  assert.equal(issues.length, 0, JSON.stringify(issues, null, 2));
  console.log(`UI layout: ${report.scenarios.length} scales, ${report.scenarios.reduce((n, scenario) => n + scenario.phases.length, 0)} phases; no clipping or covered controls.`);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
