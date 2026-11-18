import { describe, it, expect, beforeEach } from 'vitest';
import { passesContentSettings } from './contentFilter';
import { computePacingPlan } from './pacingGoal';
import { settingsStore } from './settings';
import { buildThemeQuizRound } from './themeQuiz';
import { computeWrappedSummary } from './wrappedStats';
import { pickDefaultCollageSlots } from './collageGrid';
import { animeStore } from './animeStore';
import { UserProfile } from './profile';
import { decodeMihonProtobufBytes, parseComixOrJsonBackup } from './backupImport';
import { Anime, LibraryState } from '../types';

const makeAnime = (p: Partial<Anime> & { id: string }): Anime => ({
  id: p.id,
  mediaType: p.mediaType ?? 'ANIME',
  source: 'anilist',
  title: p.title ?? p.id,
  cover: 'https://example.com/c.jpg',
  banner: '',
  description: '',
  genres: p.genres ?? ['Action'],
  tags: p.tags ?? [],
  studios: p.studios ?? ['MAPPA'],
  episodes: p.episodes ?? 24,
  duration: p.duration ?? 24,
  score: p.score ?? 8.5,
  streaming: [],
  similar: [],
  fetchedAt: 0,
});

describe('Apple Liquid Glass Settings, Wrapped, Pacing & Theme Quiz', () => {
  beforeEach(() => {
    settingsStore.resetAllDefaults();
  });

  it('toggles Liquid Glass, theme presets, blocked genres, and content filter cleanly', () => {
    expect(settingsStore.getSnapshot().liquidGlass).toBe(true);
    settingsStore.setLiquidGlass(false);
    expect(settingsStore.getSnapshot().liquidGlass).toBe(false);

    settingsStore.setThemePreset('light');
    expect(settingsStore.getSnapshot().themePreset).toBe('light');

    settingsStore.update({
      fontFamily: 'rounded',
      reduceMotion: true,
      reduceBlur: true,
      disableBlend: true,
    });
    expect(settingsStore.getSnapshot().fontFamily).toBe('rounded');
    expect(settingsStore.getSnapshot().reduceMotion).toBe(true);
    expect(settingsStore.getSnapshot().reduceBlur).toBe(true);
    expect(settingsStore.getSnapshot().disableBlend).toBe(true);

    settingsStore.setContentFilter('safe');
    settingsStore.toggleBlockedGenre('Mecha');

    const safeShow = makeAnime({ id: 'anilist:1', genres: ['Action', 'Fantasy'] });
    const ecchiShow = makeAnime({ id: 'anilist:2', genres: ['Ecchi', 'Comedy'] });
    const blockedShow = makeAnime({ id: 'anilist:3', genres: ['Mecha'] });

    const snap = settingsStore.getSnapshot();
    expect(passesContentSettings(safeShow, snap)).toBe(true);
    expect(passesContentSettings(ecchiShow, snap)).toBe(false);
    expect(passesContentSettings(blockedShow, snap)).toBe(false);
  });

  it('computes catch-up pacing completion days and remaining manga volumes', () => {
    const plan = computePacingPlan({
      progress: 100,
      total: 145,
      dailyPace: 5,
      mediaType: 'MANGA',
      knownVolumes: 15,
      completedVolumes: 10,
      nowMs: Date.UTC(2026, 10, 1),
    });
    expect(plan).not.toBeNull();
    expect(plan!.remainingUnits).toBe(45);
    expect(plan!.daysToFinish).toBe(9);
    expect(plan!.estimatedRemainingVolumes).toBe(5);
  });

  it('computes ListTube Wrapped stats and OP/ED quiz questions', () => {
    const catalog = new Map<string, Anime>([
      ['anilist:1', makeAnime({ id: 'anilist:1', title: 'Frieren', genres: ['Fantasy'], studios: ['Madhouse'] })],
    ]);
    const lib: LibraryState = {
      entries: {
        'anilist:1': { animeId: 'anilist:1', mediaType: 'ANIME', status: 'completed', progress: 28, score: 10, addedAt: 1, updatedAt: 1 },
      },
      likedIds: [],
      notInterested: [],
      events: [],
      trackers: [],
      interests: [],
      mangaInterests: [],
      updatedAt: 1,
    };

    const wrapped = computeWrappedSummary(lib, (id) => catalog.get(id));
    expect(wrapped.completedCount).toBe(1);
    expect(wrapped.topStudio).toBe('Madhouse');
    expect(wrapped.meanScore).toBe(10);

    const quiz = buildThemeQuizRound(6);
    expect(quiz).toHaveLength(6);
    quiz.forEach((q) => {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(typeof q.audioQuery).toBe('string');
      expect(q.audioQuery.length).toBeGreaterThan(2);
    });

    const a1 = makeAnime({ id: 'anilist:101', title: 'Frieren', score: 9.2 });
    const a2 = makeAnime({ id: 'anilist:102', title: 'Monster', score: 9.1 });
    animeStore.remember(a1);
    animeStore.remember(a2);
    const mockProfile: UserProfile = {
      name: 'Test',
      handle: '@test',
      avatarId: 'gojo',
      avatarUrl: '',
      bannerUrl: '',
      favoriteAnimeIds: ['anilist:102'],
      favoriteMangaIds: [],
    };
    const slots = pickDefaultCollageSlots(
      {
        ...lib,
        entries: {
          'anilist:101': { animeId: 'anilist:101', mediaType: 'ANIME', status: 'completed', progress: 28, score: 10, addedAt: 1, updatedAt: 1 },
        },
      },
      mockProfile,
      'ANIME'
    );
    expect(slots[0]?.id).toBe('anilist:102');
    expect(slots.some((s) => s.id === 'anilist:101')).toBe(true);
  });

  it('defaults externalLinkMode to external and decodes Comix CSV/JSON & Mihon protobuf backups', () => {
    expect(settingsStore.getSnapshot().externalLinkMode).toBe('external');
    settingsStore.update({ externalLinkMode: 'ask' });
    expect(settingsStore.getSnapshot().externalLinkMode).toBe('ask');

    const comixCsv = 'title,status,chapters_read,score\n"Berserk",reading,364,10\n"Vagabond",completed,327,9.5';
    const parsedCsv = parseComixOrJsonBackup(comixCsv);
    expect(parsedCsv).toHaveLength(2);
    expect(parsedCsv[0]).toMatchObject({ title: 'Berserk', status: 'watching', progress: 364, score: 10 });

    const comixJson = JSON.stringify({
      comics: [{ title: 'Vinland Saga', status: 'reading', read: 210, rating: 9 }],
    });
    const parsedJson = parseComixOrJsonBackup(comixJson);
    expect(parsedJson[0]).toMatchObject({ title: 'Vinland Saga', status: 'watching', progress: 210, score: 9 });

    // Encode minimal Mihon protobuf: root field 1 (BackupManga) -> field 3 ("Vagabond"), field 8 (status=1)
    const titleBytes = new TextEncoder().encode('Vagabond');
    const mangaMsg = new Uint8Array([
      (3 << 3) | 2,
      titleBytes.length,
      ...titleBytes,
      (8 << 3) | 0,
      1,
    ]);
    const rootMsg = new Uint8Array([(1 << 3) | 2, mangaMsg.length, ...mangaMsg]);
    const decoded = decodeMihonProtobufBytes(rootMsg);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({ title: 'Vagabond', mediaType: 'MANGA', status: 'watching' });
  });
});
