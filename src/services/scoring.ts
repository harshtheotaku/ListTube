import { ListEntry, ScoreFormat } from '../types';

export interface ScoreFormatMeta {
  id: ScoreFormat;
  label: string;
  shortLabel: string;
  max: number;
  step: number;
}

export const SCORE_FORMATS: ScoreFormatMeta[] = [
  { id: 'POINT_10_DECIMAL', label: '10-Point Decimal (8.5)', shortLabel: '0.5–10', max: 10, step: 0.5 },
  { id: 'POINT_10', label: '10-Point Integer (9/10)', shortLabel: '1–10', max: 10, step: 1 },
  { id: 'POINT_100', label: '100-Point Scale (85/100)', shortLabel: '1–100', max: 100, step: 1 },
  { id: 'POINT_5', label: '5-Star Scale (4.5★)', shortLabel: '0.5–5★', max: 5, step: 0.5 },
];

export function clampCanonical10(value?: number | null): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return undefined;
  const clamped = Math.max(0.1, Math.min(10, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * Converts a user-entered value in `format` into canonical 0.1..10 decimal storage.
 */
export function inputToCanonical10(raw: number, format: ScoreFormat): number | undefined {
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  switch (format) {
    case 'POINT_100':
      return clampCanonical10(raw / 10);
    case 'POINT_5':
      return clampCanonical10(raw * 2);
    case 'POINT_10':
      return clampCanonical10(Math.round(raw));
    case 'POINT_10_DECIMAL':
    default:
      return clampCanonical10(Math.round(raw * 2) / 2);
  }
}

/**
 * Converts canonical 0.1..10 score into display numeric value for the chosen `format`.
 */
export function canonical10ToDisplayValue(
  canonical10: number | undefined,
  format: ScoreFormat
): number | undefined {
  if (typeof canonical10 !== 'number' || canonical10 <= 0) return undefined;
  switch (format) {
    case 'POINT_100':
      return Math.round(canonical10 * 10);
    case 'POINT_5':
      return Math.round(canonical10) / 2;
    case 'POINT_10':
      return Math.round(canonical10);
    case 'POINT_10_DECIMAL':
    default:
      return Math.round(canonical10 * 10) / 10;
  }
}

export function formatUserScore(
  canonical10: number | undefined,
  format: ScoreFormat = 'POINT_10_DECIMAL'
): string {
  const val = canonical10ToDisplayValue(canonical10, format);
  if (val === undefined) return '';
  switch (format) {
    case 'POINT_100':
      return `${val}/100`;
    case 'POINT_5':
      return `${val}/5`;
    case 'POINT_10':
      return `${val}/10`;
    case 'POINT_10_DECIMAL':
    default:
      return `${Number.isInteger(val) ? val : val.toFixed(1)}/10`;
  }
}

export function canonical10ToAnilistRaw(canonical10?: number): number | undefined {
  if (typeof canonical10 !== 'number' || canonical10 <= 0) return undefined;
  return Math.max(1, Math.min(100, Math.round(canonical10 * 10)));
}

export function canonical10ToMalInt(canonical10?: number): number | undefined {
  if (typeof canonical10 !== 'number' || canonical10 <= 0) return undefined;
  return Math.max(1, Math.min(10, Math.round(canonical10)));
}

export function toFuzzyDate(dateStr?: string): { year: number; month: number; day: number } | undefined {
  if (!dateStr) return undefined;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function fromFuzzyDate(fuzzy?: { year?: number | null; month?: number | null; day?: number | null } | null): string | undefined {
  if (!fuzzy?.year || !fuzzy.month || !fuzzy.day) return undefined;
  return `${String(fuzzy.year).padStart(4, '0')}-${String(fuzzy.month).padStart(2, '0')}-${String(fuzzy.day).padStart(2, '0')}`;
}

/**
 * Computes MAL/AniList-style Pearson Taste Affinity (-100%..+100%) from overlapping rated titles.
 */
export function computeTasteAffinity(
  myEntries: Record<string, Pick<ListEntry, 'animeId' | 'score'>>,
  otherEntries: { animeId: string; score?: number | null }[]
): { affinity: number | null; sharedRated: number; sharedTotal: number } {
  const otherMap = new Map<string, number | undefined>();
  let sharedTotal = 0;
  for (const row of otherEntries) {
    if (myEntries[row.animeId]) sharedTotal += 1;
    if (typeof row.score === 'number' && row.score > 0) {
      otherMap.set(row.animeId, row.score);
    }
  }

  const pairs: [number, number][] = [];
  for (const [id, mine] of Object.entries(myEntries)) {
    const theirs = otherMap.get(id);
    if (typeof mine.score === 'number' && mine.score > 0 && typeof theirs === 'number' && theirs > 0) {
      pairs.push([mine.score, theirs]);
    }
  }

  if (pairs.length < 3) {
    return { affinity: null, sharedRated: pairs.length, sharedTotal };
  }

  const n = pairs.length;
  const meanA = pairs.reduce((s, [a]) => s + a, 0) / n;
  const meanB = pairs.reduce((s, [, b]) => s + b, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const [a, b] of pairs) {
    const da = a - meanA;
    const db = b - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  if (denA === 0 || denB === 0) {
    // Same constant score for everyone: fall back to closeness similarity
    const avgDiff = pairs.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / n;
    return {
      affinity: Math.round(Math.max(-100, Math.min(100, (1 - avgDiff / 5) * 100))),
      sharedRated: n,
      sharedTotal,
    };
  }

  const r = num / Math.sqrt(denA * denB);
  return {
    affinity: Math.round(r * 100),
    sharedRated: n,
    sharedTotal,
  };
}
