import { Anime, MediaType } from '../types';
import { fetchByMalIds, searchAniList } from './anilist';
import { searchMAL } from './jikan';
import { animeStore } from './animeStore';

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[-:.'’!?(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function acronymOf(title: string): string {
  return normalize(title)
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
}

const COMMON_ALIASES: Record<string, string[]> = {
  aot: ['attack on titan', 'shingeki no kyojin'],
  snk: ['shingeki no kyojin', 'attack on titan'],
  jjk: ['jujutsu kaisen'],
  csm: ['chainsaw man'],
  slf: ['shangri-la frontier', 'shangri la frontier'],
  mha: ['my hero academia', 'boku no hero academia'],
  bnha: ['boku no hero academia', 'my hero academia'],
  ds: ['demon slayer', 'kimetsu no yaiba'],
  kny: ['kimetsu no yaiba', 'demon slayer'],
  opm: ['one punch man'],
  fmab: ['fullmetal alchemist brotherhood'],
  hxh: ['hunter x hunter'],
  rezero: ['re zero', 're:zero'],
  sao: ['sword art online'],
  danmachi: ['is it wrong to try to pick up girls in a dungeon'],
  konosuba: ['kono subarashii sekai ni shukufuku wo'],
  oregairu: ['my teen romantic comedy snafu'],
  tensura: ['that time i got reincarnated as a slime'],
};

function expandAlias(raw: string): string {
  const clean = normalize(raw).replace(/\s+/g, '');
  const expanded = COMMON_ALIASES[clean];
  return expanded ? expanded[0] : raw;
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (needle[i] === haystack[j]) i += 1;
  }
  return i === needle.length;
}

function isNativeCapacitor(): boolean {
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

/**
 * Queries MyAnimeList official live prefix autocomplete (via Vite proxy on Web or CapacitorHttp on Android).
 * Handles partial prefixes like "shan" -> "Shangri-La Frontier" in milliseconds.
 */
async function fetchMalPrefixIds(query: string, mediaType: MediaType): Promise<{ id: number; name: string; image: string }[]> {
  const typeParam = mediaType === 'MANGA' ? 'manga' : 'anime';
  const url = isNativeCapacitor()
    ? `https://myanimelist.net/search/prefix.json?type=${typeParam}&keyword=${encodeURIComponent(query)}`
    : `/proxy/mal/search/prefix.json?type=${typeParam}&keyword=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      categories?: {
        type?: string;
        items?: { id: number; name: string; image_url?: string }[];
      }[];
    };
    const items = data.categories?.flatMap((c) => c.items ?? []) ?? [];
    return items.slice(0, 12).map((item) => ({
      id: item.id,
      name: item.name,
      image: item.image_url ?? '',
    }));
  } catch {
    return [];
  }
}

/**
 * Fallback CORS-enabled prefix search via Shikimori (also uses MAL IDs).
 */
async function fetchShikimoriPrefixIds(query: string, mediaType: MediaType): Promise<number[]> {
  const endpoint = mediaType === 'MANGA' ? 'mangas' : 'animes';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://shikimori.io/api/${endpoint}?search=${encodeURIComponent(query)}&limit=10`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { id?: number }[];
    return data.map((d) => d.id).filter((id): id is number => Boolean(id));
  } catch {
    return [];
  }
}

export function matchScore(query: string, anime: Anime): number {
  const q = normalize(query);
  if (!q) return 0;

  const titles = [anime.title, anime.titleRomaji, anime.titleNative]
    .filter((t): t is string => Boolean(t))
    .map(normalize);

  let best = 0;
  const qTokens = q.split(' ').filter(Boolean);

  for (const t of titles) {
    if (t === q) best = Math.max(best, 110);
    else if (t.startsWith(q)) best = Math.max(best, 92);
    else if (t.includes(q)) best = Math.max(best, 78);

    const tWords = t.split(' ');
    const matchedTokens = qTokens.filter((qt) => tWords.some((tw) => tw.startsWith(qt)));
    if (matchedTokens.length === qTokens.length) {
      best = Math.max(best, 86);
    } else if (matchedTokens.length > 0) {
      best = Math.max(best, 44 * (matchedTokens.length / qTokens.length));
    }

    const acr = acronymOf(t);
    if (q.length >= 2 && acr.startsWith(q.replace(/\s+/g, ''))) {
      best = Math.max(best, 80);
    }

    if (q.length >= 3 && isSubsequence(q.replace(/\s+/g, ''), t.replace(/\s+/g, ''))) {
      best = Math.max(best, 35);
    }
  }

  const popBoost = anime.popularity ? Math.min(20, Math.log10(anime.popularity + 1) * 3.2) : 0;
  return best > 0 ? best + popBoost : popBoost * 0.3;
}

export async function searchSmart(
  rawQuery: string,
  mediaType: MediaType = 'ANIME',
  limit = 24
): Promise<Anime[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const expanded = expandAlias(trimmed);

  // 1. Instant local cache hits
  const localHits = animeStore
    .all()
    .filter((a) => (a.mediaType ?? 'ANIME') === mediaType && matchScore(expanded, a) >= 40);

  // 2. Parallel Prefix Discovery (MAL Autocomplete + Shikimori) + AniList GraphQL
  const [malPrefix, shikiIds, anilistRes] = await Promise.all([
    fetchMalPrefixIds(expanded, mediaType),
    fetchShikimoriPrefixIds(expanded, mediaType),
    searchAniList(expanded, 20, mediaType).catch(() => [] as Anime[]),
  ]);

  const discoveredMalIds = [
    ...malPrefix.map((m) => m.id),
    ...shikiIds,
  ];

  // Hydrate discovered MAL IDs via AniList batch query so we get high-res 16:9 banners & trailers
  let hydratedPrefixItems: Anime[] = [];
  if (discoveredMalIds.length > 0) {
    hydratedPrefixItems = await fetchByMalIds(discoveredMalIds, mediaType);
  }

  // Fallback to Jikan if nothing came back from prefix/AniList
  let jikanRes: Anime[] = [];
  if (hydratedPrefixItems.length === 0 && anilistRes.length < 4) {
    jikanRes = await searchMAL(expanded, 15, mediaType).catch(() => [] as Anime[]);
  }

  const byMalId = new Map<number, Anime>();
  const byNormTitle = new Map<string, Anime>();
  const merged: Anime[] = [];

  const add = (item: Anime) => {
    if (!item.cover) return;
    if (item.malId && byMalId.has(item.malId)) {
      const existing = byMalId.get(item.malId)!;
      if (existing.source === 'anilist') return;
    }
    const norm = normalize(item.title);
    if (byNormTitle.has(norm)) {
      const existing = byNormTitle.get(norm)!;
      if (existing.source === 'anilist' || existing.hasWideBanner) return;
    }
    if (item.malId) byMalId.set(item.malId, item);
    byNormTitle.set(norm, item);
    merged.push(item);
  };

  hydratedPrefixItems.forEach(add);
  anilistRes.forEach(add);
  localHits.forEach(add);
  jikanRes.forEach(add);

  animeStore.rememberMany(merged);

  return merged
    .map((anime) => ({ anime, score: matchScore(expanded, anime) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.anime);
}
