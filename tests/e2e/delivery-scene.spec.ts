import { expect, test, type Page } from '@playwright/test';
import { beginMain, typeCurrentGuide } from './helpers';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from './keyboard';

async function economy(page: Page, districtId: string) {
  return page.evaluate(async districtId => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('kotobabin', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<{ cityId: string; generated: string; arrived: string; queued: string; districtArrived: string; completed: number }>((resolve, reject) => {
      const tx = db.transaction('profile', 'readonly'); const r = tx.objectStore('profile').get('current');
      tx.oncomplete = () => { const c = r.result.extensions.city; resolve({ cityId: c.cityId, generated: c.generatedMicro, arrived: c.arrivedMicro, queued: c.districts[districtId].queueMicro, districtArrived: c.districts[districtId].arrivedMicro, completed: r.result.progress.totalCompleted }); }; tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }, districtId);
}

for (const reduced of [false, true]) {
  test(`actual dispatch and arrival remain truthful during typing and pause reducedMotion${reduced}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1180, height: 720 }); await page.clock.install(); await page.goto('/');
    await keyboardMenuTo(page, 'settings');
    const font = page.locator('.settings-dialog input[name="fontScale"][value="150"]');
    await keyboardRevealControl(page, font); await tabTo(page, font); await page.keyboard.press('Space');
    if (reduced) {
      const control = page.locator('.settings-dialog input[name="reducedMotion"]');
      await keyboardRevealControl(page, control); await tabTo(page, control); await page.keyboard.press('Space'); await expect(control).toBeChecked();
    }
    const live = page.locator('.settings-dialog input[name="achievement-notifications"][value="live"]');
    await keyboardRevealControl(page, live); await tabTo(page, live); await page.keyboard.press('Space'); await expect(live).toBeChecked();
    await page.keyboard.press('Escape'); await beginMain(page, { fromHome: true });
    const scene = page.locator('#delivery-scene'); await expect(scene).toBeVisible();
    const districtId = (await scene.getAttribute('data-destination'))!; expect(districtId).toBeTruthy();
    const initial = await economy(page, districtId);
    for (let word = 0; word < 5; word++) {
      await typeCurrentGuide(page);
      if (word === 0) {
        await expect(page.locator('.achievement-live')).toBeVisible();
        const covered = await page.evaluate(() => {
          const notice = document.querySelector('.achievement-live')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>('#game-input,#deliver-button,#completed-count,[data-action="guide"],#prompt-word,#prompt-reading,#romaji-guide')]
            .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
            .map(element => ({ id: element.id || element.dataset.action, r: element.getBoundingClientRect() }))
            .filter(({ r }) => Math.min(r.right, notice.right) - Math.max(r.left, notice.left) > 1 && Math.min(r.bottom, notice.bottom) - Math.max(r.top, notice.top) > 1)
            .map(({ id, r }) => ({ id, x: r.x, y: r.y, width: r.width, height: r.height }));
        });
        expect(covered, 'The earned-stamp notice must not cover typing, delivery, guide or current progress.').toEqual([]);
      }
    }
    await expect(scene).toHaveAttribute('data-words', '5'); await expect(scene).toHaveAttribute('data-dispatches', '1');
    await expect.poll(async () => BigInt((await scene.getAttribute('data-queued-micro'))!)).toBeGreaterThan(0n);
    const moving = scene.locator('[data-delivery-transport][data-state="in-transit"]').first();
    await expect(moving).toBeVisible();
    const initialVehicle = await moving.evaluate(element => ({ id: element.getAttribute('data-effect-id'), x: element.getBoundingClientRect().x }));
    expect(initialVehicle.id).toBeTruthy();
    const transport = scene.locator(`[data-delivery-transport][data-effect-id=${JSON.stringify(initialVehicle.id)}]`);
    const startX = initialVehicle.x;
    const vehicleNode = await transport.elementHandle();
    await page.clock.runFor(500);
    const progressed = await transport.evaluate(element => ({ state: element.getAttribute('data-state'), x: element.getBoundingClientRect().x }));
    if (reduced && progressed.state === 'in-transit') {
      expect(progressed.x).toBeCloseTo(startX, 0);
    } else {
      await expect.poll(async () => (await transport.boundingBox())!.x).toBeGreaterThan(startX);
    }
    await expect(transport).toHaveAttribute('data-from', 'warehouse'); await expect(transport).toHaveAttribute('data-to', districtId);
    await expect(page.locator('#game-input')).toBeFocused();
    // The sixth real word must remain playable while the actual aggregate queue is moving.
    await typeCurrentGuide(page); await expect(page.locator('#completed-count')).toHaveText('完成 6語');
    await expect(page.locator('#game-input')).toBeFocused(); await expect(page.locator('#paused-layer')).toBeHidden();
    await assertViewportFits(page); await page.screenshot({ path: testInfo.outputPath('actual-transport-while-typing.png') });
    await expect.poll(async () => (await economy(page, districtId)).completed).toBe(6);
    const generated = BigInt((await economy(page, districtId)).generated); expect(generated).toBeGreaterThan(BigInt(initial.generated));
    const score = await page.locator('#score').textContent();
    const wordEffect = scene.locator('[data-delivery-effect="word"]'); const dispatchEffect = scene.locator('[data-delivery-effect="dispatch"]');
    await expect(wordEffect).toHaveCount(1); await expect(dispatchEffect).toHaveCount(1);
    const issued = { word: await wordEffect.getAttribute('data-effect-id'), dispatch: await dispatchEffect.getAttribute('data-effect-id') };
    const wordNode = await wordEffect.elementHandle(); const dispatchNode = await dispatchEffect.elementHandle();
    await page.keyboard.press('Escape'); await expect(page.locator('#paused-layer')).toBeVisible();
    const remaining = await page.locator('#time-left').textContent();
    // City transport uses elapsed wall time even though the typing clock is paused.
    await page.clock.runFor(180000);
    await expect(transport).toHaveAttribute('data-state', 'arrived');
    await expect(scene).toHaveAttribute('data-queued-micro', '0');
    await expect.poll(async () => Number(await scene.getAttribute('data-arrival-revision'))).toBeGreaterThan(0);
    await expect(scene).toHaveAttribute('data-words', '6'); await expect(scene).toHaveAttribute('data-dispatches', '1');
    const effectIds = await scene.locator('[data-delivery-transport]').evaluateAll(elements => elements.map(element => element.getAttribute('data-effect-id')));
    expect(new Set(effectIds).size).toBe(effectIds.length);
    await expect(wordEffect).toHaveAttribute('data-effect-id', issued.word!); await expect(dispatchEffect).toHaveAttribute('data-effect-id', issued.dispatch!);
    expect(await vehicleNode!.evaluate(node => node.isConnected)).toBe(true);
    expect(await wordNode!.evaluate(node => node.isConnected)).toBe(true); expect(await dispatchNode!.evaluate(node => node.isConnected)).toBe(true);
    await expect(page.locator('#time-left')).toHaveText(remaining!); await expect(page.locator('#score')).toHaveText(score!);
    await expect(page.locator('#completed-count')).toHaveText('完成 6語');
    await expect.poll(async () => (await economy(page, districtId)).queued).toBe('0');
    const arrived = await economy(page, districtId); expect(arrived.generated).toBe(String(generated));
    expect(BigInt(arrived.districtArrived) - BigInt(initial.districtArrived)).toBe(generated - BigInt(initial.generated));
    expect(arrived.completed).toBe(6); expect(arrived.cityId).toBe(initial.cityId);
    expect(await scene.getAttribute('data-arrived-micro')).toBe(arrived.districtArrived);
    await assertViewportFits(page); await page.screenshot({ path: testInfo.outputPath('actual-arrival-while-paused.png') });
    await tabTo(page, page.locator('#paused-layer [data-action="resume"]')); await page.keyboard.press('Enter');
    await expect(page.locator('#game-input')).toBeFocused(); await typeCurrentGuide(page);
    await expect(page.locator('#completed-count')).toHaveText('完成 7語');
  });
}
