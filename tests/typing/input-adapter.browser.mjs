/* global console, process, window, document, KeyboardEvent, InputEvent, URL */
// Run with node tests/typing/input-adapter.browser.mjs. Uses browser-native input,
// including trusted composition events via CDP; does not substitute for OS IME QA.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${address.port}`;
  await page.route(`${origin}/adapter-test`, (route) => route.fulfill({ contentType: 'text/html', body: '<input id="input"><button id="other">Other</button>' }));
  await page.goto(`${origin}/adapter-test`);
  await page.evaluate(async () => {
    const { InputAdapter } = await import('/src/typing/InputAdapter.ts');
    window.log = [];
    window.adapter = new InputAdapter(document.querySelector('input'), {
      onCharacter: (key, time) => window.log.push(['char', key, time]),
      onDeliver: (time) => window.log.push(['delivery', time]),
      onPause: (reason, time) => window.log.push(['pause', reason, time]),
      onInputCheckRequired: (reason, time) => window.log.push(['check', reason, time]),
    });
  });
  await page.locator('input').focus();
  await page.keyboard.type('Neko');
  await page.keyboard.press('Space');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Digit1');
  const log = await page.evaluate(() => window.log);
  assert.equal(log.filter((event) => event[0] === 'char').map((event) => event[1]).join(''), 'neko');
  assert.equal(log.filter((event) => event[0] === 'delivery').length, 1);
  assert.equal(log.some((event) => event[0] === 'check'), false);
  await page.evaluate(() => {
    const input = document.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
    input.value = 'a';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a', bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.log.filter((event) => event[0] === 'char').length), 4);
  await page.locator('#other').focus();
  assert.equal(await page.evaluate(() => window.log.some((event) => event[0] === 'pause' && event[1] === 'blur')), true);
  await page.locator('input').focus();
  await page.evaluate(() => { window.adapter.resetAfterInputCheck(); window.log = []; });
  await page.keyboard.down('a');
  await page.keyboard.down('a');
  await page.keyboard.up('a');
  assert.equal(await page.evaluate(() => window.log.filter((event) => event[0] === 'char').length), 1);
  await page.evaluate(() => { window.log = []; });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'あ', selectionStart: 1, selectionEnd: 1 });
  await page.keyboard.press('Enter');
  const ime = await page.evaluate(() => window.log);
  assert.equal(ime.some((event) => event[0] === 'char' || event[0] === 'delivery'), false);
  assert.equal(ime.some((event) => event[0] === 'check' && event[1] === 'ime'), true);
  console.log('PASS: native ASCII, delivery, unsupported keys, synthetic rejection, blur, repeat, CDP composition, composition Enter');
} finally {
  await browser.close();
  await server.close();
}
