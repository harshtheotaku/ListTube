import { Anime, MediaType, RelatedTitle, ScheduleItem, StreamingLink } from '../types';
import { animeStore } from './animeStore';

const ENDPOINT = 'https://graphql.anilist.co';

export const ANIME_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

export const MANGA_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const CORE = `
  id
  idMal
  type
  title { english romaji native }
  coverImage { extraLarge large color }
  bannerImage
  description(asHtml: false)
  genres
  tags { name rank isMediaSpoiler }
  studios(isMain: true) { nodes { name } }
  staff(perPage: 2, sort: RELEVANCE) { nodes { name { full } } }
  startDate { year }
  season
  format
  episodes
  chapters
  volumes
  duration
  averageScore
  popularity
  status
  trailer { id site thumbnail }
  nextAiringEpisode { episode airingAt }
`;

interface AniListMedia {
  id: number;
  idMal?: number | null;
  type?: string | null;
  title: { english?: string | null; romaji?: string | null; native?: string | null };
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[];
  tags?: { name: string; rank: number; isMediaSpoiler?: boolean }[];
  studios?: { nodes?: { name: string }[] };
  staff?: { nodes?: { name?: { full?: string | null } }[] };
  startDate?: { year?: number | null };
  season?: string | null;
  format?: string | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  status?: string | null;
  trailer?: { id?: string; site?: string; thumbnail?: string | null } | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  externalLinks?: { site: string; url: string; type: string }[] | null;
  relations?: {
    edges?: { relationType?: string; node?: AniListMedia | null }[];
  } | null;
  recommendations?: {
    nodes?: ({ rating?: number; mediaRecommendation?: AniListMedia | null } | null)[];
  } | null;
}

interface PageResponse {
  Page?: { media?: AniListMedia[] };
}

interface MediaResponse {
  Media?: AniListMedia | null;
}

const SEASON_LABEL: Record<string, string> = {
  WINTER: 'Winter',
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
};

const STATUS_LABEL: Record<string, string> = {
  RELEASING: 'Airing',
  FINISHED: 'Finished',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Cancelled',
  HIATUS: 'On hiatus',
};

export function cleanDescription(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function titleOf(media: AniListMedia): string {
  return media.title.english || media.title.romaji || media.title.native || 'Untitled';
}

export function mapMedia(media: AniListMedia, fallbackType: MediaType = 'ANIME'): Anime {
  const mediaType: MediaType =
    media.type === 'MANGA' ? 'MANGA' : media.type === 'ANIME' ? 'ANIME' : fallbackType;
  const cover = media.coverImage?.extraLarge || media.coverImage?.large || '';
  const trailerYoutubeId =
    media.trailer?.site === 'youtube' && media.trailer.id
      ? media.trailer.id.trim()
      : undefined;
  const trailerThumbnail =
    media.trailer?.thumbnail ||
    (trailerYoutubeId ? `https://i.ytimg.com/vi/${trailerYoutubeId}/hqdefault.jpg` : undefined);
  const wideBanner = media.bannerImage || undefined;

  const tags = (media.tags ?? [])
    .filter((tag) => !tag.isMediaSpoiler)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 12)
    .map((tag) => tag.name);

  const studios = (media.studios?.nodes ?? []).map((s) => s.name);
  const authors =
    studios.length > 0
      ? studios
      : (media.staff?.nodes ?? []).map((n) => n.name?.full).filter((s): s is string => Boolean(s));

  const idPrefix = mediaType === 'MANGA' ? 'anilist-manga' : 'anilist';

  return {
    id: `${idPrefix}:${media.id}`,
    mediaType,
    source: 'anilist',
    anilistId: media.id,
    malId: media.idMal ?? undefined,
    title: titleOf(media),
    titleRomaji: media.title.romaji ?? undefined,
    titleNative: media.title.native ?? undefined,
    cover,
    banner: wideBanner || cover,
    trailerThumbnail,
    hasWideBanner: Boolean(wideBanner),
    hasOfficialBanner: Boolean(wideBanner),
    description: cleanDescription(media.description),
    genres: media.genres ?? [],
    tags,
    studios: authors,
    year: media.startDate?.year ?? undefined,
    season: media.season ? SEASON_LABEL[media.season] ?? media.season : undefined,
    format: media.format ?? undefined,
    episodes: media.episodes ?? undefined,
    chapters: media.chapters ?? undefined,
    volumes: media.volumes ?? undefined,
    duration: media.duration ?? undefined,
    score: media.averageScore ? Math.round(media.averageScore) / 10 : undefined,
    popularity: media.popularity ?? 0,
    status:
      mediaType === 'MANGA' && media.status === 'RELEASING'
        ? 'Publishing'
        : media.status
        ? STATUS_LABEL[media.status] ?? media.status
        : undefined,
    trailerYoutubeId,
    nextEpisode: media.nextAiringEpisode
      ? { number: media.nextAiringEpisode.episode, airingAt: media.nextAiringEpisode.airingAt }
      : undefined,
    streaming: (media.externalLinks ?? [])
      .filter((link) => link.type === 'STREAMING' || (mediaType === 'MANGA' && link.type === 'INFO'))
      .map<StreamingLink>((link) => ({ site: link.site, url: link.url })),
    similar: [],
    fetchedAt: Date.now(),
  };
}

async function request<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      return request<T>(query, variables, attempt + 1);
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    if (!json.data) throw new Error('Empty AniList response');
    return json.data;
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

const PAGE_QUERY = `
  query PageQuery(
    $type: MediaType
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $genreIn: [String]
    $tagIn: [String]
    $season: MediaSeason
    $seasonYear: Int
    $search: String
  ) {
    Page(page: $page, perPage: $perPage) {
      media(
        type: $type
        isAdult: false
        sort: $sort
        genre_in: $genreIn
        tag_in: $tagIn
        season: $season
        seasonYear: $seasonYear
        search: $search
      ) { ${CORE} }
    }
  }
`;

export interface QueryOptions {
  mediaType?: MediaType;
  sort?: string[];
  genres?: string[];
  tags?: string[];
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  search?: string;
  page?: number;
  perPage?: number;
}

export async function queryMedia(options: QueryOptions): Promise<Anime[]> {
  const mediaType = options.mediaType ?? 'ANIME';
  const variables = {
    type: mediaType,
    page: options.page ?? 1,
    perPage: Math.min(options.perPage ?? 30, 50),
    sort: options.sort ?? ['POPULARITY_DESC'],
    genreIn: options.genres?.length ? options.genres : undefined,
    tagIn: options.tags?.length ? options.tags : undefined,
    season: mediaType === 'ANIME' ? options.season : undefined,
    seasonYear: mediaType === 'ANIME' ? options.seasonYear : undefined,
    search: options.search,
  };
  const key = `q:${JSON.stringify(variables)}`;
  return cached(key, async () => {
    const data = await request<PageResponse>(PAGE_QUERY, variables);
    return (data.Page?.media ?? []).map((m) => mapMedia(m, mediaType)).filter((a) => a.cover);
  });
}

export function currentSeason(now = new Date()): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const month = now.getMonth() + 1;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: now.getFullYear() };
}

export async function fetchTrending(limit = 30, page = 1, mediaType: MediaType = 'ANIME'): Promise<Anime[]> {
  return queryMedia({ mediaType, sort: ['TRENDING_DESC', 'POPULARITY_DESC'], perPage: limit, page });
}

export async function fetchPopular(limit = 30, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  return queryMedia({ mediaType, sort: ['POPULARITY_DESC', 'SCORE_DESC'], perPage: limit, page });
}

export async function fetchTopRated(limit = 30, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  return queryMedia({ mediaType, sort: ['SCORE_DESC'], perPage: limit, page });
}

export async function fetchSeasonal(limit = 30, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  if (mediaType === 'MANGA') {
    return queryMedia({ mediaType: 'MANGA', sort: ['TRENDING_DESC', 'SCORE_DESC'], perPage: limit, page });
  }
  const { season, year } = currentSeason();
  return queryMedia({ mediaType: 'ANIME', season, seasonYear: year, sort: ['POPULARITY_DESC'], perPage: limit, page });
}

export async function fetchByGenre(
  genre: string,
  limit = 24,
  sort: string[] = ['POPULARITY_DESC'],
  mediaType: MediaType = 'ANIME',
  page = 1
): Promise<Anime[]> {
  return queryMedia({ mediaType, genres: [genre], sort, perPage: limit, page });
}

export async function fetchByTag(
  tag: string,
  limit = 24,
  sort: string[] = ['SCORE_DESC'],
  mediaType: MediaType = 'ANIME',
  page = 1
): Promise<Anime[]> {
  return queryMedia({ mediaType, tags: [tag], sort, perPage: limit, page });
}

export async function searchAniList(
  query: string,
  limit = 24,
  mediaType: MediaType = 'ANIME'
): Promise<Anime[]> {
  if (!query.trim()) return [];
  return queryMedia({
    mediaType,
    search: query.trim(),
    sort: ['SEARCH_MATCH', 'POPULARITY_DESC'],
    perPage: limit,
  });
}

const DETAIL_QUERY = `
  query Detail($id: Int, $type: MediaType) {
    Media(id: $id, type: $type) {
      ${CORE}
      externalLinks { site url type }
      relations {
        edges {
          relationType
          node { ${CORE} }
        }
      }
      recommendations(perPage: 16, sort: RATING_DESC) {
        nodes {
          rating
          mediaRecommendation { ${CORE} }
        }
      }
    }
  }
`;

export async function fetchDetail(id: number, mediaType: MediaType = 'ANIME'): Promise<Anime | null> {
  const key = `detail:${mediaType}:${id}`;
  return cached(
    key,
    async () => {
      const data = await request<MediaResponse>(DETAIL_QUERY, { id, type: mediaType });
      if (!data.Media) return null;
      const media = data.Media;
      const anime = mapMedia(media, mediaType);

      const fullRelatedItems: Anime[] = [];

      const recs: RelatedTitle[] = [];
      for (const node of media.recommendations?.nodes ?? []) {
        if (!node?.mediaRecommendation) continue;
        const mapped = mapMedia(node.mediaRecommendation, mediaType);
        if (!mapped.cover) continue;
        fullRelatedItems.push(mapped);
        recs.push({
          id: mapped.id,
          title: mapped.title,
          cover: mapped.cover,
          banner: mapped.banner,
          rating: node.rating ?? 0,
          mediaType: mapped.mediaType,
        });
      }

      const relations: RelatedTitle[] = [];
      for (const edge of media.relations?.edges ?? []) {
        if (!edge.node || !edge.relationType) continue;
        if (edge.relationType === 'CHARACTER') continue;
        const mapped = mapMedia(edge.node, edge.node.type === 'MANGA' ? 'MANGA' : 'ANIME');
        if (!mapped.cover) continue;
        fullRelatedItems.push(mapped);
        relations.push({
          id: mapped.id,
          title: mapped.title,
          cover: mapped.cover,
          banner: mapped.banner,
          relation: edge.relationType,
          mediaType: mapped.mediaType,
        });
      }

      if (fullRelatedItems.length > 0) {
        animeStore.rememberMany(fullRelatedItems);
      }

      const seen = new Set<string>();
      anime.similar = [...relations, ...recs].filter((item) => {
        if (!item.cover || seen.has(item.id) || item.id === anime.id) return false;
        seen.add(item.id);
        return true;
      });

      return anime;
    },
    30 * 60 * 1000
  );
}

const SCHEDULE_QUERY = `
  query Schedule($start: Int, $end: Int) {
    Page(page: 1, perPage: 50) {
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        id
        airingAt
        episode
        media {
          ${CORE}
        }
      }
    }
  }
`;

interface ScheduleResponse {
  Page?: {
    airingSchedules?: {
      id: number;
      airingAt: number;
      episode: number;
      media?: AniListMedia | null;
    }[];
  };
}

export async function fetchAiringSchedule(): Promise<ScheduleItem[]> {
  const nowSec = Math.floor(Date.now() / 1000) - 3600;
  const endSec = nowSec + 7 * 86400;
  return cached(
    `schedule:${Math.floor(nowSec / 1800)}`,
    async () => {
      const data = await request<ScheduleResponse>(SCHEDULE_QUERY, { start: nowSec, end: endSec });
      const items: ScheduleItem[] = [];
      const toRemember: Anime[] = [];
      for (const row of data.Page?.airingSchedules ?? []) {
        if (!row.media || row.media.type === 'MANGA') continue;
        const anime = mapMedia(row.media, 'ANIME');
        if (!anime.cover) continue;
        toRemember.push(anime);
        items.push({
          id: `sched-${row.id}`,
          airingAt: row.airingAt,
          episode: row.episode,
          anime,
        });
      }
      animeStore.rememberMany(toRemember);
      return items;
    },
    15 * 60 * 1000
  );
}

const BY_MAL_IDS_QUERY = `
  query ByMalIds($ids: [Int], $type: MediaType) {
    Page(page: 1, perPage: 50) {
      media(idMal_in: $ids, type: $type, isAdult: false) {
        ${CORE}
      }
    }
  }
`;

export async function fetchByMalIds(
  malIds: number[],
  mediaType: MediaType = 'ANIME'
): Promise<Anime[]> {
  const unique = [...new Set(malIds)].filter((n) => n > 0);
  if (!unique.length) return [];

  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += 50) {
    chunks.push(unique.slice(i, i + 50));
  }

  const results = await Promise.all(
    chunks.slice(0, 4).map(async (chunk) => {
      try {
        const data = await request<PageResponse>(BY_MAL_IDS_QUERY, {
          ids: chunk,
          type: mediaType,
        });
        return (data.Page?.media ?? [])
          .map((m) => mapMedia(m, mediaType))
          .filter((a) => a.cover);
      } catch {
        return [] as Anime[];
      }
    })
  );

  const merged = results.flat();
  if (merged.length > 0) animeStore.rememberMany(merged);
  return merged;
}

export interface AniListViewer {
  id: number;
  name: string;
  avatar?: string;
}

export async function fetchAniListViewer(token: string): Promise<AniListViewer> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: 'query { Viewer { id name avatar { large } } }',
    }),
  });
  const json = (await res.json()) as {
    data?: { Viewer?: { id: number; name: string; avatar?: { large?: string } } | null };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data?.Viewer) throw new Error('Invalid or expired AniList token.');
  return {
    id: json.data.Viewer.id,
    name: json.data.Viewer.name,
    avatar: json.data.Viewer.avatar?.large,
  };
}
