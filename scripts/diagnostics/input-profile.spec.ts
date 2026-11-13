import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decode } from '@jridgewell/sourcemap-codec';
import { beginMain } from '../../tests/e2e/helpers';
import type { ProfileDocument } from '../../src/profile/repository';

// CPU sampling is diagnostic only; acceptance uses its untouched independent test.
test('profile the confirmed native input call chain in the populated production build', async ({ page }, info) => {
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
  let keys = 0;
  for (let word = 0; word < 48 || keys < 240; word++) {
    const guide = (await page.locator('#romaji-guide > span:not(.accepted)').allTextContents()).join('');
    expect(guide.length).toBeGreaterThan(0); await page.keyboard.type(guide, { delay: 12 }); keys += guide.length;
    if (word % 8 === 2) await page.keyboard.press('Space');
  }
  const { profile } = await cdp.send('Profiler.stop');
  const counts = new Map<number, number>();
  for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of profile.nodes) for (const id of node.children ?? []) parents.set(id, node.id);
  const maps = new Map(readdirSync('dist/assets').filter(name => name.endsWith('.js.map')).map(name => {
    const map = JSON.parse(readFileSync(path.join('dist/assets', name), 'utf8')) as { mappings: string; sources: string[]; names: string[] };
    return [name.slice(0, -4), { ...map, decoded: decode(map.mappings) }];
  }));
  const locate = (node: typeof profile.nodes[number]) => {
    const frame = node.callFrame; const map = maps.get(frame.url.split('/').at(-1)!);
    const segments = map?.decoded[frame.lineNumber];
    const segment = segments?.filter(value => value[0] <= frame.columnNumber).at(-1);
    if (map && segment && segment.length >= 4) return `${(segment.length >= 5 ? map.names[segment[4]!] : '') || frame.functionName || '(anonymous)'} @ ${map.sources[segment[1]!]!}:${segment[2]! + 1}`;
    return `${frame.functionName || '(anonymous)'} @ ${frame.url}:${frame.lineNumber + 1}`;
  };
  const top = profile.nodes.map(node => {
    let id: number | undefined = node.id; const stack: string[] = [];
    for (let depth = 0; depth < 9 && id !== undefined; depth++, id = parents.get(id)) stack.push(locate(nodes.get(id)!));
    return { samples: counts.get(node.id) ?? 0, stack };
  }).sort((a, b) => b.samples - a.samples).slice(0, 35);
  await mkdir(info.outputDir, { recursive: true });
  await writeFile(info.outputPath('input.cpuprofile'), JSON.stringify(profile));
  await writeFile(info.outputPath('summary.json'), JSON.stringify({ keys, top }, null, 2));
  console.log('INPUT_CPU_PROFILE', JSON.stringify({ keys, top }));
});
