import { useSyncExternalStore } from 'react';
import {
  Anime,
  FeedbackEvent,
  FeedbackType,
  LibraryState,
  ListEntry,
  ListStatus,
  MediaType,
  TrackerAccount,
} from '../types';
import { animeStore } from './animeStore';

const KEY = 'anitube.library.v1';
const MAX_EVENTS = 500;

function emptyState(): LibraryState {
  return {
    entries: {},
    notInterested: [],
    events: [],
    trackers: [],
    interests: [],
    mangaInterests: [],
    updatedAt: 0,
  };
}

function load(): LibraryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    return {
      entries: parsed.entries ?? {},
      notInterested: parsed.notInterested ?? [],
      events: parsed.events ?? [],
      trackers: parsed.trackers ?? [],
      interests: parsed.interests ?? [],
      mangaInterests: parsed.mangaInterests ?? [],
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return emptyState();
  }
}

let state = load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

function commit(next: LibraryState): void {
  state = { ...next, updatedAt: Date.now() };
  persist();
  listeners.forEach((listener) => listener());
}

function withEvent(next: LibraryState, event: FeedbackEvent): LibraryState {
  const events = [...next.events, event].slice(-MAX_EVENTS);
  return { ...next, events };
}

function event(type: FeedbackType, animeId: string, value?: number): FeedbackEvent {
  return { animeId, type, value, at: Date.now() };
}

function commitEntry(
  next: LibraryState,
  animeId: string,
  patch: Partial<ListEntry>,
  extraEvent?: FeedbackEvent
): LibraryState {
  const now = Date.now();
  const existing = next.entries[animeId];
  const entry: ListEntry = {
    ...existing,
    animeId,
    status: patch.status ?? existing?.status ?? 'planned',
    mediaType: patch.mediaType ?? existing?.mediaType ?? 'ANIME',
    addedAt: existing?.addedAt ?? now,
    ...patch,
    updatedAt: now,
  };
  let result: LibraryState = {
    ...next,
    entries: { ...next.entries, [animeId]: entry },
    notInterested: next.notInterested.filter((id) => id !== animeId),
  };
  if (extraEvent) result = withEvent(result, extraEvent);
  return result;
}

export const library = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): LibraryState {
    return state;
  },

  isInList(animeId: string): boolean {
    return Boolean(state.entries[animeId]);
  },

  statusOf(animeId: string): ListStatus | undefined {
    return state.entries[animeId]?.status;
  },

  add(anime: Anime, status: ListStatus = 'planned'): void {
    const existing = state.entries[anime.id];
    if (existing && existing.status === status) return;
    animeStore.pin(anime.id);
    const patch: Partial<ListEntry> = { status, mediaType: anime.mediaType ?? 'ANIME' };
    if (status === 'watching' && !existing?.progress) patch.progress = 1;
    let next = commitEntry(state, anime.id, patch);
    next = withEvent(next, event(status === 'dropped' ? 'drop' : 'add', anime.id));
    commit(next);
  },

  setStatus(anime: Anime, status: ListStatus): void {
    animeStore.pin(anime.id);
    const eventType: FeedbackType =
      status === 'completed'
        ? 'complete'
        : status === 'dropped'
        ? 'drop'
        : status === 'planned'
        ? 'add'
        : status === 'on_hold'
        ? 'hold'
        : 'progress';

    const existing = state.entries[anime.id];
    const totalCount = anime.mediaType === 'MANGA' ? anime.chapters : anime.episodes;
    const patch: Partial<ListEntry> = { status, mediaType: anime.mediaType ?? 'ANIME' };
    if (status === 'watching' && !existing?.progress) patch.progress = 1;
    if (status === 'completed' && totalCount) patch.progress = totalCount;
    const next = commitEntry(state, anime.id, patch, event(eventType, anime.id));
    commit(next);
  },

  remove(animeId: string, type: FeedbackType = 'drop'): void {
    const entries = { ...state.entries };
    delete entries[animeId];
    let next: LibraryState = { ...state, entries };
    next = withEvent(next, event(type, animeId));
    commit(next);
  },

  setScore(animeId: string, score: number): void {
    let next = commitEntry(state, animeId, { score }, event('rate', animeId, score));
    commit(next);
  },

  setProgress(animeId: string, progress: number): void {
    const entry = state.entries[animeId];
    if (!entry) return;
    const anime = animeStore.get(animeId);
    const total =
      anime?.mediaType === 'MANGA'
        ? anime.chapters ?? 0
        : anime?.episodes ?? (anime?.nextEpisode ? Math.max(1, anime.nextEpisode.number - 1) : 0);
    const clamped = Math.max(0, progress);
    const finished = total > 0 && clamped >= total && entry.status === 'watching';

    let next = commitEntry(
      state,
      animeId,
      { progress: finished ? total : clamped },
      event('progress', animeId, clamped)
    );
    if (finished) {
      next = commitEntry(next, animeId, { status: 'completed' }, event('complete', animeId));
    }
    commit(next);
  },

  logOpen(animeId: string): void {
    commit(withEvent(state, event('open', animeId)));
  },

  notInterested(anime: Anime): void {
    const entries = { ...state.entries };
    delete entries[anime.id];
    let next: LibraryState = {
      ...state,
      entries,
      notInterested: [...new Set([...state.notInterested, anime.id])],
    };
    next = withEvent(next, event('not_interested', anime.id));
    commit(next);
  },

  importEntries(
    items: { anime: Anime; status: ListStatus; score?: number; progress?: number }[],
    tracker: TrackerAccount
  ): void {
    const entries = { ...state.entries };
    const now = Date.now();
    for (const item of items) {
      animeStore.pin(item.anime.id);
      entries[item.anime.id] = {
        animeId: item.anime.id,
        mediaType: item.anime.mediaType ?? 'ANIME',
        status: item.status,
        score: item.score,
        progress: item.progress,
        addedAt: now,
        updatedAt: now,
      };
    }
    const trackers = [...state.trackers.filter((t) => t.provider !== tracker.provider), tracker];
    commit({ ...state, entries, trackers });
  },

  disconnectTracker(provider: TrackerAccount['provider']): void {
    commit({ ...state, trackers: state.trackers.filter((t) => t.provider !== provider) });
  },

  toggleInterest(genre: string, mediaType: MediaType = 'ANIME'): void {
    if (mediaType === 'MANGA') {
      const current = state.mangaInterests ?? [];
      const mangaInterests = current.includes(genre)
        ? current.filter((g) => g !== genre)
        : [...current, genre].slice(0, 6);
      commit({ ...state, mangaInterests });
    } else {
      const interests = state.interests.includes(genre)
        ? state.interests.filter((g) => g !== genre)
        : [...state.interests, genre].slice(0, 6);
      commit({ ...state, interests });
    }
  },

  clearAll(): void {
    commit(emptyState());
  },

  exportJson(): string {
    return JSON.stringify(state, null, 2);
  },
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
}
