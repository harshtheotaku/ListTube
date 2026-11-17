import { Anime } from '../types';

export type EpisodeCanonTag = 'CANON' | 'MIXED' | 'FILLER' | 'RECAP';

export interface FillerSummary {
  totalEpisodes: number;
  canonCount: number;
  mixedCount: number;
  fillerCount: number;
  recapCount: number;
  canonPercent: number;
  hoursSaved: number;
  hasData: boolean;
}

interface RangeRule {
  start: number;
  end: number;
  tag: EpisodeCanonTag;
}

// Ranges inclusive [start, end]; unlisted episodes inside totalEpisodes default to CANON.
const CURATED_FILLER_RULES: { match: RegExp; rules: RangeRule[] }[] = [
  {
    match: /^naruto$/i,
    rules: [
      { start: 26, end: 26, tag: 'RECAP' },
      { start: 97, end: 97, tag: 'FILLER' },
      { start: 99, end: 99, tag: 'MIXED' },
      { start: 101, end: 106, tag: 'FILLER' },
      { start: 136, end: 140, tag: 'FILLER' },
      { start: 141, end: 142, tag: 'MIXED' },
      { start: 143, end: 219, tag: 'FILLER' },
    ],
  },
  {
    match: /naruto.*shippuden/i,
    rules: [
      { start: 57, end: 71, tag: 'FILLER' },
      { start: 90, end: 112, tag: 'FILLER' },
      { start: 144, end: 151, tag: 'FILLER' },
      { start: 170, end: 171, tag: 'FILLER' },
      { start: 176, end: 196, tag: 'FILLER' },
      { start: 223, end: 242, tag: 'FILLER' },
      { start: 257, end: 260, tag: 'RECAP' },
      { start: 271, end: 271, tag: 'FILLER' },
      { start: 279, end: 281, tag: 'FILLER' },
      { start: 284, end: 295, tag: 'FILLER' },
      { start: 303, end: 320, tag: 'FILLER' },
      { start: 347, end: 361, tag: 'FILLER' },
      { start: 376, end: 377, tag: 'FILLER' },
      { start: 389, end: 390, tag: 'FILLER' },
      { start: 394, end: 413, tag: 'FILLER' },
      { start: 416, end: 417, tag: 'FILLER' },
      { start: 422, end: 423, tag: 'FILLER' },
      { start: 427, end: 450, tag: 'FILLER' },
      { start: 464, end: 468, tag: 'FILLER' },
      { start: 480, end: 483, tag: 'MIXED' },
    ],
  },
  {
    match: /^bleach$/i,
    rules: [
      { start: 33, end: 33, tag: 'FILLER' },
      { start: 50, end: 50, tag: 'FILLER' },
      { start: 64, end: 108, tag: 'FILLER' },
      { start: 128, end: 137, tag: 'FILLER' },
      { start: 147, end: 149, tag: 'FILLER' },
      { start: 168, end: 189, tag: 'FILLER' },
      { start: 204, end: 205, tag: 'FILLER' },
      { start: 213, end: 214, tag: 'FILLER' },
      { start: 227, end: 265, tag: 'FILLER' },
      { start: 287, end: 287, tag: 'FILLER' },
      { start: 298, end: 299, tag: 'FILLER' },
      { start: 303, end: 305, tag: 'FILLER' },
      { start: 311, end: 341, tag: 'FILLER' },
      { start: 355, end: 355, tag: 'FILLER' },
    ],
  },
  {
    match: /^one piece$/i,
    rules: [
      { start: 54, end: 60, tag: 'FILLER' },
      { start: 98, end: 99, tag: 'FILLER' },
      { start: 131, end: 143, tag: 'FILLER' },
      { start: 196, end: 206, tag: 'FILLER' },
      { start: 220, end: 226, tag: 'FILLER' },
      { start: 279, end: 283, tag: 'RECAP' },
      { start: 291, end: 292, tag: 'FILLER' },
      { start: 303, end: 303, tag: 'FILLER' },
      { start: 317, end: 319, tag: 'FILLER' },
      { start: 326, end: 336, tag: 'FILLER' },
      { start: 382, end: 384, tag: 'FILLER' },
      { start: 406, end: 407, tag: 'FILLER' },
      { start: 426, end: 429, tag: 'FILLER' },
      { start: 457, end: 458, tag: 'RECAP' },
      { start: 492, end: 492, tag: 'FILLER' },
      { start: 542, end: 542, tag: 'FILLER' },
      { start: 575, end: 578, tag: 'FILLER' },
      { start: 626, end: 628, tag: 'FILLER' },
      { start: 747, end: 750, tag: 'FILLER' },
      { start: 780, end: 782, tag: 'FILLER' },
      { start: 895, end: 896, tag: 'FILLER' },
      { start: 907, end: 907, tag: 'FILLER' },
      { start: 1029, end: 1030, tag: 'FILLER' },
    ],
  },
  {
    match: /boruto/i,
    rules: [
      { start: 16, end: 17, tag: 'FILLER' },
      { start: 40, end: 41, tag: 'FILLER' },
      { start: 48, end: 50, tag: 'FILLER' },
      { start: 67, end: 92, tag: 'FILLER' },
      { start: 96, end: 105, tag: 'FILLER' },
      { start: 112, end: 119, tag: 'FILLER' },
      { start: 138, end: 140, tag: 'FILLER' },
      { start: 152, end: 156, tag: 'FILLER' },
      { start: 231, end: 255, tag: 'FILLER' },
      { start: 256, end: 281, tag: 'FILLER' },
    ],
  },
  {
    match: /black clover/i,
    rules: [
      { start: 29, end: 29, tag: 'RECAP' },
      { start: 66, end: 66, tag: 'RECAP' },
      { start: 82, end: 82, tag: 'FILLER' },
      { start: 123, end: 125, tag: 'RECAP' },
      { start: 131, end: 150, tag: 'FILLER' },
      { start: 151, end: 157, tag: 'MIXED' },
    ],
  },
  {
    match: /dragon ball z/i,
    rules: [
      { start: 9, end: 16, tag: 'MIXED' },
      { start: 39, end: 44, tag: 'FILLER' },
      { start: 108, end: 117, tag: 'FILLER' },
      { start: 170, end: 171, tag: 'FILLER' },
      { start: 195, end: 199, tag: 'FILLER' },
      { start: 274, end: 274, tag: 'FILLER' },
      { start: 288, end: 288, tag: 'FILLER' },
    ],
  },
  {
    match: /fairy tail/i,
    rules: [
      { start: 19, end: 19, tag: 'FILLER' },
      { start: 69, end: 75, tag: 'FILLER' },
      { start: 125, end: 150, tag: 'FILLER' },
      { start: 202, end: 226, tag: 'FILLER' },
    ],
  },
  {
    match: /^(attack on titan|demon slayer|jujutsu kaisen|fullmetal alchemist: brotherhood|hunter x hunter|death note|frieren|chainsaw man|vinland saga|mob psycho 100|steins;gate)/i,
    rules: [],
  },
];

function matchCuratedRules(anime: Pick<Anime, 'title' | 'titleRomaji'>): RangeRule[] | null {
  const candidates = [anime.title, anime.titleRomaji].filter((x): x is string => Boolean(x));
  for (const name of candidates) {
    const hit = CURATED_FILLER_RULES.find((entry) => entry.match.test(name.trim()));
    if (hit) return hit.rules;
  }
  return null;
}

export function getEpisodeClassification(
  anime: Pick<Anime, 'title' | 'titleRomaji' | 'mediaType'>,
  episodeNumber: number,
  dynamicMap?: Record<number, EpisodeCanonTag>
): EpisodeCanonTag | null {
  if (anime.mediaType === 'MANGA') return null;
  if (dynamicMap && dynamicMap[episodeNumber]) return dynamicMap[episodeNumber];
  const rules = matchCuratedRules(anime);
  if (!rules) return null;
  for (const r of rules) {
    if (episodeNumber >= r.start && episodeNumber <= r.end) return r.tag;
  }
  return 'CANON';
}

export function summarizeFillerPacing(
  anime: Pick<Anime, 'title' | 'titleRomaji' | 'episodes' | 'duration' | 'mediaType'>,
  dynamicMap?: Record<number, EpisodeCanonTag>
): FillerSummary {
  const total = Math.max(0, anime.episodes ?? 0);
  const rules = matchCuratedRules(anime);
  const hasDynamic = Boolean(dynamicMap && Object.keys(dynamicMap).length > 0);
  if (anime.mediaType === 'MANGA' || total === 0 || (!rules && !hasDynamic)) {
    return {
      totalEpisodes: total,
      canonCount: total,
      mixedCount: 0,
      fillerCount: 0,
      recapCount: 0,
      canonPercent: 100,
      hoursSaved: 0,
      hasData: false,
    };
  }

  let canonCount = 0;
  let mixedCount = 0;
  let fillerCount = 0;
  let recapCount = 0;

  for (let ep = 1; ep <= total; ep++) {
    const tag = getEpisodeClassification(anime, ep, dynamicMap) ?? 'CANON';
    if (tag === 'FILLER') fillerCount += 1;
    else if (tag === 'RECAP') recapCount += 1;
    else if (tag === 'MIXED') mixedCount += 1;
    else canonCount += 1;
  }

  const skippable = fillerCount + recapCount;
  const canonPercent = total > 0 ? Math.round(((canonCount + mixedCount) / total) * 100) : 100;
  const minsPerEp = anime.duration ?? 24;
  const hoursSaved = Math.round(((skippable * minsPerEp) / 60) * 10) / 10;

  return {
    totalEpisodes: total,
    canonCount,
    mixedCount,
    fillerCount,
    recapCount,
    canonPercent,
    hoursSaved,
    hasData: true,
  };
}

const jikanEpisodeCache = new Map<number, Record<number, EpisodeCanonTag>>();

export async function fetchJikanEpisodeFlags(malId?: number): Promise<Record<number, EpisodeCanonTag>> {
  if (!malId || malId <= 0) return {};
  const cached = jikanEpisodeCache.get(malId);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=1`, {
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data?: { mal_id: number; filler?: boolean; recap?: boolean }[];
    };
    const map: Record<number, EpisodeCanonTag> = {};
    for (const row of json.data ?? []) {
      if (row.recap) map[row.mal_id] = 'RECAP';
      else if (row.filler) map[row.mal_id] = 'FILLER';
      else map[row.mal_id] = 'CANON';
    }
    if (Object.keys(map).length > 0) {
      jikanEpisodeCache.set(malId, map);
    }
    return map;
  } catch {
    return {};
  }
}
