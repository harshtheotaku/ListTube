import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOutboxJob,
  flushWritebackOutbox,
  loadOutbox,
  makeOutboxJobId,
  WRITEBACK_OUTBOX_KEY,
} from './writebackOutbox';

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
}

describe('writebackOutbox', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeLocalStorage(),
      configurable: true,
    });
    localStorage.removeItem(WRITEBACK_OUTBOX_KEY);
  });

  it('coalesces duplicate writes for the same provider and media ID', () => {
    const id = makeOutboxJobId('anilist', 'ANIME', 16498);
    enqueueOutboxJob(
      { id, provider: 'anilist', payload: { mediaId: 16498, action: 'save', progress: 5 } },
      1000
    );
    const after = enqueueOutboxJob(
      { id, provider: 'anilist', payload: { mediaId: 16498, action: 'save', progress: 8 } },
      2000
    );

    expect(after).toHaveLength(1);
    expect(after[0].provider).toBe('anilist');
    if (after[0].provider === 'anilist') {
      expect(after[0].payload.progress).toBe(8);
    }
    expect(after[0].attempts).toBe(2);
    expect(after[0].nextRetryAt).toBe(2000 + 8000);
  });

  it('flushes due jobs and removes succeeded ones while retaining failed ones', async () => {
    enqueueOutboxJob(
      {
        id: makeOutboxJobId('anilist', 'ANIME', 1),
        provider: 'anilist',
        payload: { mediaId: 1, action: 'save', progress: 3 },
      },
      1000
    );
    enqueueOutboxJob(
      {
        id: makeOutboxJobId('mal', 'MANGA', 2),
        provider: 'mal',
        payload: { malId: 2, mediaType: 'MANGA', action: 'save', progress: 12 },
      },
      1000
    );

    const res = await flushWritebackOutbox({
      getAniListToken: () => 'al_tok',
      getMalToken: async () => 'mal_tok',
      sendAniList: async () => ({ ok: true }),
      sendMal: async () => ({ ok: false, error: 'HTTP 503' }),
      now: 100_000,
    });

    expect(res).toEqual({ succeeded: 1, failed: 1, remaining: 1 });
    const left = loadOutbox();
    expect(left).toHaveLength(1);
    expect(left[0].provider).toBe('mal');
    expect(left[0].lastError).toBe('HTTP 503');
  });
});
