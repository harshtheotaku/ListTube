import { describe, it, expect, beforeEach } from 'vitest';
import { passesContentSettings } from './contentFilter';
import { computePacingPlan } from './pacingGoal';
import {
  formatPreferredTitle,
  formatSecondaryTitle,
  gridClassFor,
  settingsStore,
} from './settings';
import {
  buildDailyTenRound,
  buildDuelMatchup,
  buildJeopardyBoard,
  buildNextInfiniteQuestion,
  buildThemeQuizRound,
  doesTypedGuessMatch,
  getQuizRankInfo,
  getSeenQuizCount,
  markQuizQuestionSeen,
  resetSeenQuizHistory,
} from './themeQuiz';
import { computeWrappedSummary } from './wrappedStats';
import { pickDefaultCollageSlots, pickDefaultTierBuckets } from './collageGrid';
import { buildEpisodeWatchUrl } from './supabase';
import { compareSemver } from './appUpdater';
import { animeStore } from './animeStore';
import { UserProfile } from './profile';
import { decodeMihonProtobufBytes, exportMalXml, parseComixOrJsonBackup } from './backupImport';
import { fetchEpisodeReactions, postEpisodeReaction } from './communityStats';
import { Anime, LibraryState } from '../types';

const makeAnime = (p: Partial<Anime> & { id: string }): Anime => ({
  id: p.id,
  malId: p.malId,
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

    settingsStore.update({
      titleLanguage: 'romaji',
      cardDensity: 'compact',
      hideSpoilers: true,
      confirmBeforeRemove: true,
      defaultMediaType: 'MANGA',
      defaultTab: 'explore',
      defaultTrailerMuted: true,
      hapticsEnabled: false,
      liquidGlassOpacity: 35,
    });
    const nextSnap = settingsStore.getSnapshot();
    expect(nextSnap.titleLanguage).toBe('romaji');
    expect(nextSnap.cardDensity).toBe('compact');
    expect(nextSnap.hideSpoilers).toBe(true);
    expect(nextSnap.confirmBeforeRemove).toBe(true);
    expect(nextSnap.defaultMediaType).toBe('MANGA');
    expect(nextSnap.defaultTab).toBe('explore');
    expect(nextSnap.defaultTrailerMuted).toBe(true);
    expect(nextSnap.hapticsEnabled).toBe(false);
    expect(nextSnap.liquidGlassOpacity).toBe(35);

    settingsStore.update({ liquidGlassOpacity: 200 });
    expect(settingsStore.getSnapshot().liquidGlassOpacity).toBe(95);
    settingsStore.update({ liquidGlassOpacity: 0 });
    expect(settingsStore.getSnapshot().liquidGlassOpacity).toBe(15);

    const aot = { title: 'Attack on Titan', titleRomaji: 'Shingeki no Kyojin', titleNative: '進撃の巨人' };
    expect(formatPreferredTitle(aot, 'english')).toBe('Attack on Titan');
    expect(formatPreferredTitle(aot, 'romaji')).toBe('Shingeki no Kyojin');
    expect(formatPreferredTitle(aot, 'native')).toBe('進撃の巨人');
    expect(formatSecondaryTitle(aot, 'romaji')).toBe('Attack on Titan');
    expect(gridClassFor('ANIME', 'compact')).toContain('xl:grid-cols-5');
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

    const board = buildJeopardyBoard();
    expect(board).toHaveLength(4);
    board.forEach((cat) => expect(cat.cells).toHaveLength(4));
    expect(doesTypedGuessMatch('aot', 'Attack on Titan', ['aot', 'snk'])).toBe(true);
    expect(doesTypedGuessMatch('chainsaw', 'Chainsaw Man', ['csm'])).toBe(true);

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

    // Infinite non-repeating quiz + My List scope + Tier List + Episode direct link
    resetSeenQuizHistory();
    const exclude = new Set<string>();
    const q1 = buildNextInfiniteQuestion({ scope: 'all', sessionExclude: exclude });
    exclude.add(q1.signature);
    markQuizQuestionSeen(q1.signature);
    const q2 = buildNextInfiniteQuestion({ scope: 'all', sessionExclude: exclude });
    expect(q2.signature).not.toBe(q1.signature);
    expect(getSeenQuizCount()).toBe(1);

    const tiers = pickDefaultTierBuckets(
      {
        ...lib,
        entries: {
          'anilist:101': { animeId: 'anilist:101', mediaType: 'ANIME', status: 'completed', progress: 28, score: 10, addedAt: 1, updatedAt: 1 },
        },
      },
      'ANIME'
    );
    expect(tiers.S.some((a) => a.id === 'anilist:101')).toBe(true);

    const epUrl = buildEpisodeWatchUrl('https://kotoplay.to/watch/naruto-123', 'kotoplay', 42);
    expect(epUrl).toContain('ep=42');

    expect(compareSemver('v1.2.1', '1.2.0')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0')).toBe(0);
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

  it('exports valid MyAnimeList XML and saves local episode check-in reactions', async () => {
    animeStore.remember(makeAnime({ id: 'anilist:16498', malId: 16498, title: 'Attack on Titan', episodes: 25 }));
    const xml = exportMalXml({
      entries: {
        'anilist:16498': {
          animeId: 'anilist:16498',
          mediaType: 'ANIME',
          status: 'completed',
          progress: 25,
          score: 10,
          addedAt: 1,
          updatedAt: 2,
        },
      },
      likedIds: [],
      notInterested: [],
      events: [],
      trackers: [],
      interests: [],
      updatedAt: 2,
    });
    expect(xml).toContain('<myanimelist>');
    expect(xml).toContain('<series_animedb_id>16498</series_animedb_id>');
    expect(xml).toContain('<my_watched_episodes>25</my_watched_episodes>');

    const rx = await postEpisodeReaction({
      animeId: 'anilist:16498',
      episode: 5,
      authorName: 'Harsh',
      authorHandle: '@harsh',
      rating: 5,
      body: 'Legendary transformation episode!',
      isSpoiler: true,
    });
    expect(rx.episode).toBe(5);
    expect(rx.isSpoiler).toBe(true);
    const list = await fetchEpisodeReactions('anilist:16498', 5);
    expect(list.some((x) => x.body.includes('Legendary transformation'))).toBe(true);
  });

  it('supports Quiz difficulties, Daily 10 deterministic gauntlet, Score Duel, Rank & autoUpdateApp setting', () => {
    expect(settingsStore.getSnapshot().autoUpdateApp).toBe(true);
    settingsStore.update({ autoUpdateApp: false });
    expect(settingsStore.getSnapshot().autoUpdateApp).toBe(false);

    const easyQ = buildNextInfiniteQuestion({ scope: 'all', difficulty: 'easy' });
    const medQ = buildNextInfiniteQuestion({ scope: 'all', difficulty: 'medium' });
    const hardQ = buildNextInfiniteQuestion({ scope: 'all', difficulty: 'hard' });
    expect(easyQ.difficulty).toBe('easy');
    expect(medQ.difficulty).toBe('medium');
    expect(hardQ.difficulty).toBe('hard');

    const dayA1 = buildDailyTenRound('2026-11-19');
    const dayA2 = buildDailyTenRound('2026-11-19');
    expect(dayA1).toHaveLength(10);
    expect(dayA1.map((q) => q.signature)).toEqual(dayA2.map((q) => q.signature));

    const duel = buildDuelMatchup('score');
    expect(duel.left.id).not.toBe(duel.right.id);
    expect(['left', 'right']).toContain(duel.winner);

    const rank = getQuizRankInfo(5200, 10);
    expect(rank.title).toBe('ANBU Frame Reader');

    const emojiQ = buildNextInfiniteQuestion({ scope: 'all', preferKind: 'emoji_plot' });
    const quoteQ = buildNextInfiniteQuestion({ scope: 'all', preferKind: 'quote_match' });
    const oddQ = buildNextInfiniteQuestion({ scope: 'all', preferKind: 'odd_one_out' });
    const statQ = buildNextInfiniteQuestion({ scope: 'all', preferKind: 'stat_clash' });
    expect([emojiQ, quoteQ, oddQ, statQ].every((q) => q.options.length === 4 && q.options.includes(q.correctAnswer))).toBe(true);
  });
});
