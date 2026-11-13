import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CityCommand, DistrictId } from '../../../src/economy';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProfileDocument } from '../../../src/profile/repository';
import { assertViewportFits, keyboardMenuTo, keyboardRevealControl, tabTo } from '../keyboard';
const bundle=join(mkdtempSync(join(tmpdir(),'kotobabin-m6-')), 'public-api.cjs');
buildSync({entryPoints:[new URL('./engine.fixture.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',outfile:bundle});
const {CityEconomy,decodeCityState,encodeCityState,executeCityCommand,createProfileDocument,districts,finalCityFixture}=createRequire(import.meta.url)(bundle) as typeof import('./engine.fixture');

async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('kotobabin', 4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    try { return await new Promise<ProfileDocument>((resolve,reject)=>{const tx=db.transaction('profile','readonly');const r=tx.objectStore('profile').get('current');tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);}); }finally{db.close();}
  });
}
async function activate(page: Page, target: Locator) {
  await keyboardRevealControl(page,target);await expect(target).toBeEnabled();await tabTo(page,target);await page.keyboard.press('Enter');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state','saved');
}
async function fixture(page: Page) {
  // New Playwright context, app never opened before setup. SVG document shares
  // origin but runs no game script, so there is no competing repository owner.
  await page.goto('/assets/shared_frame/memorial_frame.svg');
  const document=createProfileDocument();document.extensions.city=finalCityFixture(Date.now());
  await page.evaluate(async document=>{
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('kotobabin',4);request.onupgradeneeded=()=>request.result.createObjectStore('profile');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('profile','readwrite');tx.objectStore('profile').put(document,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
  },document);
  await page.goto('/');await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership','owner');
  await expect(page.locator('#save-status')).toHaveAttribute('data-save-state','saved');
}
function economic(encoded: unknown) {
  const state=decodeCityState(encoded);const result=encodeCityState(state);
  // Wall-clock ownership/save bookkeeping is intentionally outside economic replay.
  return {...result,savedWallMs:0};
}
async function replay(page: Page,before: ProfileDocument,expectedCount: number) {
  const after=await saved(page);const start=decodeCityState(before.extensions.city);const end=decodeCityState(after.extensions.city);
  const commands=Object.entries(end.commandLedger).filter(([key])=>!start.commandLedger[key]).map(([,payload])=>JSON.parse(payload) as CityCommand);
  expect(commands).toHaveLength(expectedCount);const model=new CityEconomy(start);
  for(const command of commands)expect(executeCityCommand(model,command).applied).toBe(true);
  model.advanceTo(end.clockMs);expect(economic(encodeCityState(model.snapshot()))).toEqual(economic(after.extensions.city));
  const exact=encodeCityState(model.snapshot());for(const command of commands)expect(executeCityCommand(model,command)).toMatchObject({applied:false,reason:'duplicate'});
  expect(encodeCityState(model.snapshot())).toEqual(exact);expect(after.progress).toEqual(before.progress);return after;
}
async function district(page: Page,id: DistrictId) {
  await keyboardMenuTo(page,'home');await activate(page,page.locator(`.world-stage [data-action="city-district"][data-district-id="${id}"]`));
  await expect(page.locator(`.district-map[data-district-id="${id}"]`)).toBeVisible();await assertViewportFits(page);
}
async function feature(page: Page,id: DistrictId,name:string) {
  await activate(page,page.locator(`.district-map[data-district-id="${id}"] [data-feature="${name}"]`));
}
async function artwork(page: Page,selector:string,id:DistrictId) {
  const core=page.locator(`${selector} [data-district-core="${id}"]`);await expect(core).toHaveAttribute('data-stage','5');
  const image=core.locator('image');await expect(image).toHaveAttribute('href',new RegExp(`/city_stage/city_${id}_s5\\.webp$`));
  const href=await image.getAttribute('href');
  const size=await page.evaluate(async href=>{const response=await fetch(href!);if(!response.ok)throw new Error(`Art response ${response.status}`);const image=await createImageBitmap(await response.blob());return[image.width,image.height];},href);
  expect(size).toEqual([1024,768]);await expect(image).toBeVisible();
}

test('production keyboard journey finishes all six cities, all railways and research5, then restarts and restores its UI backup',async({page},testInfo)=>{
  await fixture(page);const baseline=await saved(page);expect(baseline.progress.totalCompleted).toBe(0);
  const initial=decodeCityState(baseline.extensions.city);expect(initial.blueprints).toBeGreaterThanOrEqual(45);
  for(const id of districts){expect(initial.districts[id].stage).toBe(4);expect(initial.districts[id].railway).toBe(false);}
  for(const id of districts){
    await district(page,id);await feature(page,id,'plan');const before=await saved(page);
    await activate(page,page.locator('[data-action="city-start-plan"]'));
    await expect(page.locator('#district-stage')).toHaveText('5/5');await expect(page.locator('[data-action="city-start-plan"]')).toHaveCount(0);
    await replay(page,before,1);await artwork(page,'.district-map',id);await assertViewportFits(page);
    await page.screenshot({path:testInfo.outputPath(`${id}-stage5.png`)});
    await feature(page,id,'railway');const railBefore=await saved(page);await activate(page,page.locator('[data-action="city-buy-railway"]'));
    await expect(page.locator('.district-map [data-visual-feature="railway"]')).toHaveAttribute('data-owned','true');
    await expect(page.locator('[data-action="city-buy-railway"]')).toBeDisabled();await replay(page,railBefore,1);
  }
  await feature(page,'harbor','research');
  for(const [index,kind] of ['materials','logistics','commerce'].entries()){
    const select=page.locator('#special-equipment-item');await tabTo(page,select);
    await page.keyboard.press('Home');await expect(select).toHaveValue('materials');await expect(select).toBeFocused();
    for(let i=0;i<index;i++){
      await page.keyboard.press('ArrowDown');await expect(select).toHaveValue(['materials','logistics','commerce'][i+1]);
      // The next native key must reach the same logical select after its panel updates.
      // Re-tabbing here would hide the observed product focus-loss defect.
      await expect(select).toBeFocused();
    }
    await page.keyboard.press('Enter');await expect(select).toHaveValue(kind);
    const button=page.locator(`[data-action="city-buy-research"][data-research-kind="${kind}"]`);
    for(let rank=1;rank<=5;rank++){
      const before=await saved(page);await activate(page,button);await expect(page.locator('.district-map [data-visual-feature="research"]')).toHaveAttribute(`data-${kind}`,String(rank));await replay(page,before,1);
    }
    await expect(button).toBeDisabled();await expect(button).toHaveText('研究完了');
  }
  await keyboardMenuTo(page,'home');
  for(const id of districts)await artwork(page,'.world-stage',id);
  await expect(page.locator('.world-stage .city-route.railway')).toHaveCount(6);await assertViewportFits(page);
  await page.screenshot({path:testInfo.outputPath('six-stage5-railway-world.png')});
  await keyboardMenuTo(page,'settings');const exportButton=page.locator('.settings-dialog [data-action="export-data"]');
  await keyboardRevealControl(page,exportButton);await tabTo(page,exportButton);const downloadPromise=page.waitForEvent('download');await page.keyboard.press('Enter');const download=await downloadPromise;
  const path=testInfo.outputPath('mature-city-ui-backup.json');await download.saveAs(path);const backup=JSON.parse(await readFile(path,'utf8'));const exported=backup.repository.current as ProfileDocument;
  expect(decodeCityState(exported.extensions.city).research).toEqual({materials:5,logistics:5,commerce:5});
  await page.keyboard.press('Escape');await district(page,'harbor');await activate(page,page.locator('[data-action="new-city"]'));
  const dialog=page.locator('.restart-dialog');await expect(dialog).toBeVisible();const beforeRestart=await saved(page);
  const landscape=dialog.locator('#restart-landscape');await keyboardRevealControl(page,landscape);await tabTo(page,landscape);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await activate(page,dialog.locator('[data-action="confirm-city-restart"]'));await expect(dialog).toBeHidden();
  const restarted=await replay(page,beforeRestart,1);const newCity=decodeCityState(restarted.extensions.city);expect(newCity.cityId).not.toBe(initial.cityId);expect(newCity.landscape).toBe('seaside');
  expect(newCity.research).toEqual({materials:5,logistics:5,commerce:5});expect(newCity.cityArrivedMicro).toBe(0n);expect(newCity.packagingLevel).toBe(0);
  for(const id of districts){expect(newCity.districts[id].railway).toBe(false);expect(newCity.districts[id].stage).toBe(0);}
  expect(newCity.blueprints).toBeGreaterThan(decodeCityState(beforeRestart.extensions.city).blueprints);await assertViewportFits(page);
  await keyboardMenuTo(page,'settings');const summary=page.locator('.settings-dialog .profile-management > summary');await activate(page,summary);
  const input=page.locator('#profile-backup-file');await keyboardRevealControl(page,input);await tabTo(page,input);
  // File chooser is an OS boundary: activate with Enter, then provide the exact UI-downloaded file.
  const chooserPromise=page.waitForEvent('filechooser');await page.keyboard.press('Enter');const chooser=await chooserPromise;await chooser.setFiles(path);
  const confirmation=page.locator('.profile-confirm-dialog');await expect(confirmation).toBeVisible();await expect(confirmation.locator('[data-action="cancel-profile-operation"]')).toBeFocused();
  await activate(page,confirmation.locator('[data-action="confirm-profile-restore"]'));await expect(page.locator('#profile-operation-notice')).toContainText('復元しました');
  const restored=await saved(page);expect(restored.metadata.generation).toBe(restarted.metadata.generation+1);expect(restored.progress).toEqual(exported.progress);
  const restoredCity=decodeCityState(restored.extensions.city);const expected=new CityEconomy(decodeCityState(exported.extensions.city));expected.advanceTo(restoredCity.clockMs);
  expect(economic(restored.extensions.city)).toEqual(economic(encodeCityState(expected.snapshot())));
  const beforeReload=await saved(page);
  await page.reload();await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership','readonly');
  // A new document has a new owner identity. Preserve the existing explicit
  // handoff contract rather than silently claiming the former document's epoch.
  const reopened=await saved(page);
  expect(reopened.metadata.ownerTabId).toBe(beforeReload.metadata.ownerTabId);
  expect(reopened.metadata.writeEpoch).toBe(beforeReload.metadata.writeEpoch);
  expect(reopened.metadata.generation).toBe(beforeReload.metadata.generation);
  expect(reopened.progress).toEqual(beforeReload.progress);
  expect(reopened.extensions.achievements).toEqual(beforeReload.extensions.achievements);
  const reopenModel=new CityEconomy(decodeCityState(beforeReload.extensions.city));
  reopenModel.advanceTo(decodeCityState(reopened.extensions.city).clockMs);
  expect(economic(reopened.extensions.city)).toEqual(economic(encodeCityState(reopenModel.snapshot())));
  // No forced focus, programmatic repository takeover or pointer operation.
  await activate(page,page.locator('#ownership-status [data-action="takeover"]'));
  await expect(page.locator('#ownership-status')).toHaveAttribute('data-ownership','owner');
  const claimed=await saved(page);
  expect(claimed.metadata.ownerTabId).not.toBe(reopened.metadata.ownerTabId);
  expect(claimed.metadata.writeEpoch).toBe(reopened.metadata.writeEpoch+1);
  expect(claimed.metadata.generation).toBe(reopened.metadata.generation);
  expect(claimed.progress).toEqual(reopened.progress);
  const handoffModel=new CityEconomy(decodeCityState(reopened.extensions.city));
  handoffModel.advanceTo(decodeCityState(claimed.extensions.city).clockMs);
  expect(economic(claimed.extensions.city)).toEqual(economic(encodeCityState(handoffModel.snapshot())));
  for(const id of districts)await artwork(page,'.world-stage',id);await expect(page.locator('.world-stage .city-route.railway')).toHaveCount(6);
  expect(decodeCityState((await saved(page)).extensions.city).research).toEqual({materials:5,logistics:5,commerce:5});await assertViewportFits(page);
});
