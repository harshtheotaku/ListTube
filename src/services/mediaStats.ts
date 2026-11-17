import { Anime, ListEntry, MediaType } from '../types';

export interface DistEntry {
  label: string;
  count: number;
}

export interface MediaStatsSummary {
  total: number;
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
  planned: number;
  days: number;
  meanScore: number;
  scoredCount: number;
  units: number;
  scoreDist: Record<number, number>;
  formatDist: DistEntry[];
  decadeDist: DistEntry[];
}

export function computeMediaStats(
  entries: Record<string, ListEntry>,
  targetType: MediaType,
  resolveMedia: (id: string) => Anime | undefined
): MediaStatsSummary {
  const list = Object.values(entries).filter((e) => {
    const a = resolveMedia(e.animeId);
    return (a?.mediaType ?? e.mediaType ?? 'ANIME') === targetType;
  });

  let minutes = 0;
  let units = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  const scoreDist: Record<number, number> = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const formatMap: Record<string, number> = {};
  const decadeMap: Record<string, number> = {};

  let watching = 0;
  let completed = 0;
  let onHold = 0;
  let dropped = 0;
  let planned = 0;

  for (const e of list) {
    if (e.status === 'watching') watching++;
    else if (e.status === 'completed') completed++;
    else if (e.status === 'on_hold') onHold++;
    else if (e.status === 'dropped') dropped++;
    else if (e.status === 'planned') planned++;

    const a = resolveMedia(e.animeId);
    const prog = e.progress ?? 0;
    units += prog;
    minutes += prog * (targetType === 'MANGA' ? 8 : a?.duration ?? 24);

    if (e.score && e.score > 0) {
      scoreSum += e.score;
      scoredCount += 1;
      const bucket = Math.min(10, Math.max(1, Math.round(e.score)));
      scoreDist[bucket] = (scoreDist[bucket] ?? 0) + 1;
    }

    const fmt = a?.format?.trim();
    if (fmt) {
      const normalized = fmt.replace(/_/g, ' ');
      formatMap[normalized] = (formatMap[normalized] ?? 0) + 1;
    }

    if (a?.year && a.year >= 1950) {
      const decade = `${Math.floor(a.year / 10) * 10}s`;
      decadeMap[decade] = (decadeMap[decade] ?? 0) + 1;
    }
  }

  const formatDist = Object.entries(formatMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const decadeDist = Object.entries(decadeMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.label.localeCompare(a.label))
    .slice(0, 6);

  return {
    total: list.length,
    watching,
    completed,
    onHold,
    dropped,
    planned,
    days: Math.round((minutes / 1440) * 10) / 10,
    meanScore: scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 100) / 100 : 0,
    scoredCount,
    units,
    scoreDist,
    formatDist,
    decadeDist,
  };
}
