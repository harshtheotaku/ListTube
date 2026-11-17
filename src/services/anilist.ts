import {
  ActivityItem,
  Anime,
  CharacterCredit,
  CharacterDetailExtra,
  FavoriteCharacterItem,
  MediaType,
  PersonCreditWork,
  RelatedTitle,
  ReviewVerdict,
  ScheduleItem,
  ScoreDistBucket,
  StaffCredit,
  StaffPersonDetail,
  StaffSearchItem,
  StatusDistBucket,
  StreamingLink,
  StudioDetail,
  UserReview,
  WikipediaSummary,
} from '../types';
import { animeStore } from './animeStore';
import { edgeAniList } from './supabase';

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

export const MAL_THEMES = [
  'Isekai',
  'Reincarnation',
  'Time Manipulation',
  'School',
  'Military',
  'Historical',
  'Martial Arts',
  'Mythology',
  'Cyberpunk',
  'Space',
  'Vampire',
  'Survival',
  'Video Games',
  'Detective',
  'Samurai',
  'Villainess',
];

export const MAL_DEMOGRAPHICS = [
  'Shounen',
  'Seinen',
  'Shoujo',
  'Josei',
  'Kids',
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
  countryOfOrigin
  synonyms
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
  countryOfOrigin?: string | null;
  synonyms?: string[] | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  status?: string | null;
  trailer?: { id?: string; site?: string; thumbnail?: string | null } | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  externalLinks?: { site: string; url: string; type: string; language?: string | null }[] | null;
  relations?: {
    edges?: { relationType?: string; node?: AniListMedia | null }[];
  } | null;
  recommendations?: {
    nodes?: ({ rating?: number; mediaRecommendation?: AniListMedia | null } | null)[];
  } | null;
  characters?: {
    edges?: {
      role?: string | null;
      node?: {
        id: number;
        name?: { full?: string | null; native?: string | null } | null;
        image?: { large?: string | null; medium?: string | null } | null;
        description?: string | null;
        siteUrl?: string | null;
      } | null;
      voiceActors?: {
        id?: number;
        languageV2?: string | null;
        siteUrl?: string | null;
        name?: { full?: string | null } | null;
        image?: { medium?: string | null } | null;
      }[] | null;
    }[];
  } | null;
  staffEdges?: {
    edges?: {
      role?: string | null;
      node?: {
        id: number;
        siteUrl?: string | null;
        name?: { full?: string | null; native?: string | null } | null;
        image?: { medium?: string | null } | null;
      } | null;
    }[];
  } | null;
  stats?: {
    scoreDistribution?: { score: number; amount: number }[] | null;
    statusDistribution?: { status: string; amount: number }[] | null;
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

const NON_ENGLISH_WORDS = /\b(der|die|das|ein|eine|dem|den|des|le|la|les|un|une|des|et|en|du|au|aux|el|los|las|del|por|con|para|que|eseo|nyeon|nyeoni|neun|eun|gwa|geomga|hoegwi|sanyang|oppa|hyung|noona|seonbae|sensei|san|kun|chan)\b/i;
const ENGLISH_SIGNAL_WORDS = /\b(the|of|in|to|a|an|for|and|from|with|by|years|year|since|life|world|hero|lord|knight|demon|level|solo|king|queen|prince|princess|sword|magic|academy|return|revenge|after|story|chronicles|hunter|dragon|saint|villainess|duke|lady|prologue|shadow|dungeon|time|new|my|i|you|we|was|became|overpowered|second|reincarnated|extra)\b/i;

function pickEnglishSynonym(synonyms?: string[] | null): string | null {
  if (!synonyms?.length) return null;
  let fallbackAscii: string | null = null;

  for (const raw of synonyms) {
    const s = raw.trim();
    if (s.length < 5 || s.length > 90) continue;
    // Must be pure ASCII (drops Korean, Japanese, Chinese, Thai, Russian, accented French/German/Spanish)
    if (!/^[\x20-\x7E]+$/.test(s)) continue;
    if (NON_ENGLISH_WORDS.test(s)) continue;
    // Skip obvious Korean/Japanese hyphenated romanization words like "Prologue-eseo"
    if (/[a-z]-(?:eseo|neun|eun|ga|ui|reul|eul)\b/i.test(s)) continue;

    if (ENGLISH_SIGNAL_WORDS.test(s)) {
      return s;
    }
    if (!fallbackAscii && s.includes(' ')) {
      fallbackAscii = s;
    }
  }
  return fallbackAscii;
}

export function titleOf(media: AniListMedia): string {
  if (media.title.english?.trim()) return media.title.english.trim();
  const syn = pickEnglishSynonym(media.synonyms);
  if (syn) return syn;
  return media.title.romaji || media.title.native || 'Untitled';
}

const NON_EN_DOMAIN_RE =
  /(\.jp(?:\/|$)|\.kr(?:\/|$)|\.cn(?:\/|$)|\/(?:ja|jp|ko|kr|zh|es|fr|de|pt|it|th|id|ru|ar)(?:\/|$)|piccoma\.|page\.kakao\.|webtoon\.kakao\.|comic\.naver\.|abema\.tv|nicovideo\.|video\.unext\.|dmm\.co|delitoon\.|cmoa\.jp|bookwalker\.jp|renta\.|line\.me|pixiv\.net)/i;

const ANIME_EN_PRIORITY = [
  'crunchyroll',
  'netflix',
  'hulu',
  'hidive',
  'amazon',
  'prime video',
  'disney+',
  'apple tv',
  'muse asia',
  'ani-one',
  'adult swim',
  'youtube',
  'tubi',
  'official site',
];

const MANGA_EN_PRIORITY = [
  'manga plus',
  'mangaplus',
  'shonen jump',
  'viz',
  'webtoon',
  'tappytoon',
  'tapas',
  'k manga',
  'azuki',
  'webnovel',
  'comikey',
  'inkr',
  'yen press',
  'kodansha',
  'seven seas',
  'j-novel',
  'manga planet',
  'lezhin',
  'pocket comics',
  'official site',
];

export function pickSingleEnglishLink(
  links: StreamingLink[],
  mediaType: MediaType = 'ANIME'
): StreamingLink[] {
  if (!links.length) return [];

  const filtered = links.filter((link) => {
    if (!link.url) return false;
    if (link.language && link.language.toLowerCase() !== 'english') return false;
    if (NON_EN_DOMAIN_RE.test(link.url)) return false;
    return true;
  });

  if (!filtered.length) return [];

  const prefs = mediaType === 'MANGA' ? MANGA_EN_PRIORITY : ANIME_EN_PRIORITY;

  const scoreOf = (link: StreamingLink): number => {
    const siteLower = link.site.toLowerCase();
    let score = link.language?.toLowerCase() === 'english' ? 100 : 20;
    const idx = prefs.findIndex((p) => siteLower.includes(p));
    if (idx !== -1) score += 200 - idx * 5;
    if (siteLower.includes('official site')) score -= 35;
    return score;
  };

  const sorted = [...filtered].sort((a, b) => scoreOf(b) - scoreOf(a));
  return [sorted[0]];
}

function resolveOriginLabel(media: AniListMedia, mediaType: MediaType): string | undefined {
  if (mediaType !== 'MANGA') return media.format ?? undefined;
  if (media.countryOfOrigin === 'KR') return 'MANHWA';
  if (media.countryOfOrigin === 'CN' || media.countryOfOrigin === 'TW') return 'MANHUA';
  if (media.countryOfOrigin === 'JP') return 'MANGA';
  if (media.format === 'NOVEL') return 'LIGHT NOVEL';
  if (media.format === 'ONE_SHOT') return 'ONE-SHOT';
  return 'MANGA';
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
    countryOfOrigin: media.countryOfOrigin ?? undefined,
    mediaLabel: resolveOriginLabel(media, mediaType),
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
    streaming: pickSingleEnglishLink(
      (media.externalLinks ?? [])
        .filter((link) => link.type === 'STREAMING' || (mediaType === 'MANGA' && link.type === 'INFO'))
        .map<StreamingLink>((link) => ({
          site: link.site,
          url: link.url,
          language: link.language ?? undefined,
        })),
      mediaType
    ),
    similar: [],
    fetchedAt: Date.now(),
  };
}

async function request<T>(
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
  ttlSeconds?: number
): Promise<T> {
  if (attempt === 0) {
    try {
      return await edgeAniList<T>(query, variables, ttlSeconds);
    } catch {
      // Fallback directly to AniList GraphQL if Edge Gateway is unreachable
    }
  }
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
    $formatIn: [MediaFormat]
    $status: MediaStatus
    $countryOfOrigin: CountryCode
    $season: MediaSeason
    $seasonYear: Int
    $startDateGreater: FuzzyDateInt
    $startDateLesser: FuzzyDateInt
    $averageScoreGreater: Int
    $search: String
  ) {
    Page(page: $page, perPage: $perPage) {
      media(
        type: $type
        isAdult: false
        sort: $sort
        genre_in: $genreIn
        tag_in: $tagIn
        format_in: $formatIn
        status: $status
        countryOfOrigin: $countryOfOrigin
        season: $season
        seasonYear: $seasonYear
        startDate_greater: $startDateGreater
        startDate_lesser: $startDateLesser
        averageScore_greater: $averageScoreGreater
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
  formats?: string[];
  status?: 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'HIATUS';
  countryOfOrigin?: 'JP' | 'KR' | 'CN';
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  yearMin?: number;
  yearMax?: number;
  minScore?: number;
  search?: string;
  page?: number;
  perPage?: number;
}

export function buildPageQueryVariables(options: QueryOptions): Record<string, unknown> {
  const mediaType = options.mediaType ?? 'ANIME';
  return {
    type: mediaType,
    page: options.page ?? 1,
    perPage: Math.min(options.perPage ?? 30, 50),
    sort: options.sort ?? ['POPULARITY_DESC'],
    genreIn: options.genres?.length ? options.genres : undefined,
    tagIn: options.tags?.length ? options.tags : undefined,
    formatIn: options.formats?.length ? options.formats : undefined,
    status: options.status,
    countryOfOrigin: options.countryOfOrigin,
    season: mediaType === 'ANIME' ? options.season : undefined,
    seasonYear: mediaType === 'ANIME' ? options.seasonYear : undefined,
    startDateGreater: options.yearMin ? Number(`${options.yearMin}0000`) : undefined,
    startDateLesser: options.yearMax ? Number(`${options.yearMax}1231`) : undefined,
    averageScoreGreater:
      typeof options.minScore === 'number' && options.minScore > 0
        ? Math.min(99, Math.round(options.minScore * 10))
        : undefined,
    search: options.search?.trim() ? options.search.trim() : undefined,
  };
}

export async function queryMedia(options: QueryOptions): Promise<Anime[]> {
  const mediaType = options.mediaType ?? 'ANIME';
  const variables = buildPageQueryVariables(options);
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

export async function fetchSeasonal(
  limit = 30,
  mediaType: MediaType = 'ANIME',
  page = 1,
  seasonOverride?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL',
  yearOverride?: number
): Promise<Anime[]> {
  if (mediaType === 'MANGA') {
    return queryMedia({ mediaType: 'MANGA', sort: ['TRENDING_DESC', 'SCORE_DESC'], perPage: limit, page });
  }
  const current = currentSeason();
  return queryMedia({
    mediaType: 'ANIME',
    season: seasonOverride ?? current.season,
    seasonYear: yearOverride ?? current.year,
    sort: ['POPULARITY_DESC'],
    perPage: limit,
    page,
  });
}

export async function fetchReleasing(limit = 24, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  return queryMedia({
    mediaType,
    status: 'RELEASING',
    sort: ['SCORE_DESC', 'POPULARITY_DESC'],
    perPage: limit,
    page,
  });
}

export async function fetchUpcoming(limit = 24, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  return queryMedia({
    mediaType,
    status: 'NOT_YET_RELEASED',
    sort: ['POPULARITY_DESC'],
    perPage: limit,
    page,
  });
}

export async function fetchMostFavorited(limit = 24, mediaType: MediaType = 'ANIME', page = 1): Promise<Anime[]> {
  return queryMedia({
    mediaType,
    sort: ['FAVOURITES_DESC'],
    perPage: limit,
    page,
  });
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
      externalLinks { site url type language }
      characters(sort: [ROLE, RELEVANCE, FAVOURITES_DESC], perPage: 18) {
        edges {
          role
          node {
            id
            name { full native }
            image { large medium }
            description(asHtml: false)
            siteUrl
          }
          voiceActors(sort: [ROLE, RELEVANCE]) {
            id
            languageV2
            siteUrl
            name { full }
            image { medium }
          }
        }
      }
      staffEdges: staff(sort: RELEVANCE, perPage: 12) {
        edges {
          role
          node {
            id
            siteUrl
            name { full native }
            image { medium }
          }
        }
      }
      stats {
        scoreDistribution { score amount }
        statusDistribution { status amount }
      }
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

      // Characters & Voice Actors (Japanese + English)
      const characters: CharacterCredit[] = [];
      for (const edge of media.characters?.edges ?? []) {
        if (!edge.node?.name?.full) continue;
        const img = edge.node.image?.large || edge.node.image?.medium || '';
        const vas = edge.voiceActors ?? [];
        const jp =
          vas.find((v) => v.languageV2?.toLowerCase() === 'japanese') ??
          vas.find((v) => v.languageV2?.toLowerCase() !== 'english');
        const en = vas.find((v) => v.languageV2?.toLowerCase() === 'english');
        characters.push({
          id: edge.node.id,
          name: edge.node.name.full,
          nativeName: edge.node.name.native ?? undefined,
          image: img,
          role: edge.role ?? 'SUPPORTING',
          description: cleanDescription(edge.node.description),
          siteUrl: edge.node.siteUrl ?? undefined,
          voiceActor: jp?.name?.full
            ? {
                id: jp.id,
                name: jp.name.full,
                image: jp.image?.medium ?? undefined,
                language: jp.languageV2 ?? 'Japanese',
                siteUrl: jp.siteUrl ?? undefined,
              }
            : undefined,
          englishVoiceActor: en?.name?.full
            ? {
                id: en.id,
                name: en.name.full,
                image: en.image?.medium ?? undefined,
                siteUrl: en.siteUrl ?? undefined,
              }
            : undefined,
        });
      }
      anime.characters = characters;

      // Staff credits
      const staffList: StaffCredit[] = [];
      for (const edge of media.staffEdges?.edges ?? []) {
        if (!edge.node?.name?.full) continue;
        staffList.push({
          id: edge.node.id,
          name: edge.node.name.full,
          nativeName: edge.node.name.native ?? undefined,
          image: edge.node.image?.medium ?? undefined,
          role: edge.role ?? 'Staff',
          siteUrl: edge.node.siteUrl ?? undefined,
        });
      }
      anime.staff = staffList;

      // Score & Status distributions
      anime.scoreStats = (media.stats?.scoreDistribution ?? []).map<ScoreDistBucket>((b) => ({
        score: b.score,
        amount: b.amount,
      }));
      anime.statusStats = (media.stats?.statusDistribution ?? []).map<StatusDistBucket>((b) => ({
        status: b.status,
        amount: b.amount,
      }));

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

const CHARACTER_SEARCH_QUERY = `
  query CharSearch($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
        id
        name { full }
        image { large medium }
        media(perPage: 1, sort: POPULARITY_DESC) {
          nodes { title { english romaji } }
        }
      }
    }
  }
`;

export async function searchAniListCharacters(
  query: string,
  limit = 16
): Promise<FavoriteCharacterItem[]> {
  const clean = query.trim();
  if (!clean) return [];
  return cached(
    `char-search:${clean.toLowerCase()}:${limit}`,
    async () => {
      type CharRes = {
        Page?: {
          characters?: {
            id: number;
            name?: { full?: string | null } | null;
            image?: { large?: string | null; medium?: string | null } | null;
            media?: { nodes?: { title?: { english?: string | null; romaji?: string | null } }[] };
          }[];
        };
      };
      const data = await request<CharRes>(CHARACTER_SEARCH_QUERY, {
        search: clean,
        perPage: limit,
      });
      const out: FavoriteCharacterItem[] = [];
      for (const ch of data.Page?.characters ?? []) {
        const name = ch.name?.full?.trim();
        const image = ch.image?.large || ch.image?.medium || '';
        if (!name || !image) continue;
        const firstMedia = ch.media?.nodes?.[0]?.title;
        out.push({
          id: ch.id,
          name,
          image,
          mediaTitle: firstMedia?.english || firstMedia?.romaji || undefined,
        });
      }
      return out;
    },
    30 * 60 * 1000
  );
}

const STAFF_SEARCH_QUERY = `
  query StaffSearch($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      staff(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
        id
        name { full native }
        image { large medium }
        primaryOccupations
      }
    }
  }
`;

export async function searchAniListStaff(
  query: string,
  limit = 12
): Promise<StaffSearchItem[]> {
  const clean = query.trim();
  if (!clean) return [];
  return cached(
    `staff-search:${clean.toLowerCase()}:${limit}`,
    async () => {
      type StaffRes = {
        Page?: {
          staff?: {
            id: number;
            name?: { full?: string | null; native?: string | null } | null;
            image?: { large?: string | null; medium?: string | null } | null;
            primaryOccupations?: (string | null)[] | null;
          }[];
        };
      };
      const data = await request<StaffRes>(STAFF_SEARCH_QUERY, {
        search: clean,
        perPage: limit,
      });
      const out: StaffSearchItem[] = [];
      for (const st of data.Page?.staff ?? []) {
        const name = st.name?.full?.trim();
        if (!name) continue;
        out.push({
          id: st.id,
          name,
          nativeName: st.name?.native ?? undefined,
          image: st.image?.large || st.image?.medium || undefined,
          primaryOccupations: (st.primaryOccupations ?? []).filter((x): x is string => Boolean(x)),
        });
      }
      return out;
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

export interface MangaScheduleItem {
  id: string;
  group: 'Weekly & Ongoing Serialization' | 'Korean Manhwa Updates' | 'Upcoming Manga Debuts';
  badge: string;
  subtitle: string;
  anime: Anime;
}

const MANGA_SCHEDULE_QUERY = `
  query MangaSchedule($page: Int) {
    Page(page: $page, perPage: 40) {
      media(type: MANGA, status_in: [RELEASING, NOT_YET_RELEASED], sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
        ${CORE}
      }
    }
  }
`;

export async function fetchMangaReleaseSchedule(): Promise<MangaScheduleItem[]> {
  return cached(
    `manga_schedule:v1`,
    async () => {
      const data = await request<{ Page?: { media?: AniListMedia[] } }>(MANGA_SCHEDULE_QUERY, { page: 1 });
      const rows = data.Page?.media ?? [];
      const out: MangaScheduleItem[] = [];
      const toRemember: Anime[] = [];
      for (const raw of rows) {
        const manga = mapMedia(raw, 'MANGA');
        if (!manga.cover) continue;
        toRemember.push(manga);
        const upcoming = raw.status === 'NOT_YET_RELEASED';
        const isKorean = raw.countryOfOrigin === 'KR';
        const group: MangaScheduleItem['group'] = upcoming
          ? 'Upcoming Manga Debuts'
          : isKorean
          ? 'Korean Manhwa Updates'
          : 'Weekly & Ongoing Serialization';
        out.push({
          id: `msched-${manga.id}`,
          group,
          badge: upcoming
            ? 'UPCOMING'
            : manga.chapters
            ? `${manga.chapters} CH`
            : isKorean
            ? 'MANHWA'
            : 'ONGOING',
          subtitle: upcoming
            ? manga.year
              ? `Expected ${manga.year}`
              : 'Scheduled upcoming release'
            : manga.chapters
            ? `${manga.chapters} chapters released · Ongoing serialization`
            : 'Active ongoing serialization',
          anime: manga,
        });
      }
      animeStore.rememberMany(toRemember);
      return out;
    },
    15 * 60 * 1000
  );
}

export interface FranchiseScheduleEntry {
  anilistId: number;
  title: string;
  status: string;
  nextEpisode?: {
    episode: number;
    airingAt: number;
  };
}

const FRANCHISE_SCHEDULE_QUERY = `
  query FranchiseSchedule($ids: [Int]) {
    Page(page: 1, perPage: 30) {
      media(id_in: $ids) {
        id
        status
        title { english romaji }
        nextAiringEpisode { airingAt episode }
      }
    }
  }
`;

export async function fetchFranchiseSchedule(ids: number[]): Promise<FranchiseScheduleEntry[]> {
  const cleanIds = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))].slice(0, 25);
  if (!cleanIds.length) return [];
  return cached(
    `fsched:${cleanIds.join(',')}`,
    async () => {
      const data = await request<{
        Page?: {
          media?: {
            id: number;
            status?: string;
            title?: { english?: string; romaji?: string };
            nextAiringEpisode?: { airingAt: number; episode: number } | null;
          }[];
        };
      }>(FRANCHISE_SCHEDULE_QUERY, { ids: cleanIds });
      return (data.Page?.media ?? []).map((m) => ({
        anilistId: m.id,
        title: m.title?.english || m.title?.romaji || `#${m.id}`,
        status: m.status || 'FINISHED',
        nextEpisode: m.nextAiringEpisode
          ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
          : undefined,
      }));
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

const STUDIO_QUERY = `
  query StudioMedia($search: String, $page: Int) {
    Studio(search: $search) {
      id
      name
      media(isMain: true, sort: POPULARITY_DESC, perPage: 36, page: $page) {
        nodes {
          isAdult
          ${CORE}
        }
      }
    }
  }
`;

const STUDIO_SEARCH_LIST_QUERY = `
  query StudioSearchList($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      studios(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
        id
        name
        isAnimationStudio
      }
    }
  }
`;

export async function searchAniListStudios(query: string, limit = 12): Promise<string[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];
  return cached(
    `studio-search:${clean.toLowerCase()}:${limit}`,
    async () => {
      type SRes = {
        Page?: { studios?: { id: number; name?: string | null }[] | null } | null;
      };
      const data = await request<SRes>(STUDIO_SEARCH_LIST_QUERY, { search: clean, perPage: limit });
      return (data.Page?.studios ?? [])
        .map((s) => s.name?.trim())
        .filter((x): x is string => Boolean(x));
    },
    30 * 60 * 1000
  );
}

const STAFF_MANGA_QUERY = `
  query StaffManga($search: String, $page: Int) {
    Staff(search: $search) {
      id
      name { full }
      staffMedia(sort: POPULARITY_DESC, type: MANGA, perPage: 36, page: $page) {
        nodes {
          isAdult
          ${CORE}
        }
      }
    }
  }
`;

export async function fetchByStudio(
  studioName: string,
  mediaType: MediaType = 'ANIME',
  excludeIds: Set<string> = new Set(),
  limit = 20,
  page = 1
): Promise<Anime[]> {
  const cleanName = studioName.trim();
  const seen = new Set<string>();
  const out: Anime[] = [];

  const pushUnique = (item: Anime) => {
    if (!item.cover || seen.has(item.id) || excludeIds.has(item.id)) return;
    if ((item.mediaType ?? 'ANIME') !== mediaType) return;
    seen.add(item.id);
    out.push(item);
  };

  if (cleanName) {
    try {
      if (mediaType === 'ANIME') {
        type StudioRes = {
          Studio?: {
            media?: { nodes?: (AniListMedia & { isAdult?: boolean })[] };
          } | null;
        };
        const data = await cached(`studio:${cleanName.toLowerCase()}:p${page}`, () =>
          request<StudioRes>(STUDIO_QUERY, { search: cleanName, page })
        );
        for (const node of data.Studio?.media?.nodes ?? []) {
          if (node.isAdult) continue;
          pushUnique(mapMedia(node, 'ANIME'));
        }
      } else {
        type StaffRes = {
          Staff?: {
            staffMedia?: { nodes?: (AniListMedia & { isAdult?: boolean })[] };
          } | null;
        };
        const data = await cached(`staff-manga:${cleanName.toLowerCase()}:p${page}`, () =>
          request<StaffRes>(STAFF_MANGA_QUERY, { search: cleanName, page })
        );
        for (const node of data.Staff?.staffMedia?.nodes ?? []) {
          if (node.isAdult) continue;
          pushUnique(mapMedia(node, 'MANGA'));
        }
      }
    } catch {
      /* fallback to local cache below */
    }
  }

  // Fallback / enrichment from cached animeStore entries sharing the studio/author (page 1 only)
  if (cleanName && page === 1 && out.length < limit) {
    const targetLower = cleanName.toLowerCase();
    const localMatches = animeStore
      .all()
      .filter(
        (a) =>
          (a.mediaType ?? 'ANIME') === mediaType &&
          a.studios.some((s) => s.toLowerCase() === targetLower)
      )
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    for (const item of localMatches) {
      pushUnique(item);
      if (out.length >= limit) break;
    }
  }

  if (out.length > 0) animeStore.rememberMany(out);
  return out.slice(0, limit);
}

const STAFF_PERSON_QUERY = `
  query StaffPerson($id: Int, $page: Int) {
    Staff(id: $id) {
      id
      name { full native }
      image { large medium }
      description(asHtml: false)
      primaryOccupations
      homeTown
      gender
      age
      yearsActive
      favourites
      siteUrl
      staffMedia(sort: [POPULARITY_DESC], perPage: 25, page: $page) {
        pageInfo {
          hasNextPage
          total
        }
        edges {
          staffRole
          node {
            id
            type
            isAdult
            averageScore
            popularity
            title { english romaji }
            coverImage { extraLarge large medium }
            startDate { year }
          }
        }
      }
      characterMedia(sort: [POPULARITY_DESC], perPage: 25, page: $page) {
        pageInfo {
          hasNextPage
          total
        }
        edges {
          characterRole
          characters {
            name { full }
          }
          node {
            id
            type
            isAdult
            averageScore
            popularity
            title { english romaji }
            coverImage { extraLarge large medium }
            startDate { year }
          }
        }
      }
    }
  }
`;

export async function fetchStaffPersonDetail(staffId: number, page = 1): Promise<StaffPersonDetail | null> {
  if (!staffId) return null;
  return cached(
    `staff-detail:v4:${staffId}:p${page}`,
    async () => {
      type MediaNodeStub = {
        id: number;
        type?: MediaType | null;
        isAdult?: boolean | null;
        averageScore?: number | null;
        popularity?: number | null;
        title?: { english?: string | null; romaji?: string | null } | null;
        coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
        startDate?: { year?: number | null } | null;
      };
      type Res = {
        Staff?: {
          id: number;
          name?: { full?: string | null; native?: string | null } | null;
          image?: { large?: string | null; medium?: string | null } | null;
          description?: string | null;
          primaryOccupations?: (string | null)[] | null;
          homeTown?: string | null;
          gender?: string | null;
          age?: number | null;
          yearsActive?: (number | null)[] | null;
          favourites?: number | null;
          siteUrl?: string | null;
          staffMedia?: {
            pageInfo?: { hasNextPage?: boolean | null; total?: number | null } | null;
            edges?: {
              staffRole?: string | null;
              node?: MediaNodeStub | null;
            }[];
          } | null;
          characterMedia?: {
            pageInfo?: { hasNextPage?: boolean | null; total?: number | null } | null;
            edges?: {
              characterRole?: string | null;
              characters?: ({ name?: { full?: string | null } | null } | null)[] | null;
              node?: MediaNodeStub | null;
            }[];
          } | null;
        } | null;
      };
      const data = await request<Res>(STAFF_PERSON_QUERY, { id: staffId, page });
      const s = data.Staff;
      if (!s?.name?.full) return null;
      const works: PersonCreditWork[] = [];
      const seen = new Set<string>();
      const pushWork = (node: MediaNodeStub | null | undefined, role?: string) => {
        if (!node || node.isAdult) return;
        const mType: MediaType = node.type === 'MANGA' ? 'MANGA' : 'ANIME';
        const prefix = mType === 'MANGA' ? 'anilist-manga' : 'anilist';
        const mediaId = `${prefix}:${node.id}`;
        if (seen.has(mediaId)) return;
        seen.add(mediaId);
        works.push({
          id: mediaId,
          title: node.title?.english || node.title?.romaji || 'Untitled',
          cover: node.coverImage?.extraLarge || node.coverImage?.large || node.coverImage?.medium || '',
          mediaType: mType,
          role,
          year: node.startDate?.year ?? undefined,
          score: node.averageScore ? Number((node.averageScore / 10).toFixed(1)) : undefined,
          popularity: node.popularity ?? undefined,
        });
      };

      for (const edge of s.characterMedia?.edges ?? []) {
        const charNames = (edge.characters ?? [])
          .map((c) => c?.name?.full?.trim())
          .filter((x): x is string => Boolean(x));
        const vaRole = charNames.length
          ? `Voice (${charNames.slice(0, 2).join(', ')})`
          : edge.characterRole
          ? `Voice (${edge.characterRole})`
          : 'Voice Actor';
        pushWork(edge.node, vaRole);
      }
      for (const edge of s.staffMedia?.edges ?? []) {
        pushWork(edge.node, edge.staffRole ?? undefined);
      }

      const staffHasNext = Boolean(s.staffMedia?.pageInfo?.hasNextPage);
      const charHasNext = Boolean(s.characterMedia?.pageInfo?.hasNextPage);
      return {
        id: s.id,
        name: s.name.full,
        nativeName: s.name.native ?? undefined,
        image: s.image?.large || s.image?.medium || undefined,
        description: cleanDescription(s.description),
        primaryOccupations: (s.primaryOccupations ?? []).filter((x): x is string => Boolean(x)),
        homeTown: s.homeTown ?? undefined,
        gender: s.gender ?? undefined,
        age: s.age ?? undefined,
        yearsActive: (s.yearsActive ?? []).filter((n): n is number => typeof n === 'number'),
        favourites: s.favourites ?? undefined,
        siteUrl: s.siteUrl ?? undefined,
        works,
        hasMoreWorks: staffHasNext || charHasNext,
        totalWorks:
          (s.characterMedia?.pageInfo?.total ?? 0) + (s.staffMedia?.pageInfo?.total ?? 0) ||
          works.length,
      };
    },
    6 * 60 * 60 * 1000
  );
}

const CHARACTER_EXTRA_QUERY = `
  query CharacterExtra($id: Int) {
    Character(id: $id) {
      id
      name { full native }
      image { large medium }
      description(asHtml: false)
      gender
      age
      favourites
      siteUrl
      media(sort: [POPULARITY_DESC], perPage: 16) {
        edges {
          characterRole
          node {
            id
            type
            isAdult
            averageScore
            popularity
            title { english romaji }
            coverImage { extraLarge large medium }
            startDate { year }
          }
        }
      }
    }
  }
`;

export async function fetchCharacterExtra(characterId: number): Promise<CharacterDetailExtra | null> {
  if (!characterId) return null;
  return cached(
    `char-extra:v2:${characterId}`,
    async () => {
      type Res = {
        Character?: {
          id: number;
          name?: { full?: string | null; native?: string | null } | null;
          image?: { large?: string | null; medium?: string | null } | null;
          description?: string | null;
          gender?: string | null;
          age?: string | null;
          favourites?: number | null;
          siteUrl?: string | null;
          media?: {
            edges?: {
              characterRole?: string | null;
              node?: {
                id: number;
                type?: MediaType | null;
                isAdult?: boolean | null;
                averageScore?: number | null;
                popularity?: number | null;
                title?: { english?: string | null; romaji?: string | null } | null;
                coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
                startDate?: { year?: number | null } | null;
              } | null;
            }[];
          } | null;
        } | null;
      };
      const data = await request<Res>(CHARACTER_EXTRA_QUERY, { id: characterId });
      const ch = data.Character;
      if (!ch) return null;
      const appearances: PersonCreditWork[] = [];
      const seen = new Set<string>();
      for (const edge of ch.media?.edges ?? []) {
        const node = edge.node;
        if (!node || node.isAdult) continue;
        const mType: MediaType = node.type === 'MANGA' ? 'MANGA' : 'ANIME';
        const prefix = mType === 'MANGA' ? 'anilist-manga' : 'anilist';
        const mediaId = `${prefix}:${node.id}`;
        if (seen.has(mediaId)) continue;
        seen.add(mediaId);
        appearances.push({
          id: mediaId,
          title: node.title?.english || node.title?.romaji || 'Untitled',
          cover: node.coverImage?.extraLarge || node.coverImage?.large || node.coverImage?.medium || '',
          mediaType: mType,
          role: edge.characterRole ?? undefined,
          year: node.startDate?.year ?? undefined,
          score: node.averageScore ? Number((node.averageScore / 10).toFixed(1)) : undefined,
          popularity: node.popularity ?? undefined,
        });
      }
      return {
        id: ch.id,
        name: ch.name?.full ?? undefined,
        nativeName: ch.name?.native ?? undefined,
        image: ch.image?.large || ch.image?.medium || undefined,
        description: cleanDescription(ch.description),
        gender: ch.gender ?? undefined,
        age: ch.age ?? undefined,
        favourites: ch.favourites ?? undefined,
        siteUrl: ch.siteUrl ?? undefined,
        appearances,
      };
    },
    6 * 60 * 60 * 1000
  );
}

const STUDIO_DETAIL_QUERY = `
  query StudioDetail($search: String) {
    Studio(search: $search) {
      id
      name
      isAnimationStudio
      favourites
      siteUrl
      media(sort: [POPULARITY_DESC], perPage: 25) {
        nodes {
          isAdult
          ${CORE}
        }
      }
    }
  }
`;

export async function fetchStudioDetail(studioName: string): Promise<StudioDetail | null> {
  const clean = studioName.trim();
  if (!clean) return null;
  return cached(
    `studio-detail:${clean.toLowerCase()}`,
    async () => {
      type Res = {
        Studio?: {
          id?: number;
          name?: string;
          isAnimationStudio?: boolean;
          favourites?: number;
          siteUrl?: string;
          media?: { nodes?: (AniListMedia & { isAdult?: boolean })[] };
        } | null;
      };
      try {
        const data = await request<Res>(STUDIO_DETAIL_QUERY, { search: clean });
        const st = data.Studio;
        if (st?.name) {
          const works = (st.media?.nodes ?? [])
            .filter((n) => !n.isAdult)
            .map((n) => mapMedia(n, 'ANIME'))
            .filter((a) => Boolean(a.cover));
          if (works.length > 0) animeStore.rememberMany(works);
          return {
            id: st.id,
            name: st.name,
            isAnimationStudio: st.isAnimationStudio,
            favourites: st.favourites,
            siteUrl: st.siteUrl,
            works,
          };
        }
      } catch {
        /* fallback to fetchByStudio */
      }
      const works = await fetchByStudio(clean, 'ANIME', new Set(), 25);
      return works.length > 0 ? { name: clean, works } : { name: clean, works: [] };
    },
    6 * 60 * 60 * 1000
  );
}

async function tryWikipediaTitle(title: string): Promise<WikipediaSummary | null> {
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    title?: string;
    extract?: string;
    description?: string;
    type?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  };
  if (!j.extract || j.type === 'disambiguation') return null;
  return {
    title: j.title || title,
    extract: j.extract,
    description: j.description,
    thumbnail: j.thumbnail?.source,
    url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
  };
}

export async function fetchWikipediaSummary(query: string): Promise<WikipediaSummary | null> {
  const clean = query.trim();
  if (!clean) return null;
  return cached(
    `wiki:v2:${clean.toLowerCase()}`,
    async () => {
      try {
        const romanized = clean
          .replace(/uu/gi, 'u')
          .replace(/ou/gi, 'o')
          .replace(/oo/gi, 'o');
        const directCandidates = Array.from(new Set([clean, romanized]));
        for (const candidate of directCandidates) {
          const hit = await tryWikipediaTitle(candidate);
          if (hit) return hit;
        }

        const searchTerms = Array.from(
          new Set([romanized, `${clean} anime`, `${romanized} voice actor`])
        );
        for (const sr of searchTerms) {
          const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
              sr
            )}&srlimit=2&format=json&origin=*`
          );
          if (!searchRes.ok) continue;
          const sj = (await searchRes.json()) as {
            query?: { search?: { title: string }[] };
          };
          for (const item of sj.query?.search ?? []) {
            if (!item.title) continue;
            const summary = await tryWikipediaTitle(item.title);
            if (summary) return summary;
          }
        }
      } catch {
        /* ignore offline wiki failures */
      }
      return null;
    },
    24 * 60 * 60 * 1000
  );
}

const PUBLIC_ACTIVITIES_QUERY = `
  query PublicActivities($perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      activities(type: ANIME_LIST, sort: ID_DESC) {
        ... on ListActivity {
          id
          status
          progress
          createdAt
          siteUrl
          user {
            id
            name
            avatar { medium }
          }
          media {
            id
            type
            isAdult
            title { english romaji }
            coverImage { large }
          }
        }
      }
    }
  }
`;

export async function fetchPublicAniListActivities(limit = 18): Promise<ActivityItem[]> {
  try {
    type Res = {
      Page?: {
        activities?: {
          id: number;
          status?: string;
          progress?: string;
          createdAt?: number;
          siteUrl?: string;
          user?: { id?: number; name?: string; avatar?: { medium?: string } };
          media?: {
            id?: number;
            type?: MediaType;
            isAdult?: boolean;
            title?: { english?: string; romaji?: string };
            coverImage?: { large?: string };
          };
        }[];
      };
    };
    const data = await request<Res>(PUBLIC_ACTIVITIES_QUERY, { perPage: limit }, 0, 900);
    const rows = data.Page?.activities ?? [];
    return rows
      .filter((r) => r?.media?.id && !r.media.isAdult && r.user?.name)
      .map<ActivityItem>((r) => {
        const mType: MediaType = r.media?.type === 'MANGA' ? 'MANGA' : 'ANIME';
        const title = r.media?.title?.english || r.media?.title?.romaji || 'Anime';
        const rawStatus = (r.status || '').trim();
        const progText = r.progress ? ` ${r.progress} of` : '';
        const cap = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : 'Updated';
        return {
          id: `al-act:${r.id}`,
          userId: `al-user:${r.user?.id ?? r.user?.name}`,
          authorName: r.user?.name || 'AniList Member',
          authorHandle: `@${(r.user?.name || 'anilist').toLowerCase().replace(/[^a-z0-9_]/g, '')}`,
          authorAvatar: r.user?.avatar?.medium || '',
          kind: rawStatus.includes('watched') ? 'progress' : 'status',
          animeId: `${mType === 'MANGA' ? 'anilist-manga' : 'anilist'}:${r.media!.id}`,
          animeTitle: title,
          animeCover: r.media?.coverImage?.large || '',
          mediaType: mType,
          statusText: `${cap}${progText} ${title}`,
          progress: r.progress ? Number(String(r.progress).split('-').pop()) || undefined : undefined,
          likeCount: 0,
          likedByMe: false,
          replies: [],
          source: 'anilist',
          externalUrl: r.siteUrl || `https://anilist.co/activity/${r.id}`,
          createdAt: (r.createdAt ?? Math.floor(Date.now() / 1000)) * 1000,
        };
      });
  } catch {
    return [];
  }
}

const PUBLIC_REVIEWS_QUERY = `
  query PublicMediaReviews($id: Int, $type: MediaType) {
    Media(id: $id, type: $type) {
      reviews(sort: [RATING_DESC], perPage: 8) {
        nodes {
          id
          summary
          body
          score
          rating
          createdAt
          siteUrl
          user {
            id
            name
            avatar { medium }
          }
        }
      }
    }
  }
`;

export async function fetchPublicAniListReviews(
  anilistId: number,
  mediaType: MediaType = 'ANIME'
): Promise<UserReview[]> {
  if (!anilistId) return [];
  const mediaKey = `${mediaType === 'MANGA' ? 'anilist-manga' : 'anilist'}:${anilistId}`;
  return cached(
    `al-reviews:${mediaKey}`,
    async () => {
      try {
        type Res = {
          Media?: {
            reviews?: {
              nodes?: {
                id: number;
                summary?: string;
                body?: string;
                score?: number;
                rating?: number;
                createdAt?: number;
                siteUrl?: string;
                user?: { id?: number; name?: string; avatar?: { medium?: string } };
              }[];
            };
          };
        };
        const data = await request<Res>(PUBLIC_REVIEWS_QUERY, { id: anilistId, type: mediaType }, 0, 21600);
        const nodes = data.Media?.reviews?.nodes ?? [];
        return nodes
          .filter((n) => (n.summary || n.body) && n.id)
          .map<UserReview>((n) => {
            const score10 = typeof n.score === 'number' && n.score > 0 ? Number((n.score / 10).toFixed(1)) : undefined;
            const verdict: ReviewVerdict =
              score10 && score10 >= 7
                ? 'Recommended'
                : score10 && score10 >= 5
                ? 'Mixed Feelings'
                : 'Not Recommended';
            const cleanBody = cleanDescription(n.body || n.summary || '');
            return {
              id: `al-rev:${n.id}`,
              animeId: mediaKey,
              mediaType,
              userId: `al-user:${n.user?.id ?? n.user?.name}`,
              authorName: n.user?.name || 'AniList Critic',
              authorHandle: `@${(n.user?.name || 'anilist').toLowerCase().replace(/[^a-z0-9_]/g, '')}`,
              authorAvatar: n.user?.avatar?.medium || '',
              headline: n.summary?.slice(0, 90),
              body: cleanBody,
              overallScore: score10,
              verdict,
              isSpoiler: /spoiler/i.test(n.summary || ''),
              helpfulCount: n.rating ?? 0,
              votedByMe: false,
              source: 'anilist',
              externalUrl: n.siteUrl || `https://anilist.co/review/${n.id}`,
              createdAt: (n.createdAt ?? Math.floor(Date.now() / 1000)) * 1000,
              updatedAt: (n.createdAt ?? Math.floor(Date.now() / 1000)) * 1000,
            };
          });
      } catch {
        return [];
      }
    },
    6 * 60 * 60 * 1000
  );
}
