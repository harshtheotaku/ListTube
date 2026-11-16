import { useSyncExternalStore } from 'react';
import { Anime, LibraryState, ListEntry } from '../types';
import { animeStore } from './animeStore';
import { commentsStore, UserComment } from './comments';
import { library } from './library';
import { profileStore, UserProfile } from './profile';
import { settingsStore } from './settings';
import {
  supabase,
  syncVaultCreate,
  syncVaultPull,
  syncVaultPush,
  SyncVaultPayload,
  writeBackAniListEdge,
} from './supabase';

const CLOUD_META_KEY = 'listtube.cloud.v1';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface CloudStatus {
  syncCode: string | null;
  syncVersion: number;
  userId: string | null;
  userEmail: string | null;
  state: SyncState;
  lastSyncedAt: number | null;
  lastError: string | null;
  anilistWritebackToken: string;
  isLinked: boolean;
}

export interface MergedComment extends UserComment {
  isCloud?: boolean;
  ownerUserId?: string;
}

interface CloudMeta {
  syncCode: string | null;
  syncVersion: number;
  lastSyncedAt: number | null;
  anilistWritebackToken: string;
  profileUpdatedAt: number;
  deletedEntryIds: string[];
  deletedCommentIds: string[];
}

function loadMeta(): CloudMeta {
  try {
    const raw = localStorage.getItem(CLOUD_META_KEY);
    if (!raw) {
      return {
        syncCode: null,
        syncVersion: 0,
        lastSyncedAt: null,
        anilistWritebackToken: '',
        profileUpdatedAt: 0,
        deletedEntryIds: [],
        deletedCommentIds: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<CloudMeta>;
    return {
      syncCode: parsed.syncCode || null,
      syncVersion: Number(parsed.syncVersion ?? 0),
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      anilistWritebackToken: parsed.anilistWritebackToken ?? '',
      profileUpdatedAt: Number(parsed.profileUpdatedAt ?? 0),
      deletedEntryIds: Array.isArray(parsed.deletedEntryIds) ? parsed.deletedEntryIds : [],
      deletedCommentIds: Array.isArray(parsed.deletedCommentIds) ? parsed.deletedCommentIds : [],
    };
  } catch {
    return {
      syncCode: null,
      syncVersion: 0,
      lastSyncedAt: null,
      anilistWritebackToken: '',
      profileUpdatedAt: 0,
      deletedEntryIds: [],
      deletedCommentIds: [],
    };
  }
}

let meta: CloudMeta = loadMeta();
let userId: string | null = null;
let userEmail: string | null = null;
let syncState: SyncState = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle';
let lastError: string | null = null;
let applyingRemote = false;
let initialized = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let cachedSnapshot: CloudStatus | null = null;

const listeners = new Set<() => void>();

function saveMeta() {
  try {
    localStorage.setItem(CLOUD_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

function emit() {
  cachedSnapshot = null;
  listeners.forEach((l) => l());
}

function getSnapshot(): CloudStatus {
  if (!cachedSnapshot) {
    cachedSnapshot = {
      syncCode: meta.syncCode,
      syncVersion: meta.syncVersion,
      userId,
      userEmail,
      state: syncState,
      lastSyncedAt: meta.lastSyncedAt,
      lastError,
      anilistWritebackToken: meta.anilistWritebackToken,
      isLinked: Boolean(meta.syncCode || userId),
    };
  }
  return cachedSnapshot;
}

function compactSnapshot(anime: Anime): Anime {
  return {
    id: anime.id,
    mediaType: anime.mediaType,
    source: anime.source,
    anilistId: anime.anilistId,
    malId: anime.malId,
    title: anime.title,
    titleRomaji: anime.titleRomaji,
    cover: anime.cover,
    banner: anime.banner,
    trailerThumbnail: anime.trailerThumbnail,
    hasWideBanner: anime.hasWideBanner,
    hasOfficialBanner: anime.hasOfficialBanner,
    description: '',
    genres: anime.genres.slice(0, 6),
    tags: anime.tags.slice(0, 6),
    studios: anime.studios.slice(0, 3),
    year: anime.year,
    season: anime.season,
    format: anime.format,
    countryOfOrigin: anime.countryOfOrigin,
    mediaLabel: anime.mediaLabel,
    episodes: anime.episodes,
    chapters: anime.chapters,
    score: anime.score,
    popularity: anime.popularity,
    status: anime.status,
    trailerYoutubeId: anime.trailerYoutubeId,
    streaming: [],
    similar: [],
    fetchedAt: anime.fetchedAt || Date.now(),
    pinned: true,
  };
}

function buildLocalVaultPayload(): SyncVaultPayload {
  const lib = library.getSnapshot();
  const snapshots: Record<string, Anime> = {};
  for (const id of Object.keys(lib.entries)) {
    const a = animeStore.get(id);
    if (a) snapshots[id] = compactSnapshot(a);
  }
  return {
    library: {
      ...lib,
      mangaInterests: lib.mangaInterests ?? [],
    },
    profile: profileStore.getSnapshot(),
    profileUpdatedAt: meta.profileUpdatedAt || Date.now(),
    settings: settingsStore.getSnapshot(),
    comments: commentsStore.exportAll(),
    snapshots,
    deletedEntryIds: meta.deletedEntryIds,
    deletedCommentIds: meta.deletedCommentIds,
  };
}

function applyRemoteVaultPayload(remote: SyncVaultPayload): void {
  applyingRemote = true;
  try {
    // 1. Hydrate media snapshots so titles/covers render on a brand new device
    if (remote.snapshots && typeof remote.snapshots === 'object') {
      const items = Object.values(remote.snapshots).filter(
        (item): item is Anime => Boolean(item && typeof item === 'object' && 'id' in item && 'title' in item)
      );
      if (items.length > 0) {
        animeStore.rememberMany(items);
        for (const item of items) animeStore.pin(item.id);
      }
    }

    // 2. Merge library state
    const localLib = library.getSnapshot();
    const remoteLib = remote.library as Partial<LibraryState> | undefined;
    if (remoteLib) {
      const mergedEntries: Record<string, ListEntry> = { ...(localLib.entries ?? {}) };
      const deletedSet = new Set(meta.deletedEntryIds);

      for (const [id, rEntry] of Object.entries(remoteLib.entries ?? {})) {
        if (!rEntry) continue;
        if (deletedSet.has(id) && localLib.updatedAt > (rEntry.updatedAt ?? 0)) continue;
        const lEntry = mergedEntries[id];
        if (!lEntry || (rEntry.updatedAt ?? 0) >= (lEntry.updatedAt ?? 0)) {
          mergedEntries[id] = rEntry;
        }
      }

      const mergedNotInterested = Array.from(
        new Set([...(localLib.notInterested ?? []), ...(remoteLib.notInterested ?? [])])
      );
      const mergedInterests =
        (remoteLib.interests?.length ?? 0) > 0 && (remoteLib.updatedAt ?? 0) >= localLib.updatedAt
          ? remoteLib.interests!
          : localLib.interests;
      const mergedMangaInterests =
        (remoteLib.mangaInterests?.length ?? 0) > 0 && (remoteLib.updatedAt ?? 0) >= localLib.updatedAt
          ? remoteLib.mangaInterests!
          : localLib.mangaInterests ?? [];
      const mergedTrackers =
        (remoteLib.trackers?.length ?? 0) >= localLib.trackers.length
          ? remoteLib.trackers ?? []
          : localLib.trackers;

      library.replaceFromCloud({
        entries: mergedEntries,
        notInterested: mergedNotInterested,
        events:
          (remoteLib.events?.length ?? 0) > localLib.events.length
            ? remoteLib.events!
            : localLib.events,
        trackers: mergedTrackers,
        interests: mergedInterests,
        mangaInterests: mergedMangaInterests,
        updatedAt: Math.max(localLib.updatedAt, remoteLib.updatedAt ?? 0),
      });
    }

    // 3. Profile
    const remoteProf = remote.profile as UserProfile | undefined;
    const remoteProfAt = Number(remote.profileUpdatedAt ?? 0);
    if (remoteProf && remoteProf.name && remoteProfAt >= meta.profileUpdatedAt) {
      profileStore.replaceFromCloud(remoteProf);
      meta.profileUpdatedAt = remoteProfAt;
    }

    // 4. Settings
    if (remote.settings && typeof remote.settings === 'object') {
      settingsStore.replaceFromCloud(remote.settings as { autoplayTrailer?: boolean });
    }

    // 5. Comments
    if (remote.comments && typeof remote.comments === 'object') {
      const localComments = commentsStore.exportAll();
      const mergedComments: Record<string, UserComment[]> = {};
      const allIds = new Set([...Object.keys(localComments), ...Object.keys(remote.comments)]);
      const delSet = new Set(meta.deletedCommentIds);

      for (const mId of allIds) {
        const map = new Map<string, UserComment>();
        for (const c of (remote.comments[mId] ?? []) as UserComment[]) {
          if (c?.id && !delSet.has(c.id)) map.set(c.id, c);
        }
        for (const c of localComments[mId] ?? []) {
          if (c?.id && !delSet.has(c.id)) map.set(c.id, c);
        }
        mergedComments[mId] = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
      }
      commentsStore.replaceFromCloud(mergedComments);
    }
  } finally {
    applyingRemote = false;
  }
}

async function pushAuthAccount(uid: string): Promise<void> {
  const lib = library.getSnapshot();
  const profile = profileStore.getSnapshot();
  const settings = settingsStore.getSnapshot();

  // 1. Upsert profile
  const { error: profErr } = await supabase.from('profiles').upsert(
    {
      id: uid,
      display_name: profile.name,
      handle: profile.handle,
      avatar_url: profile.avatarUrl,
      avatar_id: profile.avatarId,
      autoplay_trailer: settings.autoplayTrailer,
      interests: lib.interests,
      manga_interests: lib.mangaInterests ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (profErr) throw new Error(profErr.message);

  // 2. Upsert preferences
  const { error: prefErr } = await supabase.from('user_preferences').upsert(
    {
      user_id: uid,
      not_interested: lib.notInterested,
      trackers: lib.trackers,
      recent_events: lib.events.slice(-150),
      anilist_token: meta.anilistWritebackToken || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (prefErr) throw new Error(prefErr.message);

  // 3. Upsert library_entries in batches
  const rows = Object.values(lib.entries).map((entry) => {
    const snap = animeStore.get(entry.animeId);
    return {
      user_id: uid,
      anime_id: entry.animeId,
      media_type: entry.mediaType ?? snap?.mediaType ?? 'ANIME',
      status: entry.status,
      score: typeof entry.score === 'number' ? Math.round(entry.score) : null,
      progress: typeof entry.progress === 'number' ? entry.progress : 0,
      media_snapshot: snap ? compactSnapshot(snap) : {},
      added_at: entry.addedAt || entry.updatedAt || Date.now(),
      updated_at: entry.updatedAt || Date.now(),
    };
  });

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('library_entries')
      .upsert(chunk, { onConflict: 'user_id,anime_id' });
    if (error) throw new Error(error.message);
  }

  // 4. Propagate deletions
  if (meta.deletedEntryIds.length > 0) {
    await supabase
      .from('library_entries')
      .delete()
      .eq('user_id', uid)
      .in('anime_id', meta.deletedEntryIds);
    meta.deletedEntryIds = [];
  }
}

async function pullAuthAccount(uid: string): Promise<void> {
  const [profRes, prefRes, entriesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, handle, avatar_url, avatar_id, autoplay_trailer, interests, manga_interests, updated_at')
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('user_preferences')
      .select('not_interested, trackers, recent_events, anilist_token, updated_at')
      .eq('user_id', uid)
      .maybeSingle(),
    supabase
      .from('library_entries')
      .select('anime_id, media_type, status, score, progress, media_snapshot, added_at, updated_at')
      .eq('user_id', uid),
  ]);

  if (profRes.error) throw new Error(profRes.error.message);
  if (prefRes.error) throw new Error(prefRes.error.message);
  if (entriesRes.error) throw new Error(entriesRes.error.message);

  const remoteEntries: Record<string, ListEntry> = {};
  const remoteSnapshots: Record<string, Anime> = {};

  for (const row of entriesRes.data ?? []) {
    if (row.media_snapshot && typeof row.media_snapshot === 'object' && 'id' in row.media_snapshot) {
      remoteSnapshots[row.anime_id] = row.media_snapshot as Anime;
    }
    remoteEntries[row.anime_id] = {
      animeId: row.anime_id,
      mediaType: (row.media_type === 'MANGA' ? 'MANGA' : 'ANIME'),
      status: row.status as ListEntry['status'],
      score: row.score ?? undefined,
      progress: row.progress ?? 0,
      addedAt: Number(row.added_at),
      updatedAt: Number(row.updated_at),
    };
  }

  const profRow = profRes.data;
  const prefRow = prefRes.data;

  if (prefRow?.anilist_token && !meta.anilistWritebackToken) {
    meta.anilistWritebackToken = String(prefRow.anilist_token);
  }

  const hasRemoteData = Boolean(profRow || prefRow || Object.keys(remoteEntries).length > 0);
  if (hasRemoteData) {
    const profUpdatedAt = profRow?.updated_at ? new Date(profRow.updated_at).getTime() : 0;
    const prefUpdatedAt = prefRow?.updated_at ? new Date(prefRow.updated_at).getTime() : 0;

    applyRemoteVaultPayload({
      library: {
        entries: remoteEntries,
        notInterested: Array.isArray(prefRow?.not_interested) ? prefRow.not_interested : [],
        events: Array.isArray(prefRow?.recent_events) ? prefRow.recent_events : [],
        trackers: Array.isArray(prefRow?.trackers) ? prefRow.trackers : [],
        interests: Array.isArray(profRow?.interests) ? profRow.interests : [],
        mangaInterests: Array.isArray(profRow?.manga_interests) ? profRow.manga_interests : [],
        updatedAt: Math.max(profUpdatedAt, prefUpdatedAt),
      },
      profile: profRow
        ? {
            name: profRow.display_name,
            handle: profRow.handle,
            avatarUrl: profRow.avatar_url,
            avatarId: profRow.avatar_id || 'gojo',
          }
        : undefined,
      profileUpdatedAt: profUpdatedAt,
      settings: profRow ? { autoplayTrailer: Boolean(profRow.autoplay_trailer) } : undefined,
      snapshots: remoteSnapshots,
    });
  }

  // If local had entries that weren't in remote yet, push merged state back cleanly
  const localCount = Object.keys(library.getSnapshot().entries).length;
  const remoteCount = Object.keys(remoteEntries).length;
  if (localCount > remoteCount || !profRow) {
    await pushAuthAccount(uid);
  }
}

let prevEntriesSnapshot: Record<string, ListEntry> = { ...library.getSnapshot().entries };

function handleLibraryChange() {
  if (applyingRemote) {
    prevEntriesSnapshot = { ...library.getSnapshot().entries };
    return;
  }

  const current = library.getSnapshot().entries;

  // Detect deletions
  for (const prevId of Object.keys(prevEntriesSnapshot)) {
    if (!current[prevId] && !meta.deletedEntryIds.includes(prevId)) {
      meta.deletedEntryIds = [...meta.deletedEntryIds, prevId].slice(-200);
    }
  }

  // Detect additions/edits -> optional AniList bidirectional write-back
  if (meta.anilistWritebackToken) {
    for (const [id, nextEntry] of Object.entries(current)) {
      const prev = prevEntriesSnapshot[id];
      const changed =
        !prev ||
        prev.status !== nextEntry.status ||
        prev.progress !== nextEntry.progress ||
        prev.score !== nextEntry.score;

      if (changed) {
        const snap = animeStore.get(id);
        const rawAnilistId =
          snap?.anilistId ?? (id.startsWith('anilist') ? Number(id.split(':')[1]) : 0);
        if (rawAnilistId > 0) {
          void writeBackAniListEdge({
            token: meta.anilistWritebackToken,
            mediaId: rawAnilistId,
            status: nextEntry.status,
            score: nextEntry.score,
            progress: nextEntry.progress,
          });
        }
      }
    }
  }

  prevEntriesSnapshot = { ...current };
  saveMeta();
  scheduleDebouncedSync();
}

function handleProfileChange() {
  if (applyingRemote) return;
  meta.profileUpdatedAt = Date.now();
  saveMeta();
  scheduleDebouncedSync();
}

function scheduleDebouncedSync() {
  if (!meta.syncCode && !userId) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    syncState = 'offline';
    emit();
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void cloudSync.syncNow();
  }, 1300);
}

export const cloudSync = {
  init() {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    library.subscribe(handleLibraryChange);
    profileStore.subscribe(handleProfileChange);
    settingsStore.subscribe(() => {
      if (!applyingRemote) scheduleDebouncedSync();
    });
    commentsStore.subscribe(() => {
      if (!applyingRemote) scheduleDebouncedSync();
    });

    window.addEventListener('online', () => {
      syncState = meta.syncCode || userId ? 'syncing' : 'idle';
      emit();
      if (meta.syncCode || userId) void cloudSync.syncNow();
    });
    window.addEventListener('offline', () => {
      syncState = 'offline';
      emit();
    });

    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user;
      if (sessionUser) {
        userId = sessionUser.id;
        userEmail = sessionUser.email ?? null;
        emit();
        void cloudSync.syncNow();
      } else if (meta.syncCode) {
        void cloudSync.pullVault(meta.syncCode);
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      userId = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      emit();
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        void cloudSync.syncNow();
      }
    });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot,

  async syncNow(): Promise<void> {
    if (!meta.syncCode && !userId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      syncState = 'offline';
      emit();
      return;
    }

    syncState = 'syncing';
    lastError = null;
    emit();

    try {
      if (userId) {
        await pullAuthAccount(userId);
        await pushAuthAccount(userId);
      }

      if (meta.syncCode) {
        const res = await syncVaultPush(meta.syncCode, buildLocalVaultPayload());
        applyRemoteVaultPayload(res.payload);
        meta.syncVersion = res.version;
        meta.deletedEntryIds = [];
        meta.deletedCommentIds = [];
      }

      meta.lastSyncedAt = Date.now();
      saveMeta();
      syncState = 'synced';
      lastError = null;
      emit();
    } catch (err) {
      syncState = 'error';
      lastError = err instanceof Error ? err.message : 'Cloud sync failed';
      emit();
    }
  },

  async createSyncCode(): Promise<string> {
    syncState = 'syncing';
    lastError = null;
    emit();
    try {
      const res = await syncVaultCreate(buildLocalVaultPayload());
      meta.syncCode = res.code;
      meta.syncVersion = res.version;
      meta.lastSyncedAt = Date.now();
      meta.deletedEntryIds = [];
      meta.deletedCommentIds = [];
      saveMeta();
      syncState = 'synced';
      emit();
      return res.code;
    } catch (err) {
      syncState = 'error';
      lastError = err instanceof Error ? err.message : 'Could not create cloud sync code';
      emit();
      throw err;
    }
  },

  async linkSyncCode(rawCode: string): Promise<void> {
    const clean = rawCode.toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
    if (clean.length < 8) throw new Error('Enter a valid Sync Code (e.g. LT-XXXX-XXXX-XXXX)');

    syncState = 'syncing';
    lastError = null;
    emit();
    try {
      const pulled = await syncVaultPull(clean);
      applyRemoteVaultPayload(pulled.payload);
      const pushed = await syncVaultPush(clean, buildLocalVaultPayload());
      applyRemoteVaultPayload(pushed.payload);

      meta.syncCode = clean;
      meta.syncVersion = pushed.version;
      meta.lastSyncedAt = Date.now();
      meta.deletedEntryIds = [];
      meta.deletedCommentIds = [];
      saveMeta();
      syncState = 'synced';
      emit();
    } catch (err) {
      syncState = 'error';
      lastError = err instanceof Error ? err.message : 'Sync code not found';
      emit();
      throw err;
    }
  },

  async pullVault(code: string): Promise<void> {
    syncState = 'syncing';
    emit();
    try {
      const pulled = await syncVaultPull(code);
      applyRemoteVaultPayload(pulled.payload);
      meta.syncVersion = pulled.version;
      meta.lastSyncedAt = Date.now();
      saveMeta();
      syncState = 'synced';
      emit();
    } catch (err) {
      syncState = 'error';
      lastError = err instanceof Error ? err.message : 'Failed to pull vault';
      emit();
    }
  },

  unlinkSyncCode(): void {
    meta.syncCode = null;
    meta.syncVersion = 0;
    saveMeta();
    syncState = userId ? 'idle' : 'idle';
    lastError = null;
    emit();
  },

  async signUpWithEmail(email: string, password: string): Promise<{ message: string; activeSession: boolean }> {
    syncState = 'syncing';
    lastError = null;
    emit();
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      syncState = 'error';
      lastError = error.message;
      emit();
      throw new Error(error.message);
    }
    if (data.session?.user) {
      userId = data.session.user.id;
      userEmail = data.session.user.email ?? email.trim();
      await pushAuthAccount(userId);
      meta.lastSyncedAt = Date.now();
      saveMeta();
      syncState = 'synced';
      emit();
      return { message: 'Account created and synced to cloud.', activeSession: true };
    }
    syncState = meta.syncCode ? 'synced' : 'idle';
    emit();
    return {
      message:
        'Check your inbox to verify your email address, or use a 1-tap Sync Code below right now.',
      activeSession: false,
    };
  },

  async signInWithEmail(email: string, password: string): Promise<void> {
    syncState = 'syncing';
    lastError = null;
    emit();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      syncState = 'error';
      lastError = error.message;
      emit();
      throw new Error(error.message);
    }
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? email.trim();
    if (userId) {
      await pullAuthAccount(userId);
      await pushAuthAccount(userId);
    }
    meta.lastSyncedAt = Date.now();
    saveMeta();
    syncState = 'synced';
    emit();
  },

  async sendMagicLink(email: string): Promise<string> {
    const redirectTo =
      typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? `${window.location.origin}${window.location.pathname}`
        : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw new Error(error.message);
    return `Magic sign-in link sent to ${email.trim()}. Check your email!`;
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    userId = null;
    userEmail = null;
    syncState = meta.syncCode ? 'synced' : 'idle';
    lastError = null;
    emit();
  },

  async uploadAvatar(file: File): Promise<string> {
    if (!userId) {
      throw new Error('Sign in with Cloud Account to store high-res avatars in Storage');
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  },

  setAniListWritebackToken(token: string) {
    meta.anilistWritebackToken = token.trim();
    saveMeta();
    emit();
    if (userId) scheduleDebouncedSync();
  },

  async loadCommentsForMedia(animeId: string): Promise<MergedComment[]> {
    const localList: MergedComment[] = commentsStore.getForAnime(animeId).map((c) => ({ ...c }));
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('id, anime_id, user_id, author_name, author_handle, author_avatar, body, likes, created_at, comment_likes(user_id)')
        .eq('anime_id', animeId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error || !data) return localList;

      const byId = new Map<string, MergedComment>();
      for (const row of data as any[]) {
        const likers = Array.isArray(row.comment_likes) ? row.comment_likes : [];
        const likedByMe = Boolean(userId && likers.some((l: any) => l.user_id === userId));
        byId.set(row.id, {
          id: row.id,
          animeId: row.anime_id,
          authorName: row.author_name,
          authorHandle: row.author_handle,
          authorAvatar: row.author_avatar,
          text: row.body,
          createdAt: new Date(row.created_at).getTime(),
          likes: Math.max(Number(row.likes ?? 0), likers.length),
          likedByMe,
          isCloud: true,
          ownerUserId: row.user_id,
        });
      }

      for (const c of localList) {
        if (!byId.has(c.id)) {
          byId.set(c.id, c);
        }
      }

      return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return localList;
    }
  },

  async postComment(animeId: string, text: string, profile: UserProfile): Promise<MergedComment | undefined> {
    const item = commentsStore.addComment(animeId, text, profile);
    if (!item) return undefined;

    if (userId) {
      try {
        await supabase.from('comments').insert({
          id: item.id,
          anime_id: animeId,
          user_id: userId,
          author_name: profile.name,
          author_handle: profile.handle,
          author_avatar: profile.avatarUrl,
          body: item.text,
          likes: 0,
        });
        return { ...item, isCloud: true, ownerUserId: userId };
      } catch {
        /* local + Sync Vault still holds comment */
      }
    }
    return item;
  },

  async toggleCommentLike(animeId: string, comment: MergedComment): Promise<void> {
    commentsStore.toggleLike(animeId, comment.id);
    if (userId && comment.isCloud) {
      try {
        if (comment.likedByMe) {
          await supabase
            .from('comment_likes')
            .delete()
            .eq('comment_id', comment.id)
            .eq('user_id', userId);
        } else {
          await supabase
            .from('comment_likes')
            .upsert({ comment_id: comment.id, user_id: userId }, { onConflict: 'comment_id,user_id' });
        }
      } catch {
        /* ignore */
      }
    }
  },

  async deleteComment(animeId: string, comment: MergedComment): Promise<void> {
    meta.deletedCommentIds = [...meta.deletedCommentIds, comment.id].slice(-200);
    saveMeta();
    commentsStore.deleteComment(animeId, comment.id);
    if (userId && comment.ownerUserId === userId) {
      try {
        await supabase.from('comments').delete().eq('id', comment.id).eq('user_id', userId);
      } catch {
        /* ignore */
      }
    }
  },
};

// Auto-initialize once in browser runtime
cloudSync.init();

export function useCloudSync(): CloudStatus {
  return useSyncExternalStore(cloudSync.subscribe, cloudSync.getSnapshot, cloudSync.getSnapshot);
}
