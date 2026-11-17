import { beforeEach, describe, expect, it } from 'vitest';
import { Anime } from '../../types';
import { animeStore } from '../animeStore';

function fakeAnime(id: string, pinned = false): Anime {
  return {
    id,
    mediaType: 'ANIME',
    source: 'anilist',
    title: `Show ${id}`,
    cover: 'https://example.com/c.jpg',
    banner: 'https://example.com/b.jpg',
    description: 'Full overview',
    genres: ['Action'],
    tags: [],
    studios: [],
    streaming: [],
    similar: [],
    fetchedAt: Date.now(),
    pinned,
  };
}

describe('animeStore & unbounded scaling cache', () => {
  beforeEach(() => {
    animeStore.clear();
  });

  it('stores beyond old 1200 ceiling in memory and retains pinned titles across cache clears', () => {
    for (let i = 0; i < 1350; i += 1) {
      animeStore.remember(fakeAnime(`anilist:${i}`), { compact: true });
    }
    expect(animeStore.size()).toBe(1350);

    animeStore.pin('anilist:5');
    animeStore.clearUnpinned();
    expect(animeStore.size()).toBe(1);
    expect(animeStore.get('anilist:5')?.title).toBe('Show anilist:5');
  });
});
