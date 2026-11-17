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
import { clampCanonical10 } from './scoring';

const KEY = 'anitube.library.v1';
const MAX_EVENTS = 500;

function emptyState(): LibraryState {
  return {
    entries: {},
    likedIds: [],
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
      likedIds: Array.isArray(parsed.likedIds) ? parsed.likedIds : [],
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

function withEvent(next: LibraryState, ev: FeedbackEvent): LibraryState {
  const events = [...next.events, ev].slice(-MAX_EVENTS);
  return { ...next, events };
}

function event(type: FeedbackType, animeId: string, value?: number): FeedbackEvent {
  return { animeId, type, value, at: Date.now() };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  isLiked(animeId: string): boolean {
    return state.likedIds.includes(animeId);
  },

  statusOf(animeId: string): ListStatus | undefined {
    return state.entries[animeId]?.status;
  },

  add(anime: Anime, status: ListStatus = 'planned'): void {
    const existing = state.entries[anime.id];
    if (existing && existing.status === status) return;
    animeStore.remember(anime);
    animeStore.pin(anime.id);
    const patch: Partial<ListEntry> = { status, mediaType: anime.mediaType ?? 'ANIME' };
    if (status === 'watching' && !existing?.progress) {
      patch.progress = 1;
      if (!existing?.startedAt) patch.startedAt = todayIso();
    }
    if (status === 'completed' && !existing?.completedAt) {
      patch.completedAt = todayIso();
    }
    let next = commitEntry(state, anime.id, patch);
    next = withEvent(next, event(status === 'dropped' ? 'drop' : 'add', anime.id));
    commit(next);
  },

  setStatus(anime: Anime, status: ListStatus): void {
    animeStore.remember(anime);
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
    if (status === 'watching' && !existing?.startedAt) patch.startedAt = todayIso();
    if (status === 'completed') {
      if (totalCount) patch.progress = totalCount;
      if (!existing?.completedAt) patch.completedAt = todayIso();
    }
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

  setScore(animeId: string, rawScore?: number): void {
    const normalized = clampCanonical10(rawScore);
    const next = commitEntry(
      state,
      animeId,
      { score: normalized },
      event('rate', animeId, normalized)
    );
    commit(next);
  },

  setProgress(animeId: string, progress: number): void {
    const entry = state.entries[animeId];
    if (!entry) return;
    const anime = animeStore.get(animeId);
    const knownTotal =
      anime?.mediaType === 'MANGA'
        ? anime.chapters ?? 0
        : anime?.episodes ?? 0;

    // Never cap or auto-complete when total episodes/chapters are unknown (0 / ongoing series)!
    const clamped = Math.max(0, Math.floor(progress));
    const bounded = knownTotal > 0 ? Math.min(knownTotal, clamped) : clamped;
    const finished = knownTotal > 0 && bounded >= knownTotal && entry.status === 'watching';

    let next = commitEntry(
      state,
      animeId,
      {
        progress: bounded,
        ...(entry.startedAt ? {} : { startedAt: todayIso() }),
      },
      event('progress', animeId, bounded)
    );
    if (finished) {
      next = commitEntry(
        next,
        animeId,
        {
          status: 'completed',
          completedAt: entry.completedAt ?? todayIso(),
        },
        event('complete', animeId)
      );
    }
    commit(next);
  },

  updateEntryDetails(
    animeId: string,
    patch: Partial<
      Pick<
        ListEntry,
        | 'progressVolumes'
        | 'repeat'
        | 'startedAt'
        | 'completedAt'
        | 'notes'
        | 'isPrivate'
        | 'customLists'
        | 'score'
        | 'progress'
        | 'status'
      >
    >
  ): void {
    const entry = state.entries[animeId];
    if (!entry) return;
    const cleanPatch: Partial<ListEntry> = { ...patch };
    if ('score' in patch) cleanPatch.score = clampCanonical10(patch.score);
    if (typeof patch.progressVolumes === 'number') {
      cleanPatch.progressVolumes = Math.max(0, Math.floor(patch.progressVolumes));
    }
    if (typeof patch.repeat === 'number') {
      cleanPatch.repeat = Math.max(0, Math.floor(patch.repeat));
    }
    if (typeof patch.progress === 'number') {
      cleanPatch.progress = Math.max(0, Math.floor(patch.progress));
    }
    const next = commitEntry(state, animeId, cleanPatch);
    commit(next);
  },

  toggleLike(anime: Anime): boolean {
    animeStore.remember(anime);
    animeStore.pin(anime.id);
    const exists = state.likedIds.includes(anime.id);
    const likedIds = exists
      ? state.likedIds.filter((id) => id !== anime.id)
      : [anime.id, ...state.likedIds];
    const next = withEvent(
      { ...state, likedIds },
      event('like', anime.id, exists ? 0 : 1)
    );
    commit(next);
    return !exists;
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
    items: {
      anime: Anime;
      status: ListStatus;
      score?: number;
      progress?: number;
      progressVolumes?: number;
      repeat?: number;
      startedAt?: string;
      completedAt?: string;
      notes?: string;
    }[],
    tracker: TrackerAccount
  ): void {
    const entries = { ...state.entries };
    const now = Date.now();
    for (const item of items) {
      animeStore.pin(item.anime.id);
      const prev = entries[item.anime.id];
      entries[item.anime.id] = {
        ...prev,
        animeId: item.anime.id,
        mediaType: item.anime.mediaType ?? 'ANIME',
        status: item.status,
        score: clampCanonical10(item.score) ?? prev?.score,
        progress: item.progress ?? prev?.progress,
        progressVolumes: item.progressVolumes ?? prev?.progressVolumes,
        repeat: item.repeat ?? prev?.repeat,
        startedAt: item.startedAt ?? prev?.startedAt,
        completedAt: item.completedAt ?? prev?.completedAt,
        notes: item.notes ?? prev?.notes,
        addedAt: prev?.addedAt ?? now,
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

  replaceFromCloud(next: Partial<LibraryState>): void {
    state = {
      entries: next.entries ?? {},
      likedIds: Array.isArray(next.likedIds) ? next.likedIds : state.likedIds,
      notInterested: next.notInterested ?? [],
      events: next.events ?? [],
      trackers: next.trackers ?? [],
      interests: next.interests ?? [],
      mangaInterests: next.mangaInterests ?? [],
      updatedAt: next.updatedAt ?? Date.now(),
    };
    persist();
    listeners.forEach((listener) => listener());
  },

  exportJson(): string {
    return JSON.stringify(state, null, 2);
  },
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
}
