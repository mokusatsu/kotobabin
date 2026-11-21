export interface LocalPlayer {
  id: number;
  name: string;
}

export const DEFAULT_PLAYER: LocalPlayer = { id: 0, name: 'プレイヤー1' };

export function playerStorageKey(key: string, id = DEFAULT_PLAYER.id): string {
  return id ? `${key}:player-${id}` : key;
}

async function usePlayers<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kotobabin-players', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
      store.createIndex('name', 'name', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('players', mode);
      const request = operation(transaction.objectStore('players'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error('Player storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listPlayers(): Promise<LocalPlayer[]> {
  const added = await usePlayers<LocalPlayer[]>('readonly', (store) => store.getAll());
  return [DEFAULT_PLAYER, ...added];
}

export async function addPlayer(name: string): Promise<LocalPlayer> {
  const id = await usePlayers('readwrite', (store) => store.add({ name }));
  return { id: Number(id), name };
}
