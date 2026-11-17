import { Anime, LibraryState, ListEntry, MediaType } from '../types';
import { animeStore } from './animeStore';

export interface GroupPickResult {
  anime: Anime;
  mutualScore: number;
  sharedReasons: string[];
}

function buildFeatureWeights(
  entries: ListEntry[],
  resolveMedia: (id: string) => Anime | undefined,
  mediaType: MediaType
): { genres: Record<string, number>; studios: Record<string, number>; watched: Set<string> } {
  const genres: Record<string, number> = {};
  const studios: Record<string, number> = {};
  const watched = new Set<string>();

  for (const e of entries) {
    watched.add(e.animeId);
    const a = resolveMedia(e.animeId);
    if (!a || (a.mediaType ?? 'ANIME') !== mediaType) continue;
    const base =
      e.status === 'dropped'
        ? -1.2
        : e.score && e.score >= 8
        ? 2.2
        : e.status === 'completed'
        ? 1.5
        : e.status === 'watching'
        ? 1.2
        : 0.4;

    for (const g of a.genres) {
      genres[g] = (genres[g] ?? 0) + base;
    }
    for (const s of a.studios) {
      studios[s] = (studios[s] ?? 0) + base * 1.1;
    }
  }

  return { genres, studios, watched };
}

export function buildGroupRecommendations(params: {
  myLibrary: LibraryState;
  friendLibraries: ListEntry[][];
  candidates?: Anime[];
  mediaType?: MediaType;
  limit?: number;
  resolveMedia?: (id: string) => Anime | undefined;
}): GroupPickResult[] {
  const mediaType = params.mediaType ?? 'ANIME';
  const resolveMedia = params.resolveMedia ?? ((id: string) => animeStore.get(id));
  const candidates = (params.candidates ?? animeStore.all()).filter(
    (a) => (a.mediaType ?? 'ANIME') === mediaType && a.cover
  );

  const memberProfiles = [
    buildFeatureWeights(Object.values(params.myLibrary.entries), resolveMedia, mediaType),
    ...params.friendLibraries.map((list) => buildFeatureWeights(list, resolveMedia, mediaType)),
  ];

  const allExcluded = new Set<string>(params.myLibrary.notInterested);
  for (const mp of memberProfiles) {
    for (const id of mp.watched) allExcluded.add(id);
  }

  const scored: GroupPickResult[] = [];

  for (const anime of candidates) {
    if (allExcluded.has(anime.id)) continue;

    const perMemberScores = memberProfiles.map((mp) => {
      let s = 0;
      for (const g of anime.genres) s += mp.genres[g] ?? 0;
      for (const st of anime.studios) s += mp.studios[st] ?? 0;
      return s;
    });

    // Favor titles where EVERY member gets positive genre/studio overlap (min-max fairness!)
    const minScore = Math.min(...perMemberScores);
    const avgScore =
      perMemberScores.reduce((acc, v) => acc + v, 0) / Math.max(1, perMemberScores.length);
    const qualityBoost = anime.score ? (anime.score - 6.5) * 2.2 : 0;
    const total = minScore * 0.55 + avgScore * 0.45 + qualityBoost;

    if (avgScore <= 0 && !anime.score) continue;

    const sharedGenres = anime.genres.filter((g) =>
      memberProfiles.every((mp) => (mp.genres[g] ?? 0) > 0)
    );
    const sharedReasons: string[] = [];
    if (sharedGenres.length > 0) {
      sharedReasons.push(`Mutual ${sharedGenres.slice(0, 2).join(' + ')} match`);
    }
    if (anime.score && anime.score >= 8.0) {
      sharedReasons.push(`Rated ★ ${anime.score.toFixed(1)}`);
    }
    if (anime.studios[0]) {
      sharedReasons.push(anime.studios[0]);
    }

    scored.push({
      anime,
      mutualScore: Math.round(total * 10) / 10,
      sharedReasons: sharedReasons.length ? sharedReasons : ['Unwatched across everyone in group'],
    });
  }

  return scored
    .sort((a, b) => b.mutualScore - a.mutualScore)
    .slice(0, params.limit ?? 12);
}
