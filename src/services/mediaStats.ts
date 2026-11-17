import { Anime, FeedbackEvent, ListEntry, MediaType } from '../types';

export interface DistEntry {
  label: string;
  count: number;
  meanScore?: number;
}

export interface HeatmapCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HotTakeItem {
  animeId: string;
  title: string;
  cover: string;
  userScore: number;
  globalScore: number;
  delta: number;
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
  genreStats: DistEntry[];
  studioStats: DistEntry[];
  heatmap: HeatmapCell[];
  globalBiasDelta: number;
  hotTakes: HotTakeItem[];
}

interface ScoreBucket {
  count: number;
  scoreSum: number;
  scored: number;
}

function recordBucket(map: Record<string, ScoreBucket>, key: string, score?: number) {
  const b = (map[key] ??= { count: 0, scoreSum: 0, scored: 0 });
  b.count += 1;
  if (score && score > 0) {
    b.scoreSum += score;
    b.scored += 1;
  }
}

function finalizeRanked(map: Record<string, ScoreBucket>, limit = 6): DistEntry[] {
  return Object.entries(map)
    .map(([label, b]) => ({
      label,
      count: b.count,
      meanScore: b.scored > 0 ? Math.round((b.scoreSum / b.scored) * 100) / 100 : undefined,
    }))
    .sort((a, b) => b.count - a.count || (b.meanScore ?? 0) - (a.meanScore ?? 0))
    .slice(0, limit);
}

export function computeMediaStats(
  entries: Record<string, ListEntry>,
  targetType: MediaType,
  resolveMedia: (id: string) => Anime | undefined,
  events: FeedbackEvent[] = [],
  nowMs = Date.now()
): MediaStatsSummary {
  const list = Object.values(entries).filter((e) => {
    const a = resolveMedia(e.animeId);
    return (a?.mediaType ?? e.mediaType ?? 'ANIME') === targetType;
  });

  let minutes = 0;
  let units = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  let biasSum = 0;
  let biasCount = 0;
  const hotTakesAll: HotTakeItem[] = [];
  const scoreDist: Record<number, number> = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const formatMap: Record<string, number> = {};
  const decadeMap: Record<string, number> = {};
  const genreBuckets: Record<string, ScoreBucket> = {};
  const studioBuckets: Record<string, ScoreBucket> = {};
  const dayCounts: Record<string, number> = {};

  const addDayTs = (ts?: number) => {
    if (!ts || !Number.isFinite(ts)) return;
    const key = new Date(ts).toISOString().slice(0, 10);
    dayCounts[key] = (dayCounts[key] ?? 0) + 1;
  };

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

    addDayTs(e.updatedAt);
    addDayTs(e.addedAt);

    const a = resolveMedia(e.animeId);
    const prog = e.progress ?? 0;
    units += prog;
    minutes += prog * (targetType === 'MANGA' ? 8 : a?.duration ?? 24);

    if (e.score && e.score > 0) {
      scoreSum += e.score;
      scoredCount += 1;
      const bucket = Math.min(10, Math.max(1, Math.round(e.score)));
      scoreDist[bucket] = (scoreDist[bucket] ?? 0) + 1;

      if (a?.score && a.score > 0) {
        const delta = Math.round((e.score - a.score) * 10) / 10;
        biasSum += delta;
        biasCount += 1;
        hotTakesAll.push({
          animeId: e.animeId,
          title: a.title,
          cover: a.cover,
          userScore: e.score,
          globalScore: a.score,
          delta,
        });
      }
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

    for (const g of a?.genres ?? []) {
      recordBucket(genreBuckets, g, e.score);
    }
    for (const s of a?.studios ?? []) {
      recordBucket(studioBuckets, s, e.score);
    }
  }

  for (const ev of events) {
    addDayTs(ev.at);
  }

  const formatDist = Object.entries(formatMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const decadeDist = Object.entries(decadeMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.label.localeCompare(a.label))
    .slice(0, 6);

  const TOTAL_DAYS = 182; // 26-week activity heatmap
  const heatmap: HeatmapCell[] = [];
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    const dayKey = new Date(nowMs - i * 86_400_000).toISOString().slice(0, 10);
    const count = dayCounts[dayKey] ?? 0;
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    heatmap.push({ date: dayKey, count, level });
  }

  const hotTakes = hotTakesAll
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

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
    genreStats: finalizeRanked(genreBuckets, 6),
    studioStats: finalizeRanked(studioBuckets, 6),
    heatmap,
    globalBiasDelta: biasCount > 0 ? Math.round((biasSum / biasCount) * 100) / 100 : 0,
    hotTakes,
  };
}
