/* global document, AudioContext */
import process from 'node:process';
import { firefox } from 'playwright';

// Infrastructure diagnostic only: real Web Audio + native gesture, no replacement context or fake sink.
const browser = await firefox.launch();
const page = await browser.newPage();
const events = [];
page.on('console', message => events.push({ type: message.type(), text: message.text() }));
page.on('pageerror', error => events.push({ type: 'pageerror', text: error.message }));
await page.setContent('<button id="start">Start native audio health check</button>');
await page.evaluate(() => {
  globalThis.audioHealth = { constructor: null, initial: null, resumed: null, error: null, complete: false };
  document.querySelector('#start').addEventListener('click', async () => {
    const report = globalThis.audioHealth;
    try {
      const context = new AudioContext(); report.constructor = true; report.initial = context.state;
      await context.resume(); report.resumed = context.state;
      const source = context.createOscillator(); source.connect(context.destination); source.start(); source.stop(context.currentTime + .01);
      await context.close();
    } catch (error) { report.error = { name: error.name, message: error.message }; }
    report.complete = true;
  });
});
await page.locator('#start').click();
await page.waitForFunction(() => globalThis.audioHealth.complete, undefined, { timeout: 5000 }).catch(() => {});
const health = await page.evaluate(() => globalThis.audioHealth);
process.stdout.write(`${JSON.stringify({ browser: browser.version(), nativeAudioHealth: health, events })}\n`);
await browser.close();
