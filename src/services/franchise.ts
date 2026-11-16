import { Anime } from '../types';
import { fetchDetail, searchAniList } from './anilist';
import { animeStore } from './animeStore';

/**
 * Extracts the root Anime/Manga Franchise Channel Name by stripping season,
 * part, arc, movie, and sequel suffixes so all seasons belong to one Channel.
 */
export function franchiseNameOf(title: string): string {
  let clean = title.trim();

  // Strip explicit subtitle arcs for major multi-arc series
  const colonSplits = [
    /^(Demon Slayer:\s*Kimetsu no Yaiba)\b.*$/i,
    /^(JoJo's Bizarre Adventure)\b.*$/i,
    /^(Re:ZERO\s*-Starting Life in Another World-)\b.*$/i,
    /^(Attack on Titan)\b.*$/i,
    /^(Gintama)\b.*$/i,
    /^(BLEACH)\b.*$/i,
    /^(Mob Psycho 100)\b.*$/i,
    /^(Kaguya-sama:\s*Love is War)\b.*$/i,
    /^(My Hero Academia)\b.*$/i,
    /^(Jujutsu Kaisen)\b.*$/i,
    /^(Haikyu!!|Haikyuu!!)\b.*$/i,
    /^(Sword Art Online)\b.*$/i,
    /^(Fate\/(?:stay night|Zero|Grand Order))\b.*$/i,
    /^(SPY x FAMILY)\b.*$/i,
    /^(Oshi no Ko|【Oshi no Ko】)\b.*$/i,
    /^(Solo Leveling)\b.*$/i,
    /^(Chainsaw Man)\b.*$/i,
    /^(Made in Abyss)\b.*$/i,
    /^(Bocchi the Rock!)\b.*$/i,
    /^(Dr\. STONE)\b.*$/i,
    /^(Blue Lock)\b.*$/i,
    /^(VINLAND SAGA)\b.*$/i,
    /^(KonoSuba|KONOSUBA)\b.*$/i,
    /^(Overlord)\b.*$/i,
    /^(Mushoku Tensei:\s*Jobless Reincarnation)\b.*$/i,
    /^(That Time I Got Reincarnated as a Slime)\b.*$/i,
    /^(The Apothecary Diaries)\b.*$/i,
    /^(Frieren:\s*Beyond Journey's End)\b.*$/i,
  ];

  for (const regex of colonSplits) {
    const m = clean.match(regex);
    if (m?.[1]) return m[1].trim();
  }

  // Generic season / part / movie / arc suffix stripping
  clean = clean
    .replace(/\s*[:\-–—]?\s*(?:Season|Series)\s+\d+.*$/i, '')
    .replace(/\s*[:\-–—]?\s*(?:1st|2nd|3rd|\d+th)\s+Season.*$/i, '')
    .replace(/\s*[:\-–—]?\s*(?:Final|The Final)\s+Season.*$/i, '')
    .replace(/\s*[:\-–—]?\s*Part\s+\d+.*$/i, '')
    .replace(/\s*[:\-–—]?\s*Cour\s+\d+.*$/i, '')
    .replace(/\s*[:\-–—]?\s*(?:The Movie|Movie)\b.*$/i, '')
    .replace(/\s+\d+(?:nd|rd|th)?$/i, '')
    .trim();

  return clean || title.trim();
}

export function channelHandleOf(franchiseName: string): string {
  const slug = franchiseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
  return `@${slug || 'anime'}`;
}

/**
 * Fetches all seasons, sequels, prequels, movies, and spin-offs for an anime/manga channel.
 */
export async function fetchFranchiseSeasons(seed: Anime): Promise<Anime[]> {
  const mediaType = seed.mediaType ?? 'ANIME';
  const rootName = franchiseNameOf(seed.title);
  const visited = new Map<string, Anime>();
  visited.set(seed.id, seed);

  // 1. Ensure seed has full relations loaded
  let hydratedSeed = seed;
  if (seed.source === 'anilist' && seed.anilistId && seed.similar.length === 0) {
    try {
      const d = await fetchDetail(seed.anilistId, mediaType);
      if (d) {
        hydratedSeed = d;
        visited.set(d.id, d);
        animeStore.remember(d);
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Collect direct franchise relation IDs
  const relationTypes = new Set([
    'PREQUEL',
    'SEQUEL',
    'PARENT',
    'SIDE_STORY',
    'SPIN_OFF',
    'ALTERNATIVE',
    'SUMMARY',
  ]);

  const directIds = new Set<number>();
  for (const rel of hydratedSeed.similar) {
    if (rel.relation && relationTypes.has(rel.relation) && rel.mediaType === mediaType) {
      const full = animeStore.get(rel.id);
      if (full) {
        visited.set(full.id, full);
        if (full.anilistId) directIds.add(full.anilistId);
      } else {
        const num = Number(rel.id.split(':')[1]);
        if (num) directIds.add(num);
      }
    }
  }

  // Walk one more hop on prequels/sequels + search AniList by root franchise name in parallel
  const [searchResults, ...hopDetails] = await Promise.all([
    searchAniList(rootName, 20, mediaType).catch(() => [] as Anime[]),
    ...[...directIds].slice(0, 5).map((id) => fetchDetail(id, mediaType).catch(() => null)),
  ]);

  for (const item of hopDetails) {
    if (!item) continue;
    visited.set(item.id, item);
    animeStore.remember(item);
    for (const rel of item.similar) {
      if (rel.relation && relationTypes.has(rel.relation) && rel.mediaType === mediaType) {
        const full = animeStore.get(rel.id);
        if (full && !visited.has(full.id)) visited.set(full.id, full);
      }
    }
  }

  // Add franchise search matches that genuinely share the root franchise title
  const normalizedRoot = rootName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const item of searchResults) {
    if ((item.mediaType ?? 'ANIME') !== mediaType) continue;
    const itemNorm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const romajiNorm = (item.titleRomaji ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      itemNorm.includes(normalizedRoot) ||
      franchiseNameOf(item.title).toLowerCase() === rootName.toLowerCase() ||
      (normalizedRoot.length >= 6 && romajiNorm.includes(normalizedRoot))
    ) {
      if (!visited.has(item.id)) visited.set(item.id, item);
    }
  }

  const all = [...visited.values()].filter((a) => a.cover);
  animeStore.rememberMany(all);

  // Sort chronologically (Year asc, TV before Movie/OVA)
  return all.sort((a, b) => {
    const yearDiff = (a.year ?? 9999) - (b.year ?? 9999);
    if (yearDiff !== 0) return yearDiff;
    const rank = (fmt?: string) => (fmt === 'TV' || fmt === 'MANGA' ? 0 : fmt === 'MOVIE' ? 1 : 2);
    return rank(a.format) - rank(b.format);
  });
}
