import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPlayer, listPlayers, playerStorageKey, renamePlayer } from '@/progression/playerRegistry';

describe('player registry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renames players from the old registry without changing their save keys', async () => {
    const idb = new IDBFactory();
    vi.stubGlobal('indexedDB', idb);
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = idb.open('kotobabin-players', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: true });
        store.add({ name: '別のプレイヤー' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    legacy.close();

    const before = await listPlayers();
    expect(before).toEqual([{ id: 0, name: 'プレイヤー1' }, { id: 1, name: '別のプレイヤー' }]);
    await expect(renamePlayer(0, '  配達係  ')).resolves.toEqual({ id: 0, name: '配達係' });
    await expect(renamePlayer(0, '別のプレイヤー')).rejects.toMatchObject({ name: 'ConstraintError' });
    await expect(renamePlayer(1, 'プレイヤー1')).resolves.toEqual({ id: 1, name: 'プレイヤー1' });
    const renamed = await listPlayers();
    expect(renamed.map(({ name }) => name)).toEqual(['配達係', 'プレイヤー1']);
    expect(renamed.map(({ id }) => playerStorageKey('kotobabin', id))).toEqual(['kotobabin', 'kotobabin:player-1']);
    await expect(addPlayer('3人目')).resolves.toEqual({ id: 2, name: '3人目' });
  });
});
