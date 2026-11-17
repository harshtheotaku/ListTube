import { Anime, LibraryState } from '../types';

export interface WrappedSummary {
  totalTracked: number;
  completedCount: number;
  episodesWatched: number;
  chaptersRead: number;
  totalHours: number;
  meanScore: number;
  topGenre: string;
  topGenres: string[];
  topStudio: string;
  archetype: string;
  topRatedPicks: { title: string; score: number; cover: string }[];
}

export function computeWrappedSummary(
  libraryState: LibraryState,
  resolveMedia: (id: string) => Anime | undefined
): WrappedSummary {
  const entries = Object.values(libraryState.entries);
  let completedCount = 0;
  let episodesWatched = 0;
  let chaptersRead = 0;
  let totalMinutes = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  const genreCounts: Record<string, number> = {};
  const studioCounts: Record<string, number> = {};
  const topRatedPicks: { title: string; score: number; cover: string }[] = [];

  for (const e of entries) {
    const a = resolveMedia(e.animeId);
    const isManga = (a?.mediaType ?? e.mediaType ?? 'ANIME') === 'MANGA';
    const prog = e.progress ?? 0;

    if (e.status === 'completed') completedCount += 1;
    if (isManga) {
      chaptersRead += prog;
      totalMinutes += prog * 7;
    } else {
      episodesWatched += prog;
      totalMinutes += prog * (a?.duration ?? 24);
    }

    if (e.score && e.score > 0) {
      scoreSum += e.score;
      scoredCount += 1;
      if (a) {
        topRatedPicks.push({ title: a.title, score: e.score, cover: a.cover });
      }
    }

    for (const g of a?.genres ?? []) {
      genreCounts[g] = (genreCounts[g] ?? 0) + (e.status === 'completed' ? 2 : 1);
    }
    for (const s of a?.studios ?? []) {
      studioCounts[s] = (studioCounts[s] ?? 0) + (e.score && e.score >= 8 ? 2 : 1);
    }
  }

  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const topStudio =
    Object.entries(studioCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Mixed Studios';

  const meanScore = scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : 0;

  let archetype = 'Explorer';
  if (episodesWatched >= 500 || chaptersRead >= 1000) archetype = 'Marathon Legend';
  else if (meanScore >= 8.5) archetype = 'Peak Connoisseur';
  else if (meanScore > 0 && meanScore <= 6.8) archetype = 'Sharp Critic';
  else if (topStudio !== 'Mixed Studios') archetype = `${topStudio} Loyalist`;

  topRatedPicks.sort((a, b) => b.score - a.score);

  return {
    totalTracked: entries.length,
    completedCount,
    episodesWatched,
    chaptersRead,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    meanScore,
    topGenre: topGenres[0] ?? 'Action',
    topGenres,
    topStudio,
    archetype,
    topRatedPicks: topRatedPicks.slice(0, 4),
  };
}

export function exportWrappedCardPng(summary: WrappedSummary, displayName: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, '#0F0F13');
  grad.addColorStop(0.55, '#1D1016');
  grad.addColorStop(1, '#0D1726');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1350);

  // Specular highlights
  ctx.fillStyle = 'rgba(255, 0, 0, 0.14)';
  ctx.beginPath();
  ctx.arc(880, 180, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('LISTTUBE WRAPPED', 72, 95);

  ctx.fillStyle = '#AAAAAA';
  ctx.font = '26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(displayName, 72, 138);

  ctx.fillStyle = '#FF3B30';
  ctx.font = 'bold 58px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(summary.archetype, 72, 240);

  const metrics: [string, string][] = [
    ['TITLES TRACKED', String(summary.totalTracked)],
    ['COMPLETED', String(summary.completedCount)],
    ['HOURS SPENT', `${summary.totalHours}h`],
    ['MEAN SCORE', summary.meanScore ? `${summary.meanScore} ★` : '—'],
    ['TOP GENRE', summary.topGenre],
    ['TOP STUDIO', summary.topStudio],
  ];

  metrics.forEach(([label, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 72 + col * 480;
    const y = 320 + row * 185;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, 440, 150);
    ctx.fillStyle = '#8E8E93';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(label, x + 28, y + 48);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(val.slice(0, 18), x + 28, y + 110);
  });

  ctx.fillStyle = '#8E8E93';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TOP FAVORITES', 72, 930);

  summary.topRatedPicks.forEach((p, idx) => {
    const y = 985 + idx * 62;
    ctx.fillStyle = '#F5C451';
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`★ ${p.score}`, 72, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(p.title.slice(0, 42), 185, y);
  });

  ctx.fillStyle = '#3EA6FF';
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('listtube.vercel.app', 72, 1290);

  const link = document.createElement('a');
  link.download = `ListTube-Wrapped-${displayName.replace(/\s+/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  return true;
}
