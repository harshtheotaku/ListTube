import { Anime, LibraryState, ListStatus, MediaType, ScoredAnime } from '../types';
import { animeStore } from './animeStore';
import { resolveMalUrl } from './platform';
import { fetchMalEdgeHtml } from './supabase';
import { fetchMALTop } from './jikan';
import {
  currentSeason,
  fetchByGenre,
  fetchByMalIds,
  fetchByTag,
  fetchDetail,
  fetchPopular,
  fetchSeasonal,
  fetchTopRated,
  fetchTrending,
} from './anilist';

const STATUS_WEIGHT: Record<ListStatus, number> = {
  watching: 1.25,
  completed: 1.05,
  planned: 0.55,
  on_hold: 0.15,
  dropped: -1.1,
};

const EVENT_WEIGHT: Record<string, number> = {
  open: 0.12,
  add: 0.45,
  progress: 0.35,
  complete: 0.85,
  hold: -0.3,
  drop: -1.15,
  not_interested: -2.2,
};

/**
 * Curated Community Consensus Affinity Graph (sourced from MAL Top Recs, Reddit r/anime / r/Animesuggest,
 * and editorial consensus pairings).
 */
const COMMUNITY_CONSENSUS: Record<string, string[]> = {
  gintama: ['disastrous life of saiki k', 'sket dance', 'daily lives of high school boys', 'grand blue', 'konosuba', 'samurai champloo'],
  'shangri-la frontier': ['log horizon', 'bofuri', 'sword art online', 'solo leveling', 'overlord', 'the king\'s avatar', 'grimgar'],
  'campfire cooking': ['delicious in dungeon', 'restaurant to another world', 'farming life in another world', 'by the grace of the gods', 'laid-back camp', 'izakaya nobu', 'that time i got reincarnated as a slime'],
  'tondemo skill': ['delicious in dungeon', 'restaurant to another world', 'farming life in another world', 'by the grace of the gods', 'laid-back camp'],
  'frieren': ['violet evergarden', 'mushishi', 'delicious in dungeon', 'to your eternity', 'kino\'s journey', 'wandering witch', 'maquia'],
  'solo leveling': ['shangri-la frontier', 'sword art online', 'tower of god', 'the eminence in shadow', 'omniscient reader', 'arifuerta'],
  'attack on titan': ['vinland saga', '86 eighty-six', 'code geass', 'kabaneri of the iron fortress', 'fullmetal alchemist: brotherhood'],
  'jujutsu kaisen': ['chainsaw man', 'demon slayer', 'bleach', 'dandadan', 'hell\'s paradise', 'blue exorcist'],
  'chainsaw man': ['jujutsu kaisen', 'dorohedoro', 'dandadan', 'hell\'s paradise', 'devilman crybaby', 'cyberpunk: edgerunners'],
  'steins;gate': ['re:zero', 'erased', 'summertime rendering', 'madoka magica', 'link click', 'psycho-pass'],
  're:zero': ['steins;gate', 'summertime rendering', 'mushoku tensei', 'konosuba', 'erased', 'vivy'],
  'death note': ['code geass', 'monster', 'moriarty the patriot', 'psycho-pass', 'classroom of the elite', 'tomodachi game'],
  'cyberpunk: edgerunners': ['akudama drive', 'arcane', 'psycho-pass', 'devilman crybaby', 'cowboy bebop', 'ghost in the shell'],
  'vinland saga': ['berserk', 'kingdom', 'vagabond', 'attack on titan', 'dororo', 'golden kamuy'],
  'kaguya-sama': ['horimiya', 'the dangers in my heart', 'fruits basket', 'monthly girls\' nozaki-kun', 'toradora', 'makeine'],
  'spy x family': ['buddy daddies', 'the yakuza\'s guide to babysitting', 'kotaro lives alone', 'hinamatsuri', 'sakamoto days'],
  'one piece': ['hunter x hunter', 'naruto', 'fairy tail', 'bleach', 'black clover', 'magi'],
  'hunter x hunter': ['yu yu hakusho', 'fullmetal alchemist: brotherhood', 'tower of god', 'world trigger', 'jujutsu kaisen'],
  'haikyuu!!': ['kuroko\'s basketball', 'blue lock', 'aoashi', 'run with the wind', 'slam dunk', 'ace of diamond'],
  'bocchi the rock': ['k-on!', 'girls band cry', 'yuru camp', 'hibike! euphonium', 'jellyfish can\'t swim'],
  'apothecary diaries': ['ascendance of a bookworm', 'snow white with the red hair', 'raven of the inner palace', 'yatagarasu'],
  'delicious in dungeon': ['campfire cooking', 'frieren', 'restaurant to another world', 'made in abyss', 'toriko'],
  'blue box': ['the fragrant flower blooms with dignity', 'horimiya', 'chihayafuru', 'cross game', 'kaguya-sama'],
  'berserk': ['vinland saga', 'claymore', 'vagabond', 'devilman crybaby', 'hellsing ultimate', 'dororo'],
  'vagabond': ['vinland saga', 'berserk', 'kingdom', 'blade of the immortal', 'real'],
  'kingdom': ['vinland saga', 'arslan senki', 'golden kamuy', 'berserk', 'ravages of time'],
};

type FeatureMap = Record<string, number>;

interface Vector {
  genres: FeatureMap;
  tags: FeatureMap;
  studios: FeatureMap;
  decades: FeatureMap;
  formats: FeatureMap;
}

export interface TasteProfile {
  vector: Vector;
  sampleSize: number;
  anchors: { anime: Anime; weight: number }[];
  topGenres: { name: string; weight: number }[];
  topTags: { name: string; weight: number }[];
  totalWeight: number;
}

export interface ProfileSummary {
  genres: { name: string; weight: number }[];
  studios: { name: string; weight: number }[];
  decades: { name: string; weight: number }[];
  sampleSize: number;
  titlesTracked: number;
  watching: number;
  completed: number;
}

export interface RecommendationBundle {
  forYou: ScoredAnime[];
  continueWatching: Anime[];
  shelves: { id: string; title: string; subtitle?: string; items: Anime[] }[];
  coldStart: boolean;
  personalised: boolean;
  profile: ProfileSummary;
}

function emptyVector(): Vector {
  return { genres: {}, tags: {}, studios: {}, decades: {}, formats: {} };
}

function bump(map: FeatureMap, key: string | undefined, weight: number): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + weight;
}

function decadeOf(year?: number): string | undefined {
  if (!year) return undefined;
  return `${Math.floor(year / 10) * 10}s`;
}

function vectorOf(anime: Anime): Vector {
  const vector = emptyVector();
  for (const genre of anime.genres) bump(vector.genres, genre, 0.7);
  anime.tags.slice(0, 12).forEach((tag, idx) => {
    const tagRankWeight = idx < 4 ? 1.55 : idx < 8 ? 1.15 : 0.75;
    bump(vector.tags, tag, tagRankWeight);
  });
  for (const studio of anime.studios) bump(vector.studios, studio, 1.0);
  bump(vector.decades, decadeOf(anime.year), 0.25);
  bump(vector.formats, anime.format ?? undefined, 0.2);
  return vector;
}

function addVector(target: Vector, source: Vector, scale: number): void {
  for (const group of Object.keys(target) as (keyof Vector)[]) {
    for (const [key, value] of Object.entries(source[group])) {
      target[group][key] = (target[group][key] ?? 0) + value * scale;
    }
  }
}

function norm(vector: Vector): number {
  let sum = 0;
  for (const group of Object.keys(vector) as (keyof Vector)[]) {
    for (const value of Object.values(vector[group])) sum += value * value;
  }
  return Math.sqrt(sum);
}

function dot(a: Vector, b: Vector): number {
  let sum = 0;
  for (const group of Object.keys(a) as (keyof Vector)[]) {
    const left = a[group];
    const right = b[group];
    for (const [key, value] of Object.entries(left)) {
      const other = right[key];
      if (other) sum += value * other;
    }
  }
  return sum;
}

function cosine(a: Vector, aNorm: number, b: Vector): number {
  const bNorm = norm(b);
  if (!aNorm || !bNorm) return 0;
  return dot(a, b) / (aNorm * bNorm);
}

function daysSince(timestamp: number): number {
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}

function isPositiveStatus(status: ListStatus): boolean {
  return status === 'watching' || status === 'completed' || status === 'planned';
}

function scoreFactor(score?: number): number {
  if (!score) return 1;
  return 0.45 + 0.55 * ((score - 5) / 5);
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isConsensusMatch(anchorTitle: string, candidateTitle: string): boolean {
  const anchorLower = anchorTitle.toLowerCase();
  const candLower = candidateTitle.toLowerCase();
  for (const [key, recs] of Object.entries(COMMUNITY_CONSENSUS)) {
    if (anchorLower.includes(key)) {
      if (recs.some((r) => candLower.includes(r))) return true;
    }
  }
  return false;
}

function consensusNamesFor(title: string): string[] {
  const lower = title.toLowerCase();
  for (const [key, recs] of Object.entries(COMMUNITY_CONSENSUS)) {
    if (lower.includes(key)) return recs;
  }
  return [];
}

const malRecsCache = new Map<string, Anime[]>();

/**
 * Fetches real MyAnimeList user-voted recommendations directly from MAL userrecs page
 * (via Vite proxy on Web / CapacitorHttp on Android) and hydrates them with AniList official artwork.
 */
async function fetchMalUserRecs(malId: number, mediaType: MediaType): Promise<Anime[]> {
  const cacheKey = `${mediaType}:${malId}`;
  const hit = malRecsCache.get(cacheKey);
  if (hit) return hit;

  const typeSeg = mediaType === 'MANGA' ? 'manga' : 'anime';

  try {
    let html = await fetchMalEdgeHtml(typeSeg, malId, 'userrecs');
    if (!html) {
      const url = resolveMalUrl(`/${typeSeg}/${malId}/_/userrecs`);
      if (!url) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      html = await res.text();
    }
    if (!html) return [];

    const regex = new RegExp(`/recommendations/${typeSeg}/(\\d+)-(\\d+)`, 'g');
    const orderedIds: number[] = [];
    const seen = new Set<number>([malId]);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null && orderedIds.length < 18) {
      const a = Number(match[1]);
      const b = Number(match[2]);
      const other = a === malId ? b : b === malId ? a : 0;
      if (other > 0 && !seen.has(other)) {
        seen.add(other);
        orderedIds.push(other);
      }
    }

    if (!orderedIds.length) return [];
    const hydrated = await fetchByMalIds(orderedIds, mediaType);
    // Preserve MAL community vote order
    const byId = new Map(hydrated.map((item) => [item.malId, item]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((item): item is Anime => Boolean(item));

    malRecsCache.set(cacheKey, ordered);
    return ordered;
  } catch {
    return [];
  }
}

export function buildTasteProfile(state: LibraryState, mediaType: MediaType = 'ANIME'): TasteProfile {
  const vector = emptyVector();
  let totalWeight = 0;
  let sampleCount = 0;
  const anchorWeights = new Map<string, number>();

  for (const entry of Object.values(state.entries)) {
    const anime = animeStore.get(entry.animeId);
    if (!anime || (anime.mediaType ?? 'ANIME') !== mediaType) continue;
    const weight = STATUS_WEIGHT[entry.status] * scoreFactor(entry.score);
    if (!weight) continue;
    addVector(vector, vectorOf(anime), weight);
    totalWeight += Math.abs(weight);

    if (isPositiveStatus(entry.status)) {
      sampleCount += 1;
      const anchorScore = entry.score ? entry.score / 10 : 0.7;
      const anchorWeight = Math.max(0, weight) * (0.4 + anchorScore);
      anchorWeights.set(entry.animeId, (anchorWeights.get(entry.animeId) ?? 0) + anchorWeight);
    }
  }

  for (const evt of state.events) {
    if (evt.type === 'not_interested') continue;
    const anime = animeStore.get(evt.animeId);
    if (!anime || (anime.mediaType ?? 'ANIME') !== mediaType) continue;
    const base = EVENT_WEIGHT[evt.type] ?? 0;
    if (!base) continue;

    let weight = base;
    if (evt.type === 'rate' && typeof evt.value === 'number') {
      weight = ((evt.value - 5) / 5) * 1.15;
    }
    weight *= Math.exp(-daysSince(evt.at) / 60);
    addVector(vector, vectorOf(anime), weight);
    totalWeight += Math.abs(weight);
  }

  const interestList = mediaType === 'MANGA' ? state.mangaInterests ?? [] : state.interests ?? [];
  const interestWeight = Math.max(1.2, totalWeight * 0.03);
  for (const genre of interestList) {
    bump(vector.genres, genre, interestWeight);
    totalWeight += interestWeight;
  }

  const anchors = [...anchorWeights.entries()]
    .map(([id, weight]) => ({ anime: animeStore.get(id), weight }))
    .filter((item): item is { anime: Anime; weight: number } => Boolean(item.anime))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 18);

  const topGenres = Object.entries(vector.genres)
    .sort((a, b) => b[1] - a[1])
    .map(([name, weight]) => ({ name, weight }));

  const topTags = Object.entries(vector.tags)
    .sort((a, b) => b[1] - a[1])
    .map(([name, weight]) => ({ name, weight }));

  return {
    vector,
    sampleSize: sampleCount || interestList.length,
    anchors,
    topGenres,
    topTags,
    totalWeight,
  };
}

function tagAndGenreOverlap(a: Anime, b: Anime): number {
  const tagsA = new Set([...a.tags, ...a.genres]);
  const tagsB = new Set([...b.tags, ...b.genres]);
  if (!tagsA.size || !tagsB.size) return 0;
  let shared = 0;
  for (const t of tagsA) {
    if (tagsB.has(t)) shared += a.tags.includes(t) && b.tags.includes(t) ? 1.5 : 0.8;
  }
  return shared / Math.max(tagsA.size, tagsB.size);
}

function qualityPrior(anime: Anime): number {
  if (!anime.score) return 0.45;
  return Math.min(1, Math.max(0, (anime.score - 5.0) / 4.5));
}

function popularityPrior(anime: Anime): number {
  const popularity = anime.popularity ?? 0;
  if (!popularity) return 0;
  return Math.min(1, Math.log10(popularity + 1) / 6.4);
}

function freshnessPrior(anime: Anime): number {
  if (!anime.year) return 0.2;
  const age = new Date().getFullYear() - anime.year;
  if (age <= 0) return 1;
  if (age <= 2) return 0.8;
  if (age <= 5) return 0.5;
  if (age <= 10) return 0.3;
  return 0.15;
}

function diversify(
  scored: { anime: Anime; score: number }[],
  limit: number,
  lambda = 0.78
): { anime: Anime; score: number }[] {
  const pool = [...scored];
  const selected: { anime: Anime; score: number }[] = [];

  while (pool.length && selected.length < limit) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const maxOverlap = selected.reduce(
        (max, chosen) => Math.max(max, tagAndGenreOverlap(candidate.anime, chosen.anime)),
        0
      );
      const value = lambda * candidate.score - (1 - lambda) * maxOverlap;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected;
}

function dedupe(list: Anime[]): Anime[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const out: Anime[] = [];
  for (const anime of list) {
    if (!anime.id || seenIds.has(anime.id)) continue;
    const key = normalizeTitleKey(anime.title);
    if (seenTitles.has(key)) continue;
    seenIds.add(anime.id);
    seenTitles.add(key);
    out.push(anime);
  }
  return out;
}

function interleave(lists: Anime[][], limit = Infinity): Anime[] {
  const seen = new Set<string>();
  const out: Anime[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let index = 0; index < longest && out.length < limit; index += 1) {
    for (const list of lists) {
      const anime = list[index];
      if (!anime || seen.has(anime.id)) continue;
      seen.add(anime.id);
      out.push(anime);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function topFeatures(map: Record<string, number>, limit: number): { name: string; weight: number }[] {
  return Object.entries(map)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, weight]) => ({ name, weight }));
}

function profileSummary(
  state: LibraryState,
  profile: TasteProfile,
  mediaType: MediaType
): ProfileSummary {
  const entries = Object.values(state.entries).filter((e) => {
    const a = animeStore.get(e.animeId);
    return a ? (a.mediaType ?? 'ANIME') === mediaType : (e.mediaType ?? 'ANIME') === mediaType;
  });
  return {
    genres: profile.topGenres.slice(0, 5),
    studios: topFeatures(profile.vector.studios, 3),
    decades: topFeatures(profile.vector.decades, 3),
    sampleSize: profile.sampleSize,
    titlesTracked: entries.length,
    watching: entries.filter((e) => e.status === 'watching').length,
    completed: entries.filter((e) => e.status === 'completed').length,
  };
}

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Fetches community recommendations for an anchor from:
 * 1) Direct AniList recommendations + relations
 * 2) Prequel/Parent Season 1 community recommendations if anchor is a sequel
 * 3) Live MyAnimeList community /userrecs votes
 */
async function fetchCommunityRecsForAnchor(
  anchor: Anime
): Promise<{ anime: Anime; weight: number; anchorTitle: string; sourceLabel: string }[]> {
  const results = new Map<
    string,
    { anime: Anime; weight: number; anchorTitle: string; sourceLabel: string }
  >();
  const mediaType = anchor.mediaType ?? 'ANIME';

  let hydrated = anchor;
  if (anchor.source === 'anilist' && anchor.anilistId && anchor.similar.length === 0) {
    const detail = await settle(fetchDetail(anchor.anilistId, mediaType));
    if (detail) {
      hydrated = detail;
      animeStore.remember(detail);
    }
  }

  const ingestAniListSimilar = (source: Anime) => {
    for (const sim of source.similar) {
      if (sim.id === anchor.id) continue;
      if (sim.mediaType && sim.mediaType !== mediaType) continue;
      const item = animeStore.get(sim.id);
      if (!item || !item.cover) continue;
      const isDirect =
        sim.relation === 'SEQUEL' ||
        sim.relation === 'PREQUEL' ||
        sim.relation === 'SPIN_OFF' ||
        sim.relation === 'SIDE_STORY';
      const weight = isDirect ? 1.4 : 1.0 + Math.min(0.45, (sim.rating ?? 0) / 80);
      const sourceLabel = isDirect
        ? `Franchise · ${sim.relation?.replace('_', ' ').toLowerCase()}`
        : `Recommended by Anilist fans of ${anchor.title}`;
      const existing = results.get(item.id);
      if (!existing || existing.weight < weight) {
        results.set(item.id, { anime: item, weight, anchorTitle: anchor.title, sourceLabel });
      }
    }
  };

  ingestAniListSimilar(hydrated);

  // Inherit Season 1 / Prequel community recs when the anchor is a newer Season 2+ sequel
  const prequelRef = hydrated.similar.find((s) => s.relation === 'PREQUEL');
  let targetMalId = hydrated.malId;

  if (prequelRef && results.size < 8) {
    const prequelNumeric = Number(prequelRef.id.split(':')[1]);
    if (prequelNumeric) {
      const prequelFull = await settle(fetchDetail(prequelNumeric, mediaType));
      if (prequelFull) {
        ingestAniListSimilar(prequelFull);
        if (!targetMalId || results.size < 8) targetMalId = prequelFull.malId ?? targetMalId;
      }
    }
  }

  // Pull real MyAnimeList /userrecs community recommendations
  if (targetMalId) {
    const malRecs = await fetchMalUserRecs(targetMalId, mediaType);
    malRecs.forEach((item, idx) => {
      if (item.id === anchor.id) return;
      const weight = 1.25 - idx * 0.03;
      const existing = results.get(item.id);
      if (!existing || existing.weight < weight) {
        results.set(item.id, {
          anime: item,
          weight,
          anchorTitle: anchor.title,
          sourceLabel: `Recommended by MAL fans of ${anchor.title}`,
        });
      }
    });
  }

  return [...results.values()].sort((a, b) => b.weight - a.weight);
}

function seedNoise(idNum: number, seed: number): number {
  if (seed <= 0) return 0;
  const h = Math.sin(idNum * 12.9898 + seed * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

export async function getRecommendations(
  state: LibraryState,
  limit = 20,
  mediaType: MediaType = 'ANIME',
  refreshSeed = 0,
  previouslyShownIds?: Set<string>
): Promise<RecommendationBundle> {
  const profile = buildTasteProfile(state, mediaType);
  const interestBoostGenres = mediaType === 'MANGA' ? state.mangaInterests ?? [] : state.interests ?? [];
  const hasInterests = interestBoostGenres.length > 0;
  const personalised = profile.totalWeight > 0 || hasInterests;
  const coldStart = !personalised;
  const { season, year } = currentSeason();

  const tracked = new Set(Object.keys(state.entries));
  const hidden = new Set(state.notInterested);

  const profileGenres = profile.topGenres.slice(0, 6).map((genre) => genre.name);
  const genrePool = [...new Set([...interestBoostGenres, ...profileGenres])];
  const gIdx0 = genrePool.length ? refreshSeed % genrePool.length : 0;
  const gIdx1 = genrePool.length > 1 ? (refreshSeed + 2) % genrePool.length : gIdx0;
  const topGenres = [genrePool[gIdx0], genrePool[gIdx1]].filter(Boolean) as string[];
  const tagCount = Math.min(6, profile.topTags.length);
  const topTag = tagCount > 0 ? profile.topTags[refreshSeed % tagCount]?.name : undefined;

  // Select a different personalized subset of anchors on every app open / refresh
  const selectedAnchors: { anime: Anime; weight: number }[] = [];
  if (profile.anchors.length > 0) {
    const stride = profile.anchors.length > 4 ? 2 : 1;
    const offset = refreshSeed % profile.anchors.length;
    for (let i = 0; i < Math.min(4, profile.anchors.length); i += 1) {
      const idx = (offset + i * stride) % profile.anchors.length;
      const cand = profile.anchors[idx];
      if (!selectedAnchors.some((a) => a.anime.id === cand.anime.id)) {
        selectedAnchors.push(cand);
      }
    }
  }

  const anchorRecsPromise = Promise.all(
    selectedAnchors.map((a) => fetchCommunityRecsForAnchor(a.anime))
  );

  const discoveryPage = refreshSeed > 0 ? (refreshSeed % 3) + 1 : 1;
  const genrePage = refreshSeed > 0 ? (refreshSeed % 4) + 1 : 1;
  const genreSort =
    refreshSeed % 3 === 1
      ? ['POPULARITY_DESC']
      : refreshSeed % 3 === 2
      ? ['TRENDING_DESC', 'SCORE_DESC']
      : ['SCORE_DESC'];

  const [trending, seasonal, popular, byGenre1, byGenre2, byTopTag, topRated, anchorRecsNested] =
    await Promise.all([
      settle(fetchTrending(30, coldStart ? discoveryPage : 1, mediaType)),
      settle(fetchSeasonal(24, mediaType, refreshSeed > 0 ? (refreshSeed % 2) + 1 : 1)),
      settle(fetchPopular(24, mediaType, coldStart ? discoveryPage : 1)),
      topGenres[0] ? settle(fetchByGenre(topGenres[0], 24, genreSort, mediaType, genrePage)) : Promise.resolve(null),
      topGenres[1] && topGenres[1] !== topGenres[0]
        ? settle(fetchByGenre(topGenres[1], 24, ['SCORE_DESC'], mediaType, genrePage))
        : Promise.resolve(null),
      topTag ? settle(fetchByTag(topTag, 24, genreSort, mediaType, genrePage)) : Promise.resolve(null),
      settle(fetchTopRated(24, mediaType, discoveryPage)),
      anchorRecsPromise,
    ]);

  const communityMap = new Map<string, { weight: number; anchorTitle: string; sourceLabel: string }>();
  const communityItems: Anime[] = [];
  for (const list of anchorRecsNested) {
    for (const rec of list) {
      communityItems.push(rec.anime);
      const prev = communityMap.get(rec.anime.id);
      if (!prev || rec.weight > prev.weight) {
        communityMap.set(rec.anime.id, {
          weight: rec.weight,
          anchorTitle: rec.anchorTitle,
          sourceLabel: rec.sourceLabel,
        });
      }
    }
  }

  const trendingList = trending ?? [];
  const seasonalList = seasonal ?? [];
  const popularList = popular ?? [];
  const topRatedList = topRated ?? [];

  let fallbackTop: Anime[] = [];
  if (
    trendingList.length === 0 &&
    popularList.length === 0 &&
    topRatedList.length === 0 &&
    communityItems.length < limit
  ) {
    fallbackTop = (await settle(fetchMALTop(mediaType, (refreshSeed % 3) + 1))) ?? [];
  }

  const cachedPersonalPool = coldStart
    ? []
    : animeStore
        .all()
        .filter((a) => (a.mediaType ?? 'ANIME') === mediaType && (a.score ?? 0) >= 7.0)
        .slice(0, 120);

  const candidates = (
    coldStart
      ? interleave([trendingList, topRatedList, seasonalList, popularList, fallbackTop], 100)
      : dedupe([
          ...communityItems,
          ...(byTopTag ?? []),
          ...(byGenre1 ?? []),
          ...(byGenre2 ?? []),
          ...cachedPersonalPool,
          ...trendingList,
          ...seasonalList,
          ...popularList,
          ...topRatedList,
          ...fallbackTop,
        ])
  ).filter(
    (anime) =>
      (anime.mediaType ?? 'ANIME') === mediaType &&
      !tracked.has(anime.id) &&
      !hidden.has(anime.id) &&
      anime.cover
  );

  animeStore.rememberMany(candidates);

  // Never discard personalized picks when refreshing; keep all candidates and apply smooth cooldown
  const activeCandidates = candidates;

  const profileNorm = norm(profile.vector);
  const sets = {
    seasonal: new Set(seasonalList.map((a) => a.id)),
    trending: new Set(trendingList.map((a) => a.id)),
    topRated: new Set(topRatedList.map((a) => a.id)),
    popular: new Set(popularList.map((a) => a.id)),
  };

  const scored = activeCandidates.map((anime) => {
    const content = cosine(profile.vector, profileNorm, vectorOf(anime));
    const commRec = communityMap.get(anime.id);
    const consensusAnchor = profile.anchors.find((a) => isConsensusMatch(a.anime.title, anime.title));

    const communityBoost = commRec ? 0.62 * commRec.weight : consensusAnchor ? 0.52 : 0;
    const affinity = topGenres.some((g) => anime.genres.includes(g)) ? 0.16 : 0;
    const interestBoost = interestBoostGenres.some((g) => anime.genres.includes(g)) ? 0.14 : 0;
    const hasPersonalMatch = Boolean(commRec || consensusAnchor || content >= 0.24 || affinity > 0);
    const sourcePrior = coldStart
      ? (sets.seasonal.has(anime.id) ? 0.12 : 0) +
        (sets.trending.has(anime.id) ? 0.1 : 0) +
        (sets.topRated.has(anime.id) ? 0.08 : 0)
      : hasPersonalMatch
      ? 0
      : -0.6;

    const wasShownRecently = refreshSeed > 0 && previouslyShownIds?.has(anime.id);
    const refreshPenalty = wasShownRecently ? (hasPersonalMatch ? -0.22 : -0.8) : 0;
    const varietyJitter =
      refreshSeed > 0
        ? seedNoise(anime.anilistId ?? anime.malId ?? 17, refreshSeed) *
          (personalised && hasPersonalMatch ? 0.26 : 0.14)
        : 0;

    const value =
      (coldStart ? 0.3 * qualityPrior(anime) : 0.58 * content) +
      communityBoost +
      0.14 * qualityPrior(anime) +
      0.06 * popularityPrior(anime) +
      0.06 * freshnessPrior(anime) +
      affinity +
      interestBoost +
      sourcePrior +
      refreshPenalty +
      varietyJitter;

    let reason = 'Picked for your taste';
    if (commRec) {
      reason = commRec.sourceLabel;
    } else if (consensusAnchor) {
      reason = `Reddit & MAL pick for ${consensusAnchor.anime.title}`;
    } else {
      const studioAnchor = profile.anchors.find((a) =>
        anime.studios.some((s) => a.anime.studios.includes(s))
      );
      const sharedTag = anime.tags.find((t) => profile.topTags.slice(0, 5).some((pt) => pt.name === t));
      if (studioAnchor && anime.studios[0]) {
        reason = `Same Studio (${anime.studios[0]}) as ${studioAnchor.anime.title}`;
      } else if (sharedTag) {
        reason = `Matches your ${sharedTag} vibe`;
      } else if (anime.score && anime.score >= 8.2 && (anime.popularity ?? 0) < 75000) {
        reason = `Hidden Gem · ${anime.score.toFixed(1)}★`;
      } else if (sets.seasonal.has(anime.id)) {
        reason = mediaType === 'MANGA' ? 'Trending Manga' : 'New This Season';
      } else if (sets.topRated.has(anime.id)) {
        reason = `Top Rated · ${anime.score ? anime.score.toFixed(1) + '★' : 'AniList'}`;
      } else if (sets.trending.has(anime.id)) {
        reason = 'Trending on ListTube';
      } else if (anime.genres[0]) {
        reason = `Top pick in ${anime.genres[0]}`;
      }
    }

    return { anime, score: value, reason };
  });

  const reasonById = new Map(scored.map((item) => [item.anime.id, item.reason]));
  const selected = diversify(scored, limit).map((item) => ({
    anime: item.anime,
    score: item.score,
    reason: reasonById.get(item.anime.id) ?? 'Picked for your taste',
  }));

  const usedIds = new Set(selected.map((item) => item.anime.id));
  const pick = (list: Anime[], count: number): Anime[] =>
    dedupe(list)
      .filter((a) => !usedIds.has(a.id) && !tracked.has(a.id) && !hidden.has(a.id))
      .slice(0, count);

  const shelves: RecommendationBundle['shelves'] = [];

  if (!coldStart) {
    selectedAnchors.slice(0, 2).forEach((anchor, idx) => {
      const anchorCommunity = (anchorRecsNested[idx] ?? []).map((r) => r.anime);
      const anchorVec = vectorOf(anchor.anime);
      const anchorNorm = norm(anchorVec);
      const consensusTargets = consensusNamesFor(anchor.anime.title);

      const strictCandidates = candidates
        .filter((c) => {
          if (anchorCommunity.some((ac) => ac.id === c.id)) return true;
          if (consensusTargets.some((name) => c.title.toLowerCase().includes(name))) return true;
          const sim = cosine(anchorVec, anchorNorm, vectorOf(c));
          const sharedTags = c.tags.filter((t) => anchor.anime.tags.includes(t)).length;
          return sim >= 0.36 && sharedTags >= 2;
        })
        .map((c) => ({
          anime: c,
          score:
            (anchorCommunity.some((ac) => ac.id === c.id) ? 1.5 : 0) +
            cosine(anchorVec, anchorNorm, vectorOf(c)) +
            qualityPrior(c) * 0.2,
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.anime);

      const items = pick([...anchorCommunity, ...strictCandidates], 14);
      if (items.length >= 3) {
        shelves.push({
          id: `anchor-${anchor.anime.id}`,
          title: `Because you subscribed to ${anchor.anime.title}`,
          subtitle: `MAL & AniList fan picks · ${anchor.anime.tags.slice(0, 2).join(' · ') || anchor.anime.genres.slice(0, 2).join(' · ')}`,
          items,
        });
      }
    });
  }

  const trendingShelf = pick(trendingList, 14);
  if (trendingShelf.length >= 4) {
    shelves.push({
      id: 'trending',
      title: coldStart ? 'Trending Now' : 'Trending on ListTube',
      subtitle: mediaType === 'MANGA' ? 'Most read this week' : 'What anime fans are watching this week',
      items: trendingShelf,
    });
  }

  if (mediaType === 'ANIME') {
    const seasonalShelf = pick(seasonalList, 14);
    if (seasonalShelf.length >= 4) {
      shelves.push({
        id: 'seasonal',
        title: `${season} ${year} Season`,
        subtitle: 'Currently airing episodes',
        items: seasonalShelf,
      });
    }
  }

  const hiddenGems = pick(
    [...topRatedList, ...candidates].filter((a) => (a.score ?? 0) >= 8.0 && (a.popularity ?? 0) < 120000),
    14
  );
  if (hiddenGems.length >= 4) {
    shelves.push({
      id: 'gems',
      title: 'Hidden Gems & Cult Classics',
      subtitle: 'Critically acclaimed titles you might have missed',
      items: hiddenGems,
    });
  }

  const continueWatching = Object.values(state.entries)
    .filter((entry) => entry.status === 'watching')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => animeStore.get(entry.animeId))
    .filter((anime): anime is Anime => Boolean(anime))
    .filter((anime) => (anime.mediaType ?? 'ANIME') === mediaType)
    .slice(0, 14);

  return {
    forYou: selected,
    continueWatching,
    shelves,
    coldStart,
    personalised,
    profile: profileSummary(state, profile, mediaType),
  };
}

/**
 * Infinite Feed Paginator for HomeView ("For You"):
 * Fetches deep paginated pools from AniList without ever repeating already-shown anime.
 */
export async function getRecommendationPage(
  state: LibraryState,
  page: number,
  excludeIds: Set<string>,
  mediaType: MediaType = 'ANIME',
  limit = 16
): Promise<ScoredAnime[]> {
  const profile = buildTasteProfile(state, mediaType);
  const tracked = new Set(Object.keys(state.entries));
  const hidden = new Set(state.notInterested);
  const interestGenres = mediaType === 'MANGA' ? state.mangaInterests ?? [] : state.interests ?? [];
  const topGenres = [...new Set([...interestGenres, ...profile.topGenres.map((g) => g.name)])];
  const topTag = profile.topTags[page % Math.max(1, Math.min(3, profile.topTags.length))]?.name;

  const [trend, pop, top, genreBatch, tagBatch] = await Promise.all([
    settle(fetchTrending(24, page, mediaType)),
    settle(fetchPopular(24, mediaType, page)),
    settle(fetchTopRated(24, mediaType, page)),
    topGenres[page % Math.max(1, topGenres.length)]
      ? settle(
          fetchByGenre(
            topGenres[page % topGenres.length],
            24,
            ['SCORE_DESC'],
            mediaType,
            Math.max(1, Math.ceil(page / 2))
          )
        )
      : Promise.resolve(null),
    topTag ? settle(fetchByTag(topTag, 20, ['SCORE_DESC'], mediaType, page)) : Promise.resolve(null),
  ]);

  const pool = dedupe([
    ...(tagBatch ?? []),
    ...(genreBatch ?? []),
    ...(trend ?? []),
    ...(pop ?? []),
    ...(top ?? []),
  ]).filter(
    (a) =>
      (a.mediaType ?? 'ANIME') === mediaType &&
      !excludeIds.has(a.id) &&
      !tracked.has(a.id) &&
      !hidden.has(a.id) &&
      a.cover
  );

  animeStore.rememberMany(pool);

  const profileNorm = norm(profile.vector);
  const coldStart = profile.totalWeight <= 0 && interestGenres.length === 0;

  const scored = pool.map((anime) => {
    const sim = cosine(profile.vector, profileNorm, vectorOf(anime));
    const value =
      (coldStart ? 0.35 * qualityPrior(anime) : 0.55 * sim) +
      0.22 * qualityPrior(anime) +
      0.12 * popularityPrior(anime) +
      0.08 * freshnessPrior(anime);

    const sharedTag = anime.tags.find((t) => profile.topTags.slice(0, 6).some((pt) => pt.name === t));
    const reason = sharedTag
      ? `Matches your ${sharedTag} taste`
      : anime.score && anime.score >= 8.2
      ? `Critically Acclaimed · ${anime.score.toFixed(1)}★`
      : anime.genres[0]
      ? `Recommended in ${anime.genres[0]}`
      : 'Picked for you';

    return { anime, score: value, reason };
  });

  const reasonById = new Map(scored.map((s) => [s.anime.id, s.reason]));
  return diversify(scored, limit).map((item) => ({
    anime: item.anime,
    score: item.score,
    reason: reasonById.get(item.anime.id) ?? 'Picked for you',
  }));
}

/**
 * High-Precision Infinite "Up Next & Similar" Recommendation Engine:
 * Combines Franchise Relations + AniList Community Recs + Live MAL /userrecs Votes + Consensus Graph + Deep Tag Pagination.
 */
export async function getSimilar(
  anime: Anime,
  excludedIds: Set<string>,
  limit = 16,
  page = 1
): Promise<ScoredAnime[]> {
  const mediaType = anime.mediaType ?? 'ANIME';
  const results = new Map<string, { anime: Anime; score: number; reason: string }>();

  if (page === 1) {
    let hydrated = anime;
    if (anime.source === 'anilist' && anime.anilistId && anime.similar.length === 0) {
      const fetched = await settle(fetchDetail(anime.anilistId, mediaType));
      if (fetched) {
        hydrated = fetched;
        animeStore.remember(fetched);
      }
    }

    const ingestAniListSimilar = (src: Anime, penalty = 0) => {
      for (const sim of src.similar) {
        if (sim.id === anime.id || excludedIds.has(sim.id)) continue;
        if (sim.mediaType && sim.mediaType !== mediaType) continue;
        const full = animeStore.get(sim.id);
        if (!full || !full.cover) continue;

        const isDirectRelation =
          sim.relation === 'SEQUEL' ||
          sim.relation === 'PREQUEL' ||
          sim.relation === 'SPIN_OFF' ||
          sim.relation === 'SIDE_STORY';

        const score =
          (isDirectRelation ? 2.1 : 1.45 + Math.min(0.45, (sim.rating ?? 0) / 70)) - penalty;

        const reason = isDirectRelation
          ? `Franchise · ${sim.relation?.replace('_', ' ').toLowerCase()}`
          : `Recommended by Anilist fans of ${hydrated.title}`;

        const existing = results.get(full.id);
        if (!existing || existing.score < score) {
          results.set(full.id, { anime: full, score, reason });
        }
      }
    };

    ingestAniListSimilar(hydrated);

    // Pull Prequel community recs if sequel has sparse recs
    let targetMalId = hydrated.malId;
    const prequel = hydrated.similar.find((s) => s.relation === 'PREQUEL');
    if (prequel && results.size < 8) {
      const pId = Number(prequel.id.split(':')[1]);
      if (pId) {
        const prequelFull = await settle(fetchDetail(pId, mediaType));
        if (prequelFull) {
          ingestAniListSimilar(prequelFull, 0.1);
          if (!targetMalId || results.size < 8) targetMalId = prequelFull.malId ?? targetMalId;
        }
      }
    }

    // Live MyAnimeList /userrecs community recommendations
    if (targetMalId) {
      const malRecs = await fetchMalUserRecs(targetMalId, mediaType);
      malRecs.forEach((rec, idx) => {
        if (rec.id === anime.id || excludedIds.has(rec.id)) return;
        const malScore = 1.65 - idx * 0.03;
        const existing = results.get(rec.id);
        if (!existing || existing.score < malScore) {
          results.set(rec.id, {
            anime: rec,
            score: malScore,
            reason: `MAL Community Top Pick`,
          });
        }
      });
    }
  }

  // Deep Tag + Genre + Consensus pagination (also powers page > 1 infinite loading!)
  if (results.size < limit || page > 1) {
    const primaryTag = anime.tags[0];
    const secondaryTag = anime.tags[1];
    const [tagPool1, tagPool2, genrePool] = await Promise.all([
      primaryTag
        ? settle(fetchByTag(primaryTag, 24, ['SCORE_DESC'], mediaType, page))
        : Promise.resolve(null),
      secondaryTag
        ? settle(fetchByTag(secondaryTag, 20, ['POPULARITY_DESC'], mediaType, page))
        : Promise.resolve(null),
      anime.genres[0]
        ? settle(fetchByGenre(anime.genres[0], 24, ['SCORE_DESC'], mediaType, page))
        : Promise.resolve(null),
    ]);

    const extra = dedupe([
      ...(tagPool1 ?? []),
      ...(tagPool2 ?? []),
      ...(genrePool ?? []),
      ...(page === 1 ? animeStore.all() : []),
    ]).filter(
      (c) =>
        (c.mediaType ?? 'ANIME') === mediaType &&
        c.id !== anime.id &&
        !excludedIds.has(c.id) &&
        !results.has(c.id) &&
        c.cover
    );

    const animeVec = vectorOf(anime);
    const animeVecNorm = norm(animeVec);

    for (const candidate of extra) {
      const sim = cosine(animeVec, animeVecNorm, vectorOf(candidate));
      const sameStudio = anime.studios.some((s) => candidate.studios.includes(s));
      const consensus = isConsensusMatch(anime.title, candidate.title);

      const finalScore =
        sim * 0.8 +
        (sameStudio ? 0.25 : 0) +
        (consensus ? 0.7 : 0) +
        qualityPrior(candidate) * 0.15;

      if (sim < 0.24 && !sameStudio && !consensus) continue;

      const sharedTag = candidate.tags.find((t) => anime.tags.includes(t));
      const reason = consensus
        ? `Reddit & MAL consensus match`
        : sameStudio && candidate.studios[0]
        ? `Same studio · ${candidate.studios[0]}`
        : sharedTag
        ? `Shares ${sharedTag} theme`
        : `Similar taste · ${Math.round(Math.min(99, sim * 115))}% match`;

      results.set(candidate.id, { anime: candidate, score: finalScore, reason });
    }
  }

  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
