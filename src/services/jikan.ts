import { Anime, MediaType, NewsItem, RelatedTitle, StreamingLink } from '../types';
import { pickSingleEnglishLink } from './anilist';
import { animeStore } from './animeStore';

const BASE = 'https://api.jikan.moe/v4';

interface JikanMedia {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  synopsis?: string | null;
  type?: string | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  status?: string | null;
  duration?: string | null;
  score?: number | null;
  members?: number | null;
  year?: number | null;
  season?: string | null;
  images?: {
    jpg?: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  };
  genres?: { name: string }[];
  themes?: { name: string }[];
  demographics?: { name: string }[];
  studios?: { name: string }[];
  authors?: { name: string }[];
  trailer?: {
    youtube_id?: string | null;
    images?: { maximum_image_url?: string | null; large_image_url?: string | null };
  };
  streaming?: { name: string; url: string }[];
  aired?: { prop?: { from?: { year?: number | null } } };
  published?: { prop?: { from?: { year?: number | null } } };
  recommendations?: {
    entry?: {
      mal_id: number;
      title: string;
      images?: { jpg?: { large_image_url?: string; image_url?: string } };
    };
  }[];
}

function toTitle(item: JikanMedia): string {
  return item.title_english || item.title;
}

function toAnime(item: JikanMedia, mediaType: MediaType = 'ANIME'): Anime {
  const cover =
    item.images?.webp?.large_image_url ||
    item.images?.jpg?.large_image_url ||
    item.images?.jpg?.image_url ||
    '';
  const trailerId = item.trailer?.youtube_id?.trim() || undefined;
  const trailerThumbnail =
    item.trailer?.images?.maximum_image_url ||
    item.trailer?.images?.large_image_url ||
    (trailerId ? `https://i.ytimg.com/vi/${trailerId}/hqdefault.jpg` : undefined);
  const duration = item.duration?.match(/(\d+)\s*min/);
  const prefix = mediaType === 'MANGA' ? 'mal-manga' : 'mal';

  const studiosOrAuthors =
    mediaType === 'MANGA'
      ? (item.authors ?? []).map((a) => a.name)
      : (item.studios ?? []).map((s) => s.name);

  return {
    id: `${prefix}:${item.mal_id}`,
    mediaType,
    source: 'mal',
    malId: item.mal_id,
    title: toTitle(item),
    titleRomaji: item.title,
    titleNative: item.title_japanese ?? undefined,
    cover,
    banner: trailerThumbnail || cover,
    trailerThumbnail,
    hasWideBanner: Boolean(trailerThumbnail),
    description: item.synopsis ?? '',
    genres: [
      ...(item.genres ?? []).map((g) => g.name),
      ...(item.themes ?? []).map((t) => t.name),
      ...(item.demographics ?? []).map((d) => d.name),
    ],
    tags: (item.themes ?? []).map((t) => t.name),
    studios: studiosOrAuthors,
    year:
      item.year ??
      item.aired?.prop?.from?.year ??
      item.published?.prop?.from?.year ??
      undefined,
    season: item.season ?? undefined,
    format: item.type ?? undefined,
    mediaLabel: mediaType === 'MANGA' ? (item.type?.toUpperCase() || 'MANGA') : item.type ?? undefined,
    episodes: item.episodes ?? undefined,
    chapters: item.chapters ?? undefined,
    volumes: item.volumes ?? undefined,
    duration: duration ? Number(duration[1]) : undefined,
    score: item.score ?? undefined,
    popularity: item.members ?? 0,
    status: item.status ?? undefined,
    trailerYoutubeId: trailerId,
    streaming: pickSingleEnglishLink(
      dedupeStreams(
        (item.streaming ?? []).map<StreamingLink>((s) => ({ site: s.name, url: s.url }))
      ),
      mediaType
    ),
    similar: (item.recommendations ?? [])
      .filter((rec) => rec.entry)
      .slice(0, 12)
      .map<RelatedTitle>((rec) => ({
        id: `${prefix}:${rec.entry!.mal_id}`,
        title: rec.entry!.title,
        cover:
          rec.entry!.images?.jpg?.large_image_url || rec.entry!.images?.jpg?.image_url || '',
        mediaType,
      })),
    fetchedAt: Date.now(),
  };
}

function dedupeStreams(links: StreamingLink[]): StreamingLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (!link.url || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

async function get<T>(path: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { signal: controller.signal });
    } catch {
      throw new Error('MyAnimeList is not responding right now. Try again or use AniList.');
    }
    if (res.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1100 * (attempt + 1)));
      return get<T>(path, attempt + 1);
    }
    if (res.status === 404) throw new Error('MyAnimeList resource not found');
    if (!res.ok) throw new Error(`MyAnimeList bridge error ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, loader: () => Promise<T>, ttl = 10 * 60 * 1000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await loader();
  cache.set(key, { at: Date.now(), data });
  return data;
}

export async function searchMAL(
  query: string,
  limit = 20,
  mediaType: MediaType = 'ANIME'
): Promise<Anime[]> {
  if (!query.trim()) return [];
  const endpoint = mediaType === 'MANGA' ? 'manga' : 'anime';
  const key = `mal-search:${mediaType}:${query.toLowerCase()}:${limit}`;
  return cached(key, async () => {
    const res = await get<{ data?: JikanMedia[] }>(
      `/${endpoint}?q=${encodeURIComponent(query.trim())}&limit=${Math.min(limit, 25)}&sfw=true&order_by=members&sort=desc`
    );
    return (res.data ?? []).map((item) => toAnime(item, mediaType)).filter((a) => a.cover);
  });
}

export async function fetchMALDetail(
  malId: number,
  mediaType: MediaType = 'ANIME'
): Promise<Anime | null> {
  const endpoint = mediaType === 'MANGA' ? 'manga' : 'anime';
  return cached(`mal-detail:${mediaType}:${malId}`, async () => {
    const res = await get<{ data?: JikanMedia }>(`/${endpoint}/${malId}/full`);
    return res.data ? toAnime(res.data, mediaType) : null;
  });
}

export interface MALRecommendationItem {
  malId: number;
  title: string;
  cover: string;
  votes: number;
}

export async function fetchMALRecommendations(
  malId: number,
  mediaType: MediaType = 'ANIME'
): Promise<MALRecommendationItem[]> {
  const endpoint = mediaType === 'MANGA' ? 'manga' : 'anime';
  return cached(
    `mal-recs:${mediaType}:${malId}`,
    async () => {
      try {
        const res = await get<{
          data?: {
            entry?: {
              mal_id: number;
              title: string;
              images?: { jpg?: { large_image_url?: string; image_url?: string } };
            };
            votes?: number;
          }[];
        }>(`/${endpoint}/${malId}/recommendations`);
        return (res.data ?? [])
          .filter((r) => r.entry)
          .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
          .slice(0, 16)
          .map((r) => ({
            malId: r.entry!.mal_id,
            title: r.entry!.title,
            cover:
              r.entry!.images?.jpg?.large_image_url ||
              r.entry!.images?.jpg?.image_url ||
              '',
            votes: r.votes ?? 1,
          }));
      } catch {
        return [];
      }
    },
    30 * 60 * 1000
  );
}

export async function fetchOfficialAnimeNews(malIds: number[]): Promise<NewsItem[]> {
  const uniqueIds = [...new Set(malIds)].slice(0, 4);
  if (!uniqueIds.length) return [];
  return cached(
    `mal-news:${uniqueIds.join(',')}`,
    async () => {
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const res = await get<{
              data?: {
                mal_id: number;
                url: string;
                title: string;
                date: string;
                author_username?: string;
                excerpt?: string;
                images?: { jpg?: { image_url?: string } };
              }[];
            }>(`/anime/${id}/news`);
            return (res.data ?? []).slice(0, 4).map<NewsItem>((n) => ({
              id: `mal-news-${id}-${n.mal_id}`,
              title: n.title,
              url: n.url,
              date: n.date,
              author: n.author_username,
              excerpt: n.excerpt ?? '',
              image: n.images?.jpg?.image_url,
              sourceName: 'MyAnimeList News',
            }));
          } catch {
            return [];
          }
        })
      );
      return results
        .flat()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    20 * 60 * 1000
  );
}

interface MALListMedia {
  mal_id: number;
  title: string;
  images?: { jpg?: { image_url?: string; large_image_url?: string } };
  genres?: { name: string }[];
  themes?: { name: string }[];
  studios?: { name: string }[];
  year?: number | null;
  type?: string | null;
  episodes?: number | null;
  score?: number | null;
  members?: number | null;
}

interface MALListEntry {
  entry?: MALListMedia;
  anime?: MALListMedia;
  watching_status?: number;
  score?: number;
  num_watched_episodes?: number;
}

export interface ImportedEntry {
  anime: Anime;
  status: 'watching' | 'completed' | 'planned' | 'on_hold' | 'dropped';
  score?: number;
  progress?: number;
}

const MAL_STATUS: Record<number, ImportedEntry['status']> = {
  1: 'watching',
  2: 'completed',
  3: 'on_hold',
  4: 'dropped',
  6: 'planned',
};

export async function importMALList(username: string): Promise<ImportedEntry[]> {
  const name = username.trim();
  if (!name) throw new Error('Enter a MyAnimeList username.');

  const collected: ImportedEntry[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= 8) {
    const res = await get<{ data?: MALListEntry[]; pagination?: { has_next_page?: boolean } }>(
      `/users/${encodeURIComponent(name)}/animelist?limit=300&page=${page}`
    );
    for (const row of res.data ?? []) {
      const media = (row.anime ?? row.entry) as MALListMedia | undefined;
      if (!media) continue;
      const cover = media.images?.jpg?.large_image_url || media.images?.jpg?.image_url || '';
      const anime: Anime = {
        id: `mal:${media.mal_id}`,
        mediaType: 'ANIME',
        source: 'mal',
        malId: media.mal_id,
        title: media.title,
        cover,
        banner: cover,
        description: '',
        genres: [
          ...(media.genres ?? []).map((g) => g.name),
          ...(media.themes ?? []).map((t) => t.name),
        ],
        tags: (media.themes ?? []).map((t) => t.name),
        studios: (media.studios ?? []).map((s) => s.name),
        year: media.year || undefined,
        format: media.type || undefined,
        episodes: media.episodes || undefined,
        score: media.score || undefined,
        popularity: media.members || 0,
        streaming: [],
        similar: [],
        fetchedAt: Date.now(),
      };
      collected.push({
        anime,
        status: MAL_STATUS[row.watching_status ?? 6] ?? 'planned',
        score: row.score || undefined,
        progress: row.num_watched_episodes || undefined,
      });
    }
    hasNext = Boolean(res.pagination?.has_next_page);
    page += 1;
  }

  return collected;
}

export async function fetchMALTop(
  mediaType: MediaType = 'ANIME',
  page = 1
): Promise<Anime[]> {
  const endpoint = mediaType === 'MANGA' ? 'manga' : 'anime';
  return cached(`mal-top:${mediaType}:${page}`, async () => {
    const res = await get<{ data?: JikanMedia[] }>(
      `/top/${endpoint}?page=${Math.max(1, page)}&limit=25&sfw=true`
    );
    return (res.data ?? []).map((item) => toAnime(item, mediaType)).filter((a) => a.cover);
  });
}
