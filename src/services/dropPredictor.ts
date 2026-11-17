import { Anime, LibraryState } from '../types';

export type FitVerdict = 'GREAT_FIT' | 'GOOD_FIT' | 'NEUTRAL' | 'CAUTION' | 'HIGH_DROP_RISK';

export interface DropPrediction {
  matchScore: number; // 0-100
  dropRiskPercent: number; // 0-100
  verdict: FitVerdict;
  positives: string[];
  warnings: string[];
  sampleSize: number;
}

export function predictTasteAndDropRisk(
  target: Anime,
  libraryState: LibraryState,
  resolveMedia: (id: string) => Anime | undefined
): DropPrediction {
  const entries = Object.values(libraryState.entries).filter((e) => {
    const a = resolveMedia(e.animeId);
    return a && (a.mediaType ?? 'ANIME') === (target.mediaType ?? 'ANIME');
  });

  if (entries.length < 2) {
    return {
      matchScore: target.score ? Math.min(92, Math.round(target.score * 9.5)) : 75,
      dropRiskPercent: 10,
      verdict: 'NEUTRAL',
      positives: target.score && target.score >= 8.0 ? [`Strong community rating (${target.score.toFixed(1)}★)`] : [],
      warnings: [],
      sampleSize: entries.length,
    };
  }

  const genreLikes: Record<string, number> = {};
  const genreDrops: Record<string, number> = {};
  const tagLikes: Record<string, number> = {};
  const tagDrops: Record<string, number> = {};
  const studioLikes: Record<string, number> = {};
  const studioDrops: Record<string, number> = {};

  let droppedLongCount = 0;
  let completedLongCount = 0;

  for (const e of entries) {
    const a = resolveMedia(e.animeId);
    if (!a || a.id === target.id) continue;
    const isDrop = e.status === 'dropped' || (e.score && e.score > 0 && e.score <= 5);
    const isLove =
      (e.status === 'completed' && (!e.score || e.score >= 8)) ||
      (e.score !== undefined && e.score >= 8);

    const eps = a.episodes ?? a.chapters ?? 0;
    if (eps >= 50) {
      if (isDrop) droppedLongCount += 1;
      else if (isLove) completedLongCount += 1;
    }

    if (isDrop) {
      for (const g of a.genres) genreDrops[g] = (genreDrops[g] ?? 0) + 1;
      for (const t of a.tags.slice(0, 8)) tagDrops[t] = (tagDrops[t] ?? 0) + 1;
      for (const s of a.studios) studioDrops[s] = (studioDrops[s] ?? 0) + 1;
    } else if (isLove || e.status === 'watching') {
      const weight = isLove ? 2 : 1;
      for (const g of a.genres) genreLikes[g] = (genreLikes[g] ?? 0) + weight;
      for (const t of a.tags.slice(0, 8)) tagLikes[t] = (tagLikes[t] ?? 0) + weight;
      for (const s of a.studios) studioLikes[s] = (studioLikes[s] ?? 0) + weight;
    }
  }

  let matchPoints = 58;
  let riskPoints = 12;
  const positives: string[] = [];
  const warnings: string[] = [];

  for (const s of target.studios) {
    const liked = studioLikes[s] ?? 0;
    const dropped = studioDrops[s] ?? 0;
    if (liked >= 2 && liked > dropped) {
      matchPoints += 14;
      positives.push(`You rated/completed multiple ${s} titles`);
    } else if (dropped >= 2 && dropped > liked) {
      riskPoints += 22;
      warnings.push(`You dropped ${dropped} titles from ${s}`);
    }
  }

  const matchedGenres: string[] = [];
  const riskyGenres: string[] = [];
  for (const g of target.genres) {
    const liked = genreLikes[g] ?? 0;
    const dropped = genreDrops[g] ?? 0;
    if (liked >= 3 && liked >= dropped * 2) {
      matchPoints += 7;
      matchedGenres.push(g);
    } else if (dropped >= 2 && dropped >= liked) {
      riskPoints += 16;
      riskyGenres.push(g);
    }
  }

  if (matchedGenres.length > 0) {
    positives.push(`Strong genre fit: ${matchedGenres.slice(0, 3).join(', ')}`);
  }
  if (riskyGenres.length > 0) {
    warnings.push(`Higher drop pattern in ${riskyGenres.slice(0, 2).join(', ')}`);
  }

  for (const t of target.tags.slice(0, 8)) {
    const liked = tagLikes[t] ?? 0;
    const dropped = tagDrops[t] ?? 0;
    if (dropped >= 2 && dropped > liked) {
      riskPoints += 14;
      if (warnings.length < 3) warnings.push(`Tag "${t}" appears in ${dropped} of your dropped entries`);
    } else if (liked >= 4 && liked > dropped * 2) {
      matchPoints += 5;
      if (positives.length < 3) positives.push(`Matches your liked "${t}" theme`);
    }
  }

  const targetLen = target.episodes ?? target.chapters ?? 0;
  if (targetLen >= 50 && droppedLongCount >= 2 && droppedLongCount > completedLongCount) {
    riskPoints += 18;
    warnings.push(`Long commitment (${targetLen} parts) vs your drop history on long series`);
  }

  if (target.score && target.score >= 8.3) {
    matchPoints += 6;
  }

  const matchScore = Math.max(25, Math.min(99, Math.round(matchPoints - Math.max(0, riskPoints - 20) * 0.45)));
  const dropRiskPercent = Math.max(5, Math.min(92, Math.round(riskPoints)));

  let verdict: FitVerdict = 'NEUTRAL';
  if (dropRiskPercent >= 52 && matchScore < 65) verdict = 'HIGH_DROP_RISK';
  else if (dropRiskPercent >= 38) verdict = 'CAUTION';
  else if (matchScore >= 82 && dropRiskPercent <= 25) verdict = 'GREAT_FIT';
  else if (matchScore >= 68) verdict = 'GOOD_FIT';

  return {
    matchScore,
    dropRiskPercent,
    verdict,
    positives: positives.slice(0, 3),
    warnings: warnings.slice(0, 3),
    sampleSize: entries.length,
  };
}
