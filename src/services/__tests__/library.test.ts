import { beforeEach, describe, expect, it } from 'vitest';
import { Anime } from '../../types';
import { animeStore } from '../animeStore';
import { library } from '../library';

function makeMedia(overrides: Partial<Anime> = {}): Anime {
  return {
    id: 'anilist-manga:105398',
    mediaType: 'MANGA',
    source: 'anilist',
    anilistId: 105398,
    title: 'Ongoing Weekly Manhwa',
    cover: 'https://example.com/cover.jpg',
    banner: 'https://example.com/banner.jpg',
    description: 'Ongoing serialization',
    genres: ['Action', 'Fantasy'],
    tags: [],
    studios: [],
    streaming: [],
    similar: [],
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe('library tracking parity', () => {
  beforeEach(() => {
    localStorage.clear();
    animeStore.clear();
    library.clearAll();
  });

  it('allows unbounded chapter/episode progress increments on ongoing series with unknown total', () => {
    const ongoing = makeMedia({ chapters: undefined });
    library.setStatus(ongoing, 'watching');

    library.setProgress(ongoing.id, 150);
    const afterInc = library.getSnapshot().entries[ongoing.id];
    expect(afterInc.progress).toBe(150);
    expect(afterInc.status).toBe('watching');
    expect(afterInc.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('caps and auto-completes finished series when known total is reached', () => {
    const finished = makeMedia({
      id: 'anilist:1',
      mediaType: 'ANIME',
      episodes: 12,
      chapters: undefined,
    });
    library.setStatus(finished, 'watching');
    library.setProgress(finished.id, 15);
    const entry = library.getSnapshot().entries[finished.id];
    expect(entry.progress).toBe(12);
    expect(entry.status).toBe('completed');
    expect(entry.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('persists decimal scores, volumes, rewatches, notes, privacy, custom dates, and likes', () => {
    const item = makeMedia();
    library.setStatus(item, 'watching');
    library.setScore(item.id, 8.5);
    library.updateEntryDetails(item.id, {
      progressVolumes: 6,
      repeat: 2,
      startedAt: '2026-01-05',
      completedAt: '2026-03-10',
      notes: 'Peak dungeon arc',
      isPrivate: true,
    });

    const saved = library.getSnapshot().entries[item.id];
    expect(saved.score).toBe(8.5);
    expect(saved.progressVolumes).toBe(6);
    expect(saved.repeat).toBe(2);
    expect(saved.startedAt).toBe('2026-01-05');
    expect(saved.completedAt).toBe('2026-03-10');
    expect(saved.notes).toBe('Peak dungeon arc');
    expect(saved.isPrivate).toBe(true);

    expect(library.toggleLike(item)).toBe(true);
    expect(library.isLiked(item.id)).toBe(true);
    expect(library.toggleLike(item)).toBe(false);
    expect(library.isLiked(item.id)).toBe(false);
  });

  it('supports priority, customLists, bulkUpdate, and bulkRemove', () => {
    const first = makeMedia({ id: 'anilist:10', mediaType: 'ANIME', title: 'First Show' });
    const second = makeMedia({ id: 'anilist:20', mediaType: 'ANIME', title: 'Second Show' });
    library.add(first, 'planned');
    library.add(second, 'planned');

    library.updateEntryDetails(first.id, {
      priority: 2,
      customLists: ['Favorites', 'Cozy'],
    });
    expect(library.getSnapshot().entries[first.id].priority).toBe(2);
    expect(library.getSnapshot().entries[first.id].customLists).toEqual(['Favorites', 'Cozy']);

    library.bulkUpdate([first.id, second.id], {
      status: 'watching',
      addCustomList: 'Weekend',
      priority: 1,
    });
    const afterBulk = library.getSnapshot().entries;
    expect(afterBulk[first.id].status).toBe('watching');
    expect(afterBulk[second.id].status).toBe('watching');
    expect(afterBulk[first.id].priority).toBe(1);
    expect(afterBulk[second.id].customLists).toEqual(['Weekend']);

    library.bulkRemove([first.id, second.id]);
    expect(library.getSnapshot().entries[first.id]).toBeUndefined();
    expect(library.getSnapshot().entries[second.id]).toBeUndefined();
  });
});
