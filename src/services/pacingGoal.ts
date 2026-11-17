import { MediaType } from '../types';

const PACING_KEY = 'listtube.pacingGoals.v1';

export interface PacingPlan {
  remainingUnits: number;
  dailyPace: number;
  daysToFinish: number;
  estimatedDateLabel: string;
  minutesPerDay: number;
  estimatedRemainingVolumes?: number;
}

export function getSavedDailyPace(animeId: string, fallback = 2): number {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(PACING_KEY) ?? '{}') as Record<string, number>;
    const v = Number(raw[animeId]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveDailyPace(animeId: string, dailyPace: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(PACING_KEY) ?? '{}') as Record<string, number>;
    raw[animeId] = Math.max(1, Math.min(50, Math.round(dailyPace)));
    localStorage.setItem(PACING_KEY, JSON.stringify(raw));
  } catch {
    /* ignore */
  }
}

export function computePacingPlan(params: {
  progress: number;
  total: number;
  dailyPace: number;
  mediaType: MediaType;
  durationMins?: number;
  knownVolumes?: number;
  completedVolumes?: number;
  nowMs?: number;
}): PacingPlan | null {
  if (params.total <= 0) return null;
  const remainingUnits = Math.max(0, params.total - Math.max(0, params.progress));
  const dailyPace = Math.max(1, Math.round(params.dailyPace));
  const daysToFinish = remainingUnits === 0 ? 0 : Math.ceil(remainingUnits / dailyPace);
  const targetMs = (params.nowMs ?? Date.now()) + daysToFinish * 86_400_000;
  const estimatedDateLabel = new Date(targetMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const minsEach = params.mediaType === 'MANGA' ? 7 : params.durationMins ?? 24;
  const estimatedRemainingVolumes =
    params.mediaType === 'MANGA'
      ? params.knownVolumes && params.knownVolumes > 0
        ? Math.max(0, params.knownVolumes - (params.completedVolumes ?? 0))
        : Math.max(1, Math.ceil(remainingUnits / 9))
      : undefined;

  return {
    remainingUnits,
    dailyPace,
    daysToFinish,
    estimatedDateLabel,
    minutesPerDay: dailyPace * minsEach,
    estimatedRemainingVolumes,
  };
}
