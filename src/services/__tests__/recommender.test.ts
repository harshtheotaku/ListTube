import { beforeEach, describe, expect, it } from 'vitest';
import { Anime } from '../../types';
import { animeStore } from '../animeStore';
import { library } from '../library';
import { buildTasteProfile } from '../recommender';

function sampleShow(id: string, genres: string[], studio = 'MAPPA'): Anime {
  return {
    id,
    mediaType: 'ANIME',
    source: 'anilist',
    title: `Show ${id}`,
    cover: 'https://example.com/c.jpg',
    banner: 'https://example.com/b.jpg',
    description: 'desc',
    genres,
    tags: genres,
    studios: [studio],
    year: 2023,
    format: 'TV',
    episodes: 12,
    popularity: 120000,
    score: 8.4,
    streaming: [],
    similar: [],
    fetchedAt: Date.now(),
  };
}

describe('recommender taste DNA vector', () => {
  beforeEach(() => {
    localStorage.clear();
    animeStore.clear();
    library.clearAll();
  });

  it('weights high-scored genres and positive events above dropped titles', () => {
    const a1 = sampleShow('anilist:101', ['Action', 'Mystery'], 'WIT STUDIO');
    const a2 = sampleShow('anilist:102', ['Action', 'Drama'], 'WIT STUDIO');
    const bad = sampleShow('anilist:103', ['Comedy'], 'Other Studio');

    library.setStatus(a1, 'completed');
    library.setScore(a1.id, 9.5);
    library.setStatus(a2, 'watching');
    library.setScore(a2.id, 8.5);
    library.setStatus(bad, 'dropped');

    const profile = buildTasteProfile(library.getSnapshot(), 'ANIME');
    expect(profile.topGenres[0]?.name).toBe('Action');
    expect(profile.vector.studios['WIT STUDIO']).toBeGreaterThan(0);
    expect(profile.vector.genres['Comedy']).toBeLessThan(profile.vector.genres['Action']);
  });
});
