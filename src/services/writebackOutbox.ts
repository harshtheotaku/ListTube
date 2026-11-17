export type WritebackProvider = 'anilist' | 'mal';

export interface AniListOutboxPayload {
  mediaId: number;
  action: 'save' | 'delete';
  status?: string;
  score?: number;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  isPrivate?: boolean;
  customLists?: string[];
  priority?: number;
}

export interface MalOutboxPayload {
  malId: number;
  mediaType: 'ANIME' | 'MANGA';
  action: 'save' | 'delete';
  status?: string;
  score?: number;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export type WritebackJob =
  | {
      id: string;
      provider: 'anilist';
      payload: AniListOutboxPayload;
      attempts: number;
      nextRetryAt: number;
      lastError?: string;
      createdAt: number;
    }
  | {
      id: string;
      provider: 'mal';
      payload: MalOutboxPayload;
      attempts: number;
      nextRetryAt: number;
      lastError?: string;
      createdAt: number;
    };

export const WRITEBACK_OUTBOX_KEY = 'listtube.writeback.outbox.v1';
const MAX_ATTEMPTS = 8;

export function makeOutboxJobId(provider: WritebackProvider, mediaType: 'ANIME' | 'MANGA', targetId: number): string {
  return `${provider}:${mediaType}:${targetId}`;
}

export function loadOutbox(): WritebackJob[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WRITEBACK_OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WritebackJob[]) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(jobs: WritebackJob[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (jobs.length === 0) {
      localStorage.removeItem(WRITEBACK_OUTBOX_KEY);
    } else {
      localStorage.setItem(WRITEBACK_OUTBOX_KEY, JSON.stringify(jobs.slice(-150)));
    }
  } catch {
    /* ignore storage quota failures */
  }
}

export function enqueueOutboxJob(
  entry:
    | { id: string; provider: 'anilist'; payload: AniListOutboxPayload; error?: string }
    | { id: string; provider: 'mal'; payload: MalOutboxPayload; error?: string },
  now = Date.now()
): WritebackJob[] {
  const existing = loadOutbox();
  const prev = existing.find((j) => j.id === entry.id);
  const attempts = prev ? Math.min(prev.attempts + 1, MAX_ATTEMPTS) : 1;
  const delayMs = Math.min(300_000, 4_000 * Math.pow(2, Math.max(0, attempts - 1)));

  const nextJob: WritebackJob =
    entry.provider === 'anilist'
      ? {
          id: entry.id,
          provider: 'anilist',
          payload: entry.payload,
          attempts,
          nextRetryAt: now + delayMs,
          lastError: entry.error,
          createdAt: prev?.createdAt ?? now,
        }
      : {
          id: entry.id,
          provider: 'mal',
          payload: entry.payload,
          attempts,
          nextRetryAt: now + delayMs,
          lastError: entry.error,
          createdAt: prev?.createdAt ?? now,
        };

  // Replace earlier job for the same media so newer edits supersede stale mutations
  const updated = [...existing.filter((j) => j.id !== entry.id), nextJob];
  saveOutbox(updated);
  return updated;
}

export function removeOutboxJob(id: string): WritebackJob[] {
  const updated = loadOutbox().filter((j) => j.id !== id);
  saveOutbox(updated);
  return updated;
}

export async function flushWritebackOutbox(deps: {
  getAniListToken: () => string;
  getMalToken: () => Promise<string | null>;
  sendAniList: (args: AniListOutboxPayload & { token: string }) => Promise<{ ok: boolean; error?: string }>;
  sendMal: (args: MalOutboxPayload & { token: string }) => Promise<{ ok: boolean; error?: string }>;
  now?: number;
  forceAll?: boolean;
}): Promise<{ succeeded: number; failed: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { succeeded: 0, failed: 0, remaining: loadOutbox().length };
  }

  const jobs = loadOutbox();
  if (jobs.length === 0) return { succeeded: 0, failed: 0, remaining: 0 };

  const now = deps.now ?? Date.now();
  let succeeded = 0;
  let failed = 0;
  const kept: WritebackJob[] = [];

  for (const job of jobs) {
    if (!deps.forceAll && job.nextRetryAt > now) {
      kept.push(job);
      continue;
    }

    if (job.provider === 'anilist') {
      const token = deps.getAniListToken().trim();
      if (!token) {
        kept.push(job);
        continue;
      }
      const res = await deps.sendAniList({ ...job.payload, token });
      if (res.ok) {
        succeeded += 1;
      } else {
        failed += 1;
        const attempts = job.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          kept.push({
            ...job,
            attempts,
            nextRetryAt: now + Math.min(300_000, 4_000 * Math.pow(2, attempts - 1)),
            lastError: res.error,
          });
        }
      }
    } else {
      const token = (await deps.getMalToken())?.trim() ?? '';
      if (!token) {
        kept.push(job);
        continue;
      }
      const res = await deps.sendMal({ ...job.payload, token });
      if (res.ok) {
        succeeded += 1;
      } else {
        failed += 1;
        const attempts = job.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          kept.push({
            ...job,
            attempts,
            nextRetryAt: now + Math.min(300_000, 4_000 * Math.pow(2, attempts - 1)),
            lastError: res.error,
          });
        }
      }
    }
  }

  saveOutbox(kept);
  return { succeeded, failed, remaining: kept.length };
}
