export interface LocalPlayer {
  id: number;
  name: string;
}

export const DEFAULT_PLAYER: LocalPlayer = { id: 0, name: 'プレイヤー1' };
export const MAX_PLAYER_NAME_LENGTH = 20;

export function playerStorageKey(key: string, id = DEFAULT_PLAYER.id): string {
  return id ? `${key}:player-${id}` : key;
}

async function usePlayers<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kotobabin-players', 2);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        const store = request.result.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: true });
        store.add(DEFAULT_PLAYER);
        return;
      }
      const store = request.transaction!.objectStore('players');
      const existing = store.index('name').getKey(DEFAULT_PLAYER.name);
      existing.onsuccess = () => {
        if (existing.result === undefined) store.add(DEFAULT_PLAYER);
      };
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
  const players = await usePlayers<LocalPlayer[]>('readonly', (store) => store.getAll());
  return players.some(({ id }) => id === DEFAULT_PLAYER.id) ? players : [DEFAULT_PLAYER, ...players];
}

export async function addPlayer(name: string): Promise<LocalPlayer> {
  const trimmed = validPlayerName(name);
  const id = await usePlayers('readwrite', (store) => store.add({ name: trimmed }));
  return { id: Number(id), name: trimmed };
}

export async function renamePlayer(id: number, name: string): Promise<LocalPlayer> {
  const player = { id, name: validPlayerName(name) };
  await usePlayers('readwrite', (store) => store.put(player));
  return player;
}

function validPlayerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PLAYER_NAME_LENGTH) throw new RangeError('Invalid player name');
  return trimmed;
}
