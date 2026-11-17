import { useSyncExternalStore } from 'react';
import { UserProfile } from './profile';

export interface UserComment {
  id: string;
  animeId: string;
  episodeNumber?: number | null;
  parentId?: string | null;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
}

type CommentsMap = Record<string, UserComment[]>;

const COMMENTS_KEY = 'anitube.comments.v1';

function loadAll(): CommentsMap {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CommentsMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let commentsState: CommentsMap = loadAll();
const listeners = new Set<() => void>();
const EMPTY_LIST: UserComment[] = [];

function persist(next: CommentsMap) {
  commentsState = next;
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const commentsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getForAnime(animeId: string): UserComment[] {
    return commentsState[animeId] ?? EMPTY_LIST;
  },
  addComment(
    animeId: string,
    text: string,
    profile: UserProfile,
    options?: { episodeNumber?: number | null; parentId?: string | null }
  ): UserComment | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`;
    const item: UserComment = {
      id,
      animeId,
      episodeNumber: options?.episodeNumber ?? null,
      parentId: options?.parentId ?? null,
      authorName: profile.name,
      authorHandle: profile.handle,
      authorAvatar: profile.avatarUrl,
      text: trimmed,
      createdAt: Date.now(),
      likes: 0,
      likedByMe: false,
    };
    const existing = commentsState[animeId] ?? [];
    persist({
      ...commentsState,
      [animeId]: [item, ...existing],
    });
    return item;
  },
  toggleLike(animeId: string, commentId: string) {
    const list = commentsState[animeId];
    if (!list) return;
    const updated = list.map((c) => {
      if (c.id !== commentId) return c;
      const nextLiked = !c.likedByMe;
      return {
        ...c,
        likedByMe: nextLiked,
        likes: Math.max(0, c.likes + (nextLiked ? 1 : -1)),
      };
    });
    persist({ ...commentsState, [animeId]: updated });
  },
  deleteComment(animeId: string, commentId: string) {
    const list = commentsState[animeId];
    if (!list) return;
    persist({
      ...commentsState,
      [animeId]: list.filter((c) => c.id !== commentId && c.parentId !== commentId),
    });
  },
  exportAll(): CommentsMap {
    return commentsState;
  },
};

export function useComments(animeId: string): UserComment[] {
  const all = useSyncExternalStore(
    commentsStore.subscribe,
    () => commentsState
  );
  return all[animeId] ?? EMPTY_LIST;
}
