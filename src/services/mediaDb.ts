import { Anime } from '../types';

const DB_NAME = 'listtube-cache-v1';
const STORE_NAME = 'media';
const DB_VERSION = 1;
const MAX_IDB_RECORDS = 10000;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> | null {
  if (!hasIndexedDB()) return null;
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function stripHeavyMediaFields(anime: Anime): Anime {
  return {
    ...anime,
    description: anime.pinned ? anime.description : '',
    similar: [],
    streaming: [],
    characters: undefined,
    staff: undefined,
    openings: undefined,
    endings: undefined,
    scoreStats: undefined,
    statusStats: undefined,
    tags: anime.tags.slice(0, 8),
  };
}

export async function idbLoadAllMedia(): Promise<Anime[]> {
  const p = getDb();
  if (!p) return [];
  try {
    const db = await p;
    return await new Promise<Anime[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Anime[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function idbPutMediaBatch(items: Anime[]): Promise<void> {
  if (items.length === 0) return;
  const p = getDb();
  if (!p) return;
  try {
    const db = await p;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of items) {
        store.put(stripHeavyMediaFields(item));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore IndexedDB write errors */
  }
}

export async function idbPruneExcess(limit = MAX_IDB_RECORDS): Promise<void> {
  const p = getDb();
  if (!p) return;
  try {
    const db = await p;
    const all = await idbLoadAllMedia();
    if (all.length <= limit) return;
    const removable = all
      .filter((a) => !a.pinned)
      .sort((a, b) => (a.fetchedAt ?? 0) - (b.fetchedAt ?? 0));
    const deleteCount = Math.max(0, all.length - limit);
    const toDelete = removable.slice(0, deleteCount);
    if (toDelete.length === 0) return;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of toDelete) {
        store.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export async function idbPruneOlderThanDays(days = 14): Promise<number> {
  const p = getDb();
  if (!p) return 0;
  try {
    const db = await p;
    const all = await idbLoadAllMedia();
    const cutoff = Date.now() - days * 86_400_000;
    const stale = all.filter((a) => !a.pinned && (a.fetchedAt ?? 0) > 0 && a.fetchedAt < cutoff);
    if (stale.length === 0) return 0;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of stale) {
        store.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return stale.length;
  } catch {
    return 0;
  }
}

export async function idbClearAllMedia(): Promise<void> {
  const p = getDb();
  if (!p) return;
  try {
    const db = await p;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
