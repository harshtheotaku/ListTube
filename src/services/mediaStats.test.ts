import { describe, it, expect } from 'vitest';
import { computeMediaStats } from './mediaStats';
import { Anime, ListEntry } from '../types';

const makeAnime = (partial: Partial<Anime> & { id: string }): Anime => ({
  id: partial.id,
  mediaType: partial.mediaType ?? 'ANIME',
  source: 'anilist',
  title: partial.title ?? partial.id,
  cover: 'https://example.com/c.jpg',
  banner: '',
  description: '',
  genres: [],
  tags: [],
  studios: [],
  format: partial.format,
  year: partial.year,
  duration: partial.duration ?? 24,
  streaming: [],
  similar: [],
  fetchedAt: 0,
});

describe('computeMediaStats', () => {
  it('computes format breakdown, release decades, mean score, and status totals', () => {
    const catalog = new Map<string, Anime>([
      ['anilist:1', { ...makeAnime({ id: 'anilist:1', format: 'TV', year: 2023 }), genres: ['Action', 'Fantasy'], studios: ['MAPPA'] }],
      ['anilist:2', { ...makeAnime({ id: 'anilist:2', format: 'TV', year: 2019 }), genres: ['Action', 'Drama'], studios: ['MAPPA'] }],
      ['anilist:3', { ...makeAnime({ id: 'anilist:3', format: 'MOVIE', year: 2016 }), genres: ['Drama'], studios: ['Kyoto Animation'] }],
      ['anilist-manga:4', makeAnime({ id: 'anilist-manga:4', mediaType: 'MANGA', format: 'MANGA', year: 2021 })],
    ]);

    const entries: Record<string, ListEntry> = {
      'anilist:1': { animeId: 'anilist:1', mediaType: 'ANIME', status: 'watching', progress: 12, score: 9, addedAt: 1, updatedAt: 1 },
      'anilist:2': { animeId: 'anilist:2', mediaType: 'ANIME', status: 'completed', progress: 24, score: 8, addedAt: 2, updatedAt: 2 },
      'anilist:3': { animeId: 'anilist:3', mediaType: 'ANIME', status: 'completed', progress: 1, score: 10, addedAt: 3, updatedAt: 3 },
      'anilist-manga:4': { animeId: 'anilist-manga:4', mediaType: 'MANGA', status: 'completed', progress: 50, score: 9, addedAt: 4, updatedAt: 4 },
    };

    const stats = computeMediaStats(entries, 'ANIME', (id) => catalog.get(id));
    expect(stats.total).toBe(3);
    expect(stats.watching).toBe(1);
    expect(stats.completed).toBe(2);
    expect(stats.meanScore).toBe(9);
    expect(stats.formatDist).toEqual([
      { label: 'TV', count: 2 },
      { label: 'MOVIE', count: 1 },
    ]);
    expect(stats.decadeDist).toEqual([
      { label: '2020s', count: 1 },
      { label: '2010s', count: 2 },
    ]);
    expect(stats.genreStats).toContainEqual({ label: 'Action', count: 2, meanScore: 8.5 });
    expect(stats.studioStats).toEqual([
      { label: 'MAPPA', count: 2, meanScore: 8.5 },
      { label: 'Kyoto Animation', count: 1, meanScore: 10 },
    ]);
  });
});
