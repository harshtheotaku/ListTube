import { Anime } from '../types';
import {
  idbClearAllMedia,
  idbLoadAllMedia,
  idbPruneExcess,
  idbPutMediaBatch,
  stripHeavyMediaFields,
} from './mediaDb';

const KEY = 'anitube.anime.v2';
const LEGACY_KEY = 'anitube.anime.v1';
const PINNED_LS_FALLBACK_LIMIT = 400;

function loadPinnedSync(): Map<string, Anime> {
  const map = new Map<string, Anime>();
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, Anime>;
    for (const [id, item] of Object.entries(parsed)) {
      if (item && typeof item === 'object' && item.id && item.title) {
        map.set(id, { ...item, mediaType: item.mediaType ?? 'ANIME' });
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

const store = loadPinnedSync();
const dirtyQueue = new Map<string, Anime>();
const hydrationListeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydratedFromIdb = false;

function notifyHydration() {
  hydrationListeners.forEach((l) => l());
}

/**
 * Keeps only lightweight pinned records in localStorage so synchronous initial paint
 * never loses user list covers, while full 10,000+ record cache lives in IndexedDB.
 */
function flushFallbackPinnedToLocalStorage() {
  try {
    const pinned = [...store.entries()]
      .filter(([, a]) => a.pinned)
      .slice(0, PINNED_LS_FALLBACK_LIMIT)
      .map(([id, a]) => [id, stripHeavyMediaFields(a)]);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(pinned)));
    if (localStorage.getItem(LEGACY_KEY)) localStorage.removeItem(LEGACY_KEY);
  } catch {
    try {
      localStorage.setItem(KEY, '{}');
    } catch {
      /* ignore */
    }
  }
}

function schedulePersist(items: Anime[]): void {
  for (const item of items) {
    dirtyQueue.set(item.id, item);
  }
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = [...dirtyQueue.values()];
    dirtyQueue.clear();
    void idbPutMediaBatch(batch).then(() => idbPruneExcess());
    flushFallbackPinnedToLocalStorage();
  }, 350);
}

let idbBootPromise: Promise<void> | null = null;

export function bootstrapMediaDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    hydratedFromIdb = true;
    return Promise.resolve();
  }
  if (idbBootPromise) return idbBootPromise;
  idbBootPromise = (async () => {
    const existingSync = [...store.values()];
    const idbItems = await idbLoadAllMedia();
    let added = false;
    for (const item of idbItems) {
      if (!item?.id || !item?.title) continue;
      const prev = store.get(item.id);
      if (!prev || (!prev.pinned && item.pinned)) {
        store.set(item.id, prev?.pinned ? { ...item, pinned: true } : item);
        added = true;
      }
    }
    // Seed any pre-existing localStorage entries into IndexedDB once
    if (existingSync.length > 0 && idbItems.length === 0) {
      await idbPutMediaBatch(existingSync);
      flushFallbackPinnedToLocalStorage();
    }
    hydratedFromIdb = true;
    if (added) notifyHydration();
  })();
  return idbBootPromise;
}

if (typeof window !== 'undefined') {
  void bootstrapMediaDb();
}

export const animeStore = {
  isHydrated(): boolean {
    return hydratedFromIdb;
  },

  subscribeHydration(listener: () => void): () => void {
    hydrationListeners.add(listener);
    return () => hydrationListeners.delete(listener);
  },

  get(id: string): Anime | undefined {
    return store.get(id);
  },

  has(id: string): boolean {
    return store.has(id);
  },

  size(): number {
    return store.size;
  },

  remember(anime: Anime, options?: { compact?: boolean }): Anime {
    const existing = store.get(anime.id);
    const compactRequested = Boolean(options?.compact);

    if (existing?.description && existing?.hasOfficialBanner && compactRequested) {
      return existing;
    }
    if (
      existing &&
      existing.fetchedAt >= anime.fetchedAt &&
      existing.description &&
      existing.hasOfficialBanner &&
      (!anime.characters?.length || existing.characters?.length)
    ) {
      return existing;
    }

    const base = compactRequested ? stripHeavyMediaFields(anime) : anime;
    const next: Anime = {
      ...base,
      pinned: Boolean(existing?.pinned || base.pinned),
      characters: base.characters ?? existing?.characters,
      staff: base.staff ?? existing?.staff,
      openings: base.openings ?? existing?.openings,
      endings: base.endings ?? existing?.endings,
      scoreStats: base.scoreStats ?? existing?.scoreStats,
      statusStats: base.statusStats ?? existing?.statusStats,
    };
    store.set(anime.id, next);
    schedulePersist([next]);
    return next;
  },

  rememberMany(list: Anime[]): void {
    const changed: Anime[] = [];
    for (const anime of list) {
      const existing = store.get(anime.id);
      if (
        !existing ||
        (!existing.hasOfficialBanner && anime.hasOfficialBanner) ||
        (!existing.hasWideBanner && anime.hasWideBanner) ||
        (!existing.trailerYoutubeId && anime.trailerYoutubeId)
      ) {
        const merged = existing?.pinned ? { ...anime, pinned: true } : anime;
        store.set(anime.id, merged);
        changed.push(merged);
      }
    }
    if (changed.length > 0) schedulePersist(changed);
  },

  rememberImported(list: Anime[]): void {
    const batch: Anime[] = [];
    for (const anime of list) {
      const existing = store.get(anime.id);
      const next: Anime =
        existing?.description && existing?.hasOfficialBanner
          ? { ...existing, pinned: true }
          : { ...stripHeavyMediaFields(anime), pinned: true };
      store.set(anime.id, next);
      batch.push(next);
    }
    if (batch.length > 0) schedulePersist(batch);
  },

  pin(id: string): void {
    const anime = store.get(id);
    if (!anime || anime.pinned) return;
    const next = { ...anime, pinned: true };
    store.set(id, next);
    schedulePersist([next]);
  },

  all(): Anime[] {
    return [...store.values()];
  },

  clearUnpinned(): void {
    const pinnedOnly: Anime[] = [];
    for (const [id, anime] of store.entries()) {
      if (!anime.pinned) store.delete(id);
      else pinnedOnly.push(anime);
    }
    dirtyQueue.clear();
    void idbClearAllMedia().then(() => idbPutMediaBatch(pinnedOnly));
    flushFallbackPinnedToLocalStorage();
  },

  clear(): void {
    store.clear();
    dirtyQueue.clear();
    void idbClearAllMedia();
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  },
};
