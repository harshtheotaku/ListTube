import { Anime } from '../types';

const KEY = 'anitube.anime.v2';
const LEGACY_KEY = 'anitube.anime.v1';
const LIMIT = 1200;

function load(): Map<string, Anime> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Anime>;
      return new Map(Object.entries(parsed));
    }
    // Migrate only pinned entries from v1 so stale unpinned entries re-fetch crisp official artwork
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Record<string, Anime>;
      const migrated = new Map<string, Anime>();
      for (const [id, item] of Object.entries(parsed)) {
        if (item.pinned) {
          migrated.set(id, { ...item, mediaType: item.mediaType ?? 'ANIME' });
        }
      }
      return migrated;
    }
    return new Map();
  } catch {
    return new Map();
  }
}

const store = load();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function compact(anime: Anime): Anime {
  return {
    ...anime,
    description: '',
    similar: [],
    streaming: [],
    tags: anime.tags.slice(0, 8),
  };
}

function entriesToPersist(): [string, Anime][] {
  const entries = [...store.entries()];
  if (entries.length <= LIMIT) return entries;

  const pinned = entries.filter(([, anime]) => anime.pinned);
  const rest = entries.filter(([, anime]) => !anime.pinned);
  const room = Math.max(0, LIMIT - pinned.length);
  const kept = rest.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, room);
  return [...kept, ...pinned];
}

function persist(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entriesToPersist())));
    } catch {
      try {
        const pinned = [...store.entries()].filter(([, anime]) => anime.pinned);
        const rest = [...store.entries()]
          .filter(([, anime]) => !anime.pinned)
          .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
          .slice(0, Math.max(40, Math.floor((LIMIT - pinned.length) / 2)));
        localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...rest, ...pinned])));
      } catch {
        try {
          localStorage.setItem(KEY, '{}');
        } catch {
          /* storage unavailable */
        }
      }
    }
  }, 400);
}

export const animeStore = {
  get(id: string): Anime | undefined {
    return store.get(id);
  },

  has(id: string): boolean {
    return store.has(id);
  },

  remember(anime: Anime, options?: { compact?: boolean }): Anime {
    const existing = store.get(anime.id);
    const compactRequested = Boolean(options?.compact);

    if (existing?.description && existing?.hasOfficialBanner && compactRequested) return existing;
    if (
      existing &&
      existing.fetchedAt >= anime.fetchedAt &&
      existing.description &&
      existing.hasOfficialBanner
    ) {
      return existing;
    }

    const next = compactRequested ? compact(anime) : anime;
    store.set(anime.id, existing?.pinned ? { ...next, pinned: true } : next);
    persist();
    return next;
  },

  rememberMany(list: Anime[]): void {
    let changed = false;
    for (const anime of list) {
      const existing = store.get(anime.id);
      if (
        !existing ||
        (!existing.hasOfficialBanner && anime.hasOfficialBanner) ||
        (!existing.hasWideBanner && anime.hasWideBanner) ||
        (!existing.trailerYoutubeId && anime.trailerYoutubeId)
      ) {
        store.set(anime.id, existing?.pinned ? { ...anime, pinned: true } : anime);
        changed = true;
      }
    }
    if (changed) persist();
  },

  rememberImported(list: Anime[]): void {
    for (const anime of list) {
      const existing = store.get(anime.id);
      if (existing?.description && existing?.hasOfficialBanner) {
        store.set(anime.id, { ...existing, pinned: true });
      } else {
        store.set(anime.id, { ...compact(anime), pinned: true });
      }
    }
    persist();
  },

  pin(id: string): void {
    const anime = store.get(id);
    if (!anime || anime.pinned) return;
    store.set(id, { ...anime, pinned: true });
    persist();
  },

  all(): Anime[] {
    return [...store.values()];
  },

  clearUnpinned(): void {
    for (const [id, anime] of store.entries()) {
      if (!anime.pinned) store.delete(id);
    }
    persist();
  },

  clear(): void {
    store.clear();
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  },
};
