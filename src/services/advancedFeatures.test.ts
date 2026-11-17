import { describe, it, expect } from 'vitest';
import { getEpisodeClassification, summarizeFillerPacing } from './fillerGuide';
import { buildWatchOrderGuide } from './watchOrder';
import { predictTasteAndDropRisk } from './dropPredictor';
import { computeThreeWaySyncDiffs } from './syncDiff';
import { buildGroupRecommendations } from './groupPicker';
import { Anime, LibraryState } from '../types';

const makeMedia = (p: Partial<Anime> & { id: string }): Anime => ({
  id: p.id,
  mediaType: p.mediaType ?? 'ANIME',
  source: 'anilist',
  title: p.title ?? p.id,
  cover: 'https://example.com/cover.jpg',
  banner: '',
  description: '',
  genres: p.genres ?? ['Action'],
  tags: p.tags ?? [],
  studios: p.studios ?? ['MAPPA'],
  episodes: p.episodes ?? 12,
  score: p.score ?? 8.2,
  streaming: [],
  similar: p.similar ?? [],
  fetchedAt: 0,
});

describe('9->11 category-defining engines', () => {
  it('classifies canon vs filler episodes and calculates hours saved', () => {
    const naruto = makeMedia({ id: 'anilist:20', title: 'Naruto', episodes: 220, duration: 24 });
    expect(getEpisodeClassification(naruto, 1)).toBe('CANON');
    expect(getEpisodeClassification(naruto, 26)).toBe('RECAP');
    expect(getEpisodeClassification(naruto, 145)).toBe('FILLER');

    const summary = summarizeFillerPacing(naruto);
    expect(summary.hasData).toBe(true);
    expect(summary.fillerCount).toBeGreaterThan(70);
    expect(summary.hoursSaved).toBeGreaterThan(25);
  });

  it('builds curated watch order for Fate and relation DAG for sequels', () => {
    const fate = makeMedia({ id: 'anilist:19603', title: 'Fate/stay night: Unlimited Blade Works' });
    const guide = buildWatchOrderGuide(fate);
    expect(guide?.curated).toBe(true);
    expect(guide?.steps.find((s) => s.isCurrent)?.step).toBe(1);

    const aot = makeMedia({
      id: 'anilist:20958',
      title: 'Mystery Show S2',
      similar: [
        { id: 'anilist:1', title: 'Mystery Show S1', cover: 'https://x/1.jpg', relation: 'PREQUEL' },
        { id: 'anilist:3', title: 'Mystery Show S3', cover: 'https://x/3.jpg', relation: 'SEQUEL' },
      ],
    });
    const relGuide = buildWatchOrderGuide(aot);
    expect(relGuide?.steps.map((s) => s.id)).toEqual(['anilist:1', 'anilist:20958', 'anilist:3']);
  });

  it('predicts high drop risk when studio/genres match past drops', () => {
    const lib: LibraryState = {
      entries: {
        'anilist:10': { animeId: 'anilist:10', mediaType: 'ANIME', status: 'dropped', progress: 3, score: 4, addedAt: 1, updatedAt: 1 },
        'anilist:11': { animeId: 'anilist:11', mediaType: 'ANIME', status: 'dropped', progress: 2, score: 3, addedAt: 2, updatedAt: 2 },
      },
      notInterested: [],
      likedIds: [],
      trackers: [],
      interests: [],
      mangaInterests: [],
      events: [],
      updatedAt: 2,
    };
    const droppedRef = (id: string) =>
      makeMedia({ id, genres: ['Isekai'], tags: ['Reincarnation'], studios: ['WeakStudio'] });

    const target = makeMedia({
      id: 'anilist:99',
      genres: ['Isekai'],
      tags: ['Reincarnation'],
      studios: ['WeakStudio'],
    });
    const pred = predictTasteAndDropRisk(target, lib, droppedRef);
    expect(pred.dropRiskPercent).toBeGreaterThanOrEqual(50);
    expect(pred.warnings.length).toBeGreaterThan(0);
  });

  it('computes 3-way sync diffs and recommends max progress & status', () => {
    const diffs = computeThreeWaySyncDiffs({
      localItems: [
        { provider: 'listtube', animeId: 'anilist:5114', anilistId: 5114, malId: 5114, mediaType: 'ANIME', title: 'FMAB', status: 'watching', progress: 20, score: 9 },
      ],
      anilistItems: [
        { provider: 'anilist', animeId: 'anilist:5114', anilistId: 5114, mediaType: 'ANIME', title: 'FMAB', status: 'completed', progress: 64, score: 10 },
      ],
      malItems: [
        { provider: 'mal', animeId: 'mal:5114', malId: 5114, mediaType: 'ANIME', title: 'FMAB', status: 'watching', progress: 40, score: 9 },
      ],
    });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].recommended).toEqual({ status: 'completed', progress: 64, score: 9 });
  });

  it('intersects group tastes while excluding shows already watched by either friend', () => {
    const f1 = makeMedia({ id: 'anilist:1', genres: ['Action', 'Sci-Fi'], studios: ['Trigger'], score: 8.8 });
    const f2 = makeMedia({ id: 'anilist:2', genres: ['Action', 'Sci-Fi'], studios: ['Trigger'], score: 9.1 });
    const rom = makeMedia({ id: 'anilist:3', genres: ['Romance'], studios: ['KyoAni'], score: 7.5 });
    const store = new Map([f1, f2, rom].map((x) => [x.id, x]));

    const myLib: LibraryState = {
      entries: {
        'anilist:1': { animeId: 'anilist:1', mediaType: 'ANIME', status: 'completed', progress: 24, score: 10, addedAt: 1, updatedAt: 1 },
      },
      notInterested: [],
      likedIds: [],
      trackers: [],
      interests: [],
      mangaInterests: [],
      events: [],
      updatedAt: 1,
    };

    const friendEntries = [
      { animeId: 'anilist:1', mediaType: 'ANIME' as const, status: 'completed' as const, progress: 24, score: 9, addedAt: 1, updatedAt: 1 },
    ];

    const picks = buildGroupRecommendations({
      myLibrary: myLib,
      friendLibraries: [friendEntries],
      candidates: [f1, f2, rom],
      resolveMedia: (id) => store.get(id),
    });
    expect(picks.map((p) => p.anime.id)).not.toContain('anilist:1');
    expect(picks[0].anime.id).toBe('anilist:2');
  });
});
