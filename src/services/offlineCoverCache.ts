import { idbPruneExcess, idbPruneOlderThanDays } from './mediaDb';

export const SUBSCRIBED_COVER_CACHE = 'listtube-subscribed-covers-v1';
const ACTIVE_CACHE_NAMES = new Set(['listtube-pwa-v1', SUBSCRIBED_COVER_CACHE]);
const AUTO_CLEAN_AT_KEY = 'listtube.autoClean.lastAt.v1';

/**
 * Caches subscribed/favorite anime & manga cover images into Cache Storage so
 * Watchlist & Favorites stay visually crisp even when offline in Airplane Mode.
 */
export async function syncSubscribedCoverCache(coverUrls: string[]): Promise<number> {
  if (
    typeof window === 'undefined' ||
    typeof caches === 'undefined' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return 0;
  }

  const wanted = Array.from(
    new Set(coverUrls.filter((u) => typeof u === 'string' && u.startsWith('https://')))
  ).slice(0, 180);

  try {
    const cache = await caches.open(SUBSCRIBED_COVER_CACHE);
    const existingReqs = await cache.keys();
    const existingSet = new Set(existingReqs.map((r) => r.url));
    const wantedSet = new Set(wanted);

    // Prune covers removed from user library
    for (const req of existingReqs) {
      if (!wantedSet.has(req.url)) {
        void cache.delete(req);
      }
    }

    const missing = wanted.filter((u) => !existingSet.has(u)).slice(0, 24);
    let cachedCount = 0;

    for (let i = 0; i < missing.length; i += 6) {
      const chunk = missing.slice(i, i + 6);
      await Promise.all(
        chunk.map(async (url) => {
          try {
            const res = await fetch(url, { mode: 'no-cors' });
            if (res) {
              await cache.put(url, res);
              cachedCount += 1;
            }
          } catch {
            /* skip unreachable cover */
          }
        })
      );
    }

    return cachedCount;
  } catch {
    return 0;
  }
}

/**
 * Automatically trims stale unpinned media records (>14d), enforces IDB ceiling,
 * and sweeps deprecated Cache Storage versions to keep laptop/phone storage lean.
 */
export async function autoMaintainStorageCache(force = false): Promise<{
  prunedRecords: number;
  removedOldCaches: number;
}> {
  if (typeof window === 'undefined') return { prunedRecords: 0, removedOldCaches: 0 };

  try {
    const last = Number(localStorage.getItem(AUTO_CLEAN_AT_KEY) || 0);
    // Run automatically at most once every 12 hours unless forced
    if (!force && Date.now() - last < 12 * 3_600_000) {
      return { prunedRecords: 0, removedOldCaches: 0 };
    }
    localStorage.setItem(AUTO_CLEAN_AT_KEY, String(Date.now()));
  } catch {
    /* ignore storage quota error */
  }

  const prunedRecords = await idbPruneOlderThanDays(14);
  await idbPruneExcess(4500);

  let removedOldCaches = 0;
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        if (!ACTIVE_CACHE_NAMES.has(k)) {
          await caches.delete(k);
          removedOldCaches += 1;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { prunedRecords, removedOldCaches };
}
