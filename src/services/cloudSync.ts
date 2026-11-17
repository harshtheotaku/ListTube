import { useSyncExternalStore } from 'react';
import { Anime, LibraryState, ListEntry, ListStatus, MediaType } from '../types';
import { fetchByMalIds } from './anilist';
import { animeStore } from './animeStore';
import { commentsStore, UserComment } from './comments';
import { publishActivity } from './community';
import { library } from './library';
import { profileStore, sanitizeHandle, UserProfile } from './profile';
import { settingsStore } from './settings';
import {
  checkGoogleProviderEnabled,
  createAniListBridgeSessionEdge,
  exchangeAniListOAuthEdge,
  exchangeMalOAuthEdge,
  fetchMalOAuthListEdge,
  fetchOAuthServerStatus,
  getAppBaseUrl,
  getOAuthRedirectUri,
  OAuthBridgePayload,
  supabase,
  writeBackAniListEdge,
  writeBackMalEdge,
} from './supabase';
import {
  buildAniListAuthorizeUrl,
  buildMalAuthorizeUrl,
  generatePkceVerifier,
  importAniListWithToken,
  readAndClearMalPkceSession,
  storeMalPkceSession,
} from './trackers';

const CLOUD_META_KEY = 'listtube.cloud.v2';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface CloudStatus {
  userId: string | null;
  userEmail: string | null;
  state: SyncState;
  lastSyncedAt: number | null;
  lastError: string | null;
  anilistWritebackToken: string;
  malConnected: boolean;
  googleEnabled: boolean | null;
  isLinked: boolean;
}

export interface MergedComment extends UserComment {
  isCloud?: boolean;
  ownerUserId?: string;
}

interface CloudMeta {
  lastSyncedAt: number | null;
  anilistWritebackToken: string;
  malAccessToken: string;
  malRefreshToken: string;
  malTokenExpiresAt: number;
  profileUpdatedAt: number;
  deletedEntryIds: string[];
  signedOutManually?: boolean;
}

function loadMeta(): CloudMeta {
  try {
    const raw = localStorage.getItem(CLOUD_META_KEY);
    if (!raw) {
      return {
        lastSyncedAt: null,
        anilistWritebackToken: '',
        malAccessToken: '',
        malRefreshToken: '',
        malTokenExpiresAt: 0,
        profileUpdatedAt: 0,
        deletedEntryIds: [],
        signedOutManually: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<CloudMeta>;
    return {
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      anilistWritebackToken: parsed.anilistWritebackToken ?? '',
      malAccessToken: parsed.malAccessToken ?? '',
      malRefreshToken: parsed.malRefreshToken ?? '',
      malTokenExpiresAt: Number(parsed.malTokenExpiresAt ?? 0),
      profileUpdatedAt: Number(parsed.profileUpdatedAt ?? 0),
      deletedEntryIds: Array.isArray(parsed.deletedEntryIds) ? parsed.deletedEntryIds : [],
      signedOutManually: Boolean(parsed.signedOutManually),
    };
  } catch {
    return {
      lastSyncedAt: null,
      anilistWritebackToken: '',
      malAccessToken: '',
      malRefreshToken: '',
      malTokenExpiresAt: 0,
      profileUpdatedAt: 0,
      deletedEntryIds: [],
      signedOutManually: false,
    };
  }
}

let meta: CloudMeta = loadMeta();
let userId: string | null = null;
let userEmail: string | null = null;
let googleEnabled: boolean | null = null;
let syncState: SyncState =
  typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle';
let lastError: string | null = null;
let applyingRemote = false;
let initialized = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let cachedSnapshot: CloudStatus | null = null;
const oauthHandlers = new Set<(info: { provider: 'anilist' | 'mal'; count: number; error?: string }) => void>();

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
      userId,
      userEmail,
      state: syncState,
      lastSyncedAt: meta.lastSyncedAt,
      lastError,
      anilistWritebackToken: meta.anilistWritebackToken,
      malConnected: Boolean(meta.malAccessToken),
      googleEnabled,
      isLinked: Boolean(userId),
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
    volumes: anime.volumes,
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

function applyRemoteData(remote: {
  library?: Partial<LibraryState>;
  profile?: UserProfile;
  profileUpdatedAt?: number;
  settings?: Partial<ReturnType<typeof settingsStore.getSnapshot>>;
  snapshots?: Record<string, Anime>;
}): void {
  applyingRemote = true;
  try {
    if (remote.snapshots && typeof remote.snapshots === 'object') {
      const items = Object.values(remote.snapshots).filter(
        (item): item is Anime => Boolean(item && typeof item === 'object' && 'id' in item && 'title' in item)
      );
      if (items.length > 0) {
        animeStore.rememberMany(items);
        for (const item of items) animeStore.pin(item.id);
      }
    }

    const localLib = library.getSnapshot();
    const remoteLib = remote.library;
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
      const mergedLiked = Array.from(
        new Set([...(localLib.likedIds ?? []), ...(remoteLib.likedIds ?? [])])
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
        likedIds: mergedLiked,
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

    const remoteProf = remote.profile;
    const remoteProfAt = Number(remote.profileUpdatedAt ?? 0);
    if (remoteProf && remoteProf.name && remoteProfAt >= meta.profileUpdatedAt) {
      profileStore.replaceFromCloud(remoteProf);
      meta.profileUpdatedAt = remoteProfAt;
    }

    if (remote.settings && typeof remote.settings === 'object') {
      settingsStore.replaceFromCloud(remote.settings);
    }
  } finally {
    applyingRemote = false;
  }
}

async function seedProfileFromGoogleSession(uid: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.id !== uid) return;
    const current = profileStore.getSnapshot();
    const md = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const gName = md.full_name || md.name;
    const gAvatar = md.avatar_url || md.picture;
    const patch: Partial<UserProfile> = {};
    if (gName && current.name === 'ListTube Viewer') {
      patch.name = gName;
      patch.handle = sanitizeHandle(gName);
    }
    if (gAvatar && current.avatarId === 'gojo') {
      patch.avatarId = 'google';
      patch.avatarUrl = gAvatar;
    }
    if (Object.keys(patch).length > 0) {
      profileStore.updateProfile(patch);
    }
  } catch {
    /* ignore */
  }
}

async function pushAuthAccount(uid: string): Promise<void> {
  const lib = library.getSnapshot();
  const profile = profileStore.getSnapshot();
  const settings = settingsStore.getSnapshot();

  const { error: profErr } = await supabase.from('profiles').upsert(
    {
      id: uid,
      display_name: profile.name,
      handle: profile.handle,
      avatar_url: profile.avatarUrl,
      avatar_id: profile.avatarId,
      banner_url: profile.bannerUrl ?? null,
      bio: profile.bio ?? null,
      location: profile.location ?? null,
      favorite_anime_ids: profile.favoriteAnimeIds ?? [],
      favorite_manga_ids: profile.favoriteMangaIds ?? [],
      favorite_characters: profile.favoriteCharacters ?? [],
      favorite_characters_data: profile.favoriteCharactersData ?? [],
      custom_list_names: profile.customListNames ?? [],
      autoplay_trailer: settings.autoplayTrailer,
      score_format: settings.scoreFormat,
      show_community_links: settings.showCommunityLinks,
      interests: lib.interests,
      manga_interests: lib.mangaInterests ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (profErr) throw new Error(profErr.message);

  const { error: prefErr } = await supabase.from('user_preferences').upsert(
    {
      user_id: uid,
      not_interested: lib.notInterested,
      liked_media: lib.likedIds,
      trackers: lib.trackers,
      recent_events: lib.events.slice(-150),
      anilist_token: meta.anilistWritebackToken || null,
      mal_token: meta.malAccessToken || null,
      mal_refresh_token: meta.malRefreshToken || null,
      mal_token_expires_at: meta.malTokenExpiresAt || null,
      show_community_links: settings.showCommunityLinks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (prefErr) throw new Error(prefErr.message);

  // Sync media_likes table
  const likedSet = new Set(lib.likedIds);
  const { data: remoteLikes } = await supabase
    .from('media_likes')
    .select('anime_id')
    .eq('user_id', uid);
  const remoteLikeSet = new Set((remoteLikes ?? []).map((r: any) => String(r.anime_id)));
  const toInsertLikes = lib.likedIds
    .filter((id) => !remoteLikeSet.has(id))
    .map((animeId) => ({
      user_id: uid,
      anime_id: animeId,
      media_type: animeStore.get(animeId)?.mediaType ?? (animeId.includes('manga') ? 'MANGA' : 'ANIME'),
    }));
  if (toInsertLikes.length > 0) {
    await supabase.from('media_likes').upsert(toInsertLikes, { onConflict: 'user_id,anime_id' });
  }
  const toDeleteLikes = [...remoteLikeSet].filter((id) => !likedSet.has(id));
  if (toDeleteLikes.length > 0) {
    await supabase.from('media_likes').delete().eq('user_id', uid).in('anime_id', toDeleteLikes);
  }

  // Upsert rich library_entries
  const rows = Object.values(lib.entries).map((entry) => {
    const snap = animeStore.get(entry.animeId);
    const decScore = typeof entry.score === 'number' && entry.score > 0 ? entry.score : null;
    return {
      user_id: uid,
      anime_id: entry.animeId,
      media_type: entry.mediaType ?? snap?.mediaType ?? 'ANIME',
      status: entry.status,
      score: decScore ? Math.max(1, Math.min(10, Math.round(decScore))) : null,
      score_decimal: decScore,
      progress: typeof entry.progress === 'number' ? entry.progress : 0,
      progress_volumes: typeof entry.progressVolumes === 'number' ? entry.progressVolumes : 0,
      rewatch_count: typeof entry.repeat === 'number' ? entry.repeat : 0,
      started_at: entry.startedAt || null,
      completed_at: entry.completedAt || null,
      notes: entry.notes || null,
      is_private: Boolean(entry.isPrivate),
      custom_lists: entry.customLists ?? [],
      priority: typeof entry.priority === 'number' ? entry.priority : 0,
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
  const [profRes, prefRes, entriesRes, likesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'display_name, handle, avatar_url, avatar_id, banner_url, bio, location, favorite_anime_ids, favorite_manga_ids, favorite_characters, favorite_characters_data, custom_list_names, autoplay_trailer, score_format, show_community_links, interests, manga_interests, updated_at'
      )
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('user_preferences')
      .select(
        'not_interested, liked_media, trackers, recent_events, anilist_token, mal_token, mal_refresh_token, mal_token_expires_at, show_community_links, updated_at'
      )
      .eq('user_id', uid)
      .maybeSingle(),
    supabase
      .from('library_entries')
      .select(
        'anime_id, media_type, status, score, score_decimal, progress, progress_volumes, rewatch_count, started_at, completed_at, notes, is_private, custom_lists, priority, media_snapshot, added_at, updated_at'
      )
      .eq('user_id', uid),
    supabase.from('media_likes').select('anime_id').eq('user_id', uid),
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
    const decScore =
      row.score_decimal !== null && row.score_decimal !== undefined
        ? Number(row.score_decimal)
        : row.score ?? undefined;
    remoteEntries[row.anime_id] = {
      animeId: row.anime_id,
      mediaType: row.media_type === 'MANGA' ? 'MANGA' : 'ANIME',
      status: row.status as ListEntry['status'],
      score: decScore,
      progress: row.progress ?? 0,
      progressVolumes: row.progress_volumes ?? undefined,
      repeat: row.rewatch_count ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      notes: row.notes ?? undefined,
      isPrivate: Boolean(row.is_private),
      customLists: Array.isArray(row.custom_lists) ? row.custom_lists : undefined,
      priority:
        typeof row.priority === 'number' && row.priority >= 0 && row.priority <= 2
          ? (row.priority as 0 | 1 | 2)
          : undefined,
      addedAt: Number(row.added_at),
      updatedAt: Number(row.updated_at),
    };
  }

  const profRow = profRes.data;
  const prefRow = prefRes.data;

  if (prefRow?.anilist_token && !meta.anilistWritebackToken) {
    meta.anilistWritebackToken = String(prefRow.anilist_token);
  }
  if (prefRow?.mal_token && !meta.malAccessToken) {
    meta.malAccessToken = String(prefRow.mal_token);
    meta.malRefreshToken = String(prefRow.mal_refresh_token ?? '');
    meta.malTokenExpiresAt = Number(prefRow.mal_token_expires_at ?? 0);
  }

  const remoteLikedIds = Array.from(
    new Set([
      ...(Array.isArray(prefRow?.liked_media) ? prefRow.liked_media : []),
      ...((likesRes.data ?? []).map((r: any) => String(r.anime_id))),
    ])
  );

  const hasRemoteData = Boolean(
    profRow || prefRow || Object.keys(remoteEntries).length > 0 || remoteLikedIds.length > 0
  );
  if (hasRemoteData) {
    const profUpdatedAt = profRow?.updated_at ? new Date(profRow.updated_at).getTime() : 0;
    const prefUpdatedAt = prefRow?.updated_at ? new Date(prefRow.updated_at).getTime() : 0;

    applyRemoteData({
      library: {
        entries: remoteEntries,
        likedIds: remoteLikedIds,
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
            bannerUrl: profRow.banner_url ?? undefined,
            bio: profRow.bio ?? undefined,
            location: profRow.location ?? undefined,
            favoriteAnimeIds: Array.isArray(profRow.favorite_anime_ids)
              ? profRow.favorite_anime_ids
              : [],
            favoriteMangaIds: Array.isArray(profRow.favorite_manga_ids)
              ? profRow.favorite_manga_ids
              : [],
            favoriteCharacters: Array.isArray(profRow.favorite_characters)
              ? profRow.favorite_characters
              : [],
            favoriteCharactersData: Array.isArray(profRow.favorite_characters_data)
              ? profRow.favorite_characters_data
              : [],
            customListNames: Array.isArray(profRow.custom_list_names)
              ? profRow.custom_list_names
              : undefined,
          }
        : undefined,
      profileUpdatedAt: profUpdatedAt,
      settings: profRow
        ? {
            autoplayTrailer: Boolean(profRow.autoplay_trailer),
            scoreFormat: profRow.score_format ?? 'POINT_10_DECIMAL',
            showCommunityLinks:
              profRow.show_community_links !== undefined
                ? Boolean(profRow.show_community_links)
                : true,
          }
        : undefined,
      snapshots: remoteSnapshots,
    });
  }

  const localCount = Object.keys(library.getSnapshot().entries).length;
  const remoteCount = Object.keys(remoteEntries).length;
  if (localCount > remoteCount || !profRow) {
    await pushAuthAccount(uid);
  }
}

async function ensureFreshMalToken(): Promise<string> {
  if (!meta.malAccessToken) return '';
  if (
    meta.malRefreshToken &&
    meta.malTokenExpiresAt > 0 &&
    Date.now() > meta.malTokenExpiresAt - 120_000
  ) {
    try {
      const refreshed = await exchangeMalOAuthEdge({
        grantType: 'refresh_token',
        refreshToken: meta.malRefreshToken,
      });
      meta.malAccessToken = refreshed.access_token;
      if (refreshed.refresh_token) meta.malRefreshToken = refreshed.refresh_token;
      if (refreshed.expires_in) meta.malTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
      saveMeta();
    } catch {
      /* keep current token attempt */
    }
  }
  return meta.malAccessToken;
}

export async function importFromMalOAuth(token: string): Promise<{ username: string; count: number }> {
  const payload = await fetchMalOAuthListEdge(token);
  const mapMalStatus: Record<string, ListStatus> = {
    watching: 'watching',
    reading: 'watching',
    completed: 'completed',
    on_hold: 'on_hold',
    dropped: 'dropped',
    plan_to_watch: 'planned',
    plan_to_read: 'planned',
  };

  const toImport = async (rows: any[], mediaType: MediaType) => {
    const malIds = rows.map((r) => Number(r?.node?.id)).filter((id) => id > 0);
    const hydrated = malIds.length ? await fetchByMalIds(malIds, mediaType).catch(() => []) : [];
    const byId = new Map(hydrated.map((a) => [a.malId, a]));

    return rows
      .filter((r) => r?.node?.id)
      .map((r) => {
        const malId = Number(r.node.id);
        const st = r.list_status ?? {};
        const fallback: Anime = {
          id: `${mediaType === 'MANGA' ? 'mal-manga' : 'mal'}:${malId}`,
          mediaType,
          source: 'mal',
          malId,
          title: r.node.title || 'Untitled',
          cover: r.node.main_picture?.large || r.node.main_picture?.medium || '',
          banner: r.node.main_picture?.large || r.node.main_picture?.medium || '',
          description: '',
          genres: (r.node.genres ?? []).map((g: any) => g.name).filter(Boolean),
          tags: [],
          studios:
            mediaType === 'MANGA'
              ? (r.node.authors ?? [])
                  .map((a: any) => `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim())
                  .filter(Boolean)
              : (r.node.studios ?? []).map((s: any) => s.name).filter(Boolean),
          year: r.node.start_season?.year ?? undefined,
          format: r.node.media_type?.toUpperCase() ?? undefined,
          episodes: r.node.num_episodes || undefined,
          chapters: r.node.num_chapters || undefined,
          volumes: r.node.num_volumes || undefined,
          score: r.node.mean || undefined,
          popularity: r.node.num_list_users || 0,
          streaming: [],
          similar: [],
          fetchedAt: Date.now(),
        };
        const progress =
          mediaType === 'MANGA' ? st.num_chapters_read : st.num_episodes_watched;
        return {
          anime: byId.get(malId) ?? fallback,
          status: mapMalStatus[st.status ?? 'plan_to_watch'] ?? 'planned',
          score: st.score && st.score > 0 ? st.score : undefined,
          progress: progress && progress > 0 ? progress : undefined,
          progressVolumes: st.num_volumes_read || undefined,
          repeat: (mediaType === 'MANGA' ? st.num_times_reread : st.num_times_rewatched) || undefined,
          startedAt: st.start_date || undefined,
          completedAt: st.finish_date || undefined,
          notes: st.comments || undefined,
        };
      });
  };

  const [animeItems, mangaItems] = await Promise.all([
    toImport(payload.anime ?? [], 'ANIME'),
    toImport(payload.manga ?? [], 'MANGA'),
  ]);
  const allItems = [...animeItems, ...mangaItems];
  animeStore.rememberImported(allItems.map((i) => i.anime));
  library.importEntries(allItems, {
    provider: 'mal',
    username: payload.user?.name || 'MAL User',
    connectedAt: Date.now(),
    imported: allItems.length,
    oauthConnected: true,
    avatar: payload.user?.picture,
  });

  return { username: payload.user?.name || 'MAL User', count: allItems.length };
}

let prevEntriesSnapshot: Record<string, ListEntry> = { ...library.getSnapshot().entries };

async function completeOAuthBridge(bridge?: OAuthBridgePayload | null): Promise<void> {
  if (!bridge?.bridgeTokenHash) return;
  try {
    meta.signedOutManually = false;
    saveMeta();
    await supabase.auth.verifyOtp({
      token_hash: bridge.bridgeTokenHash,
      type: 'email',
    });
  } catch {
    /* keep tracker import even if OTP bridge fails offline */
  }
}

async function processOAuthReturnUrl(): Promise<void> {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  // 1. AniList Implicit Grant return (#access_token=... without leading #/)
  if (hash.startsWith('#access_token=')) {
    const hashParams = new URLSearchParams(hash.slice(1));
    const token = hashParams.get('access_token');
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    if (token) {
      try {
        const [imported, bridgeRes] = await Promise.all([
          importAniListWithToken(token),
          createAniListBridgeSessionEdge(token).catch(() => ({ bridge: null })),
        ]);
        animeStore.rememberImported(imported.entries.map((e) => e.anime));
        library.importEntries(imported.entries, imported.account);
        cloudSync.setAniListWritebackToken(token);
        await completeOAuthBridge(bridgeRes?.bridge);
        oauthHandlers.forEach((cb) =>
          cb({ provider: 'anilist', count: imported.entries.length })
        );
      } catch (err) {
        oauthHandlers.forEach((cb) =>
          cb({
            provider: 'anilist',
            count: 0,
            error: err instanceof Error ? err.message : 'AniList OAuth failed',
          })
        );
      }
    }
    return;
  }

  // 2. MAL PKCE Authorization Code or AniList Code return (?code=...&state=mal:... | anilist:...)
  const code = search.get('code');
  const state = search.get('state') ?? '';
  if (!code) return;
  const redirectUri = getOAuthRedirectUri();

  if (state.startsWith('mal:')) {
    const pkce = readAndClearMalPkceSession();
    search.delete('code');
    search.delete('state');
    const cleanSearch = search.toString() ? `?${search.toString()}` : '';
    window.history.replaceState({}, '', `${window.location.pathname}${cleanSearch}`);
    if (!pkce || pkce.state !== state) return;
    try {
      const tokens = await exchangeMalOAuthEdge({
        grantType: 'authorization_code',
        code,
        codeVerifier: pkce.verifier,
        redirectUri,
        clientId: pkce.clientId,
      });
      cloudSync.setMalOAuthTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
      const [res] = await Promise.all([
        importFromMalOAuth(tokens.access_token),
        completeOAuthBridge(tokens.bridge),
      ]);
      oauthHandlers.forEach((cb) => cb({ provider: 'mal', count: res.count }));
    } catch (err) {
      oauthHandlers.forEach((cb) =>
        cb({
          provider: 'mal',
          count: 0,
          error: err instanceof Error ? err.message : 'MyAnimeList OAuth failed',
        })
      );
    }
  } else if (state.startsWith('anilist:')) {
    search.delete('code');
    search.delete('state');
    const cleanSearch = search.toString() ? `?${search.toString()}` : '';
    window.history.replaceState({}, '', `${window.location.pathname}${cleanSearch}`);
    try {
      const tokens = await exchangeAniListOAuthEdge({
        code,
        redirectUri,
      });
      const imported = await importAniListWithToken(tokens.access_token);
      animeStore.rememberImported(imported.entries.map((e) => e.anime));
      library.importEntries(imported.entries, imported.account);
      cloudSync.setAniListWritebackToken(tokens.access_token);
      await completeOAuthBridge(tokens.bridge);
      oauthHandlers.forEach((cb) => cb({ provider: 'anilist', count: imported.entries.length }));
    } catch (err) {
      oauthHandlers.forEach((cb) =>
        cb({
          provider: 'anilist',
          count: 0,
          error: err instanceof Error ? err.message : 'AniList OAuth failed',
        })
      );
    }
  }
}

function handleLibraryChange() {
  if (applyingRemote) {
    prevEntriesSnapshot = { ...library.getSnapshot().entries };
    return;
  }

  const current = library.getSnapshot().entries;

  // Detect deletions -> queue DB deletion + push 2-way Delete to AniList & MAL OAuth!
  for (const [prevId, prevEntry] of Object.entries(prevEntriesSnapshot)) {
    if (!current[prevId]) {
      if (!meta.deletedEntryIds.includes(prevId)) {
        meta.deletedEntryIds = [...meta.deletedEntryIds, prevId].slice(-200);
      }
      const snap = animeStore.get(prevId);
      const rawAniId =
        snap?.anilistId ?? (prevId.startsWith('anilist') ? Number(prevId.split(':')[1]) : 0);
      const rawMalId =
        snap?.malId ?? (prevId.startsWith('mal') ? Number(prevId.split(':')[1]) : 0);
      const mType: 'ANIME' | 'MANGA' =
        prevEntry.mediaType === 'MANGA' || prevId.includes('manga') ? 'MANGA' : 'ANIME';

      if (meta.anilistWritebackToken && rawAniId > 0) {
        void writeBackAniListEdge({
          token: meta.anilistWritebackToken,
          mediaId: rawAniId,
          action: 'delete',
        });
      }
      if (meta.malAccessToken && rawMalId > 0) {
        void ensureFreshMalToken().then((tk) => {
          if (tk) {
            void writeBackMalEdge({
              token: tk,
              malId: rawMalId,
              mediaType: mType,
              action: 'delete',
            });
          }
        });
      }
    }
  }

  // Detect additions/edits -> bidirectional write-back + social activity stream
  for (const [id, nextEntry] of Object.entries(current)) {
    const prev = prevEntriesSnapshot[id];
    const changed =
      !prev ||
      prev.status !== nextEntry.status ||
      prev.progress !== nextEntry.progress ||
      prev.progressVolumes !== nextEntry.progressVolumes ||
      prev.score !== nextEntry.score ||
      prev.repeat !== nextEntry.repeat ||
      prev.startedAt !== nextEntry.startedAt ||
      prev.completedAt !== nextEntry.completedAt ||
      prev.notes !== nextEntry.notes ||
      prev.isPrivate !== nextEntry.isPrivate ||
      prev.priority !== nextEntry.priority ||
      (prev.customLists ?? []).join('|') !== (nextEntry.customLists ?? []).join('|');

    if (!changed) continue;
    meta.deletedEntryIds = meta.deletedEntryIds.filter((d) => d !== id);

    const snap = animeStore.get(id);
    const mType: 'ANIME' | 'MANGA' =
      nextEntry.mediaType === 'MANGA' || id.includes('manga') ? 'MANGA' : 'ANIME';
    const rawAnilistId =
      snap?.anilistId ?? (id.startsWith('anilist') ? Number(id.split(':')[1]) : 0);
    const rawMalId = snap?.malId ?? (id.startsWith('mal') ? Number(id.split(':')[1]) : 0);

    if (meta.anilistWritebackToken && rawAnilistId > 0) {
      void writeBackAniListEdge({
        token: meta.anilistWritebackToken,
        mediaId: rawAnilistId,
        action: 'save',
        status: nextEntry.status,
        score: nextEntry.score,
        progress: nextEntry.progress,
        progressVolumes: nextEntry.progressVolumes,
        repeat: nextEntry.repeat,
        startedAt: nextEntry.startedAt,
        completedAt: nextEntry.completedAt,
        notes: nextEntry.notes,
        isPrivate: nextEntry.isPrivate,
        customLists: nextEntry.customLists,
        priority: nextEntry.priority,
      });
    }

    if (meta.malAccessToken && rawMalId > 0) {
      void ensureFreshMalToken().then((tk) => {
        if (tk) {
          void writeBackMalEdge({
            token: tk,
            malId: rawMalId,
            mediaType: mType,
            action: 'save',
            status: nextEntry.status,
            score: nextEntry.score,
            progress: nextEntry.progress,
            progressVolumes: nextEntry.progressVolumes,
            repeat: nextEntry.repeat,
            startedAt: nextEntry.startedAt,
            completedAt: nextEntry.completedAt,
            notes: nextEntry.notes,
          });
        }
      });
    }

    // Publish public social activity item when Google-authenticated & entry isn't private
    if (userId && !nextEntry.isPrivate && snap) {
      const profile = profileStore.getSnapshot();
      const unitLabel = mType === 'MANGA' ? 'ch' : 'ep';
      if (!prev || prev.status !== nextEntry.status) {
        const label =
          nextEntry.status === 'completed'
            ? 'Completed'
            : nextEntry.status === 'watching'
            ? mType === 'MANGA'
              ? 'Started reading'
              : 'Started watching'
            : nextEntry.status === 'planned'
            ? 'Added to Plan list'
            : nextEntry.status === 'on_hold'
            ? 'Put on hold'
            : 'Dropped';
        void publishActivity({
          userId,
          profile,
          kind: 'status',
          anime: snap,
          progress: nextEntry.progress,
          score: nextEntry.score,
          statusText: `${label} ${snap.title}`,
        });
      } else if (nextEntry.score && prev?.score !== nextEntry.score) {
        void publishActivity({
          userId,
          profile,
          kind: 'score',
          anime: snap,
          score: nextEntry.score,
          statusText: `Rated ${snap.title} ${nextEntry.score}/10`,
        });
      } else if (
        nextEntry.progress &&
        prev?.progress !== nextEntry.progress &&
        (nextEntry.progress % 5 === 0 || nextEntry.progress === 1)
      ) {
        void publishActivity({
          userId,
          profile,
          kind: 'progress',
          anime: snap,
          progress: nextEntry.progress,
          statusText: `Read/Watched ${unitLabel} ${nextEntry.progress} of ${snap.title}`,
        });
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
  if (!userId) return;
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

    window.addEventListener('online', () => {
      syncState = userId ? 'syncing' : 'idle';
      emit();
      if (userId) void cloudSync.syncNow();
    });
    window.addEventListener('offline', () => {
      syncState = 'offline';
      emit();
    });

    void checkGoogleProviderEnabled().then((enabled) => {
      googleEnabled = enabled;
      emit();
    });

    void processOAuthReturnUrl();

    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user;
      if (sessionUser) {
        userId = sessionUser.id;
        userEmail = sessionUser.email ?? null;
        emit();
        void seedProfileFromGoogleSession(sessionUser.id).then(() => cloudSync.syncNow());
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      userId = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      emit();
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        void seedProfileFromGoogleSession(session.user.id).then(() => cloudSync.syncNow());
      }
    });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  onOAuthCompleted(listener: (info: { provider: 'anilist' | 'mal'; count: number; error?: string }) => void): () => void {
    oauthHandlers.add(listener);
    return () => oauthHandlers.delete(listener);
  },

  getSnapshot,

  async syncNow(): Promise<void> {
    if (!userId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      syncState = 'offline';
      emit();
      return;
    }

    syncState = 'syncing';
    lastError = null;
    emit();

    try {
      await pullAuthAccount(userId);
      await pushAuthAccount(userId);
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

  async signInWithAniList(customClientId?: string): Promise<void> {
    const status = await fetchOAuthServerStatus();
    const clientId = customClientId?.trim() || status.anilistClientId || '57274';
    const useImplicit = !status.anilistCodeFlowReady;
    const url = buildAniListAuthorizeUrl({
      clientId,
      redirectUri: getOAuthRedirectUri(),
      useImplicit,
      state: `anilist:${crypto.randomUUID().slice(0, 12)}`,
    });
    window.location.href = url;
  },

  async signInWithMal(customClientId?: string): Promise<void> {
    const status = await fetchOAuthServerStatus();
    const clientId = customClientId?.trim() || status.malClientId || 'f74fba547b6b04cdb063b1ef1bfc76a3';
    const verifier = generatePkceVerifier(64);
    const state = `mal:${crypto.randomUUID().slice(0, 12)}`;
    storeMalPkceSession(verifier, state, clientId);
    const url = buildMalAuthorizeUrl({
      clientId,
      redirectUri: getOAuthRedirectUri(),
      codeChallenge: verifier,
      state,
    });
    window.location.href = url;
  },

  async bridgeAniListToken(token: string): Promise<void> {
    const res = await createAniListBridgeSessionEdge(token);
    await completeOAuthBridge(res?.bridge);
  },

  async signInWithGoogle(): Promise<void> {
    syncState = 'syncing';
    lastError = null;
    emit();

    const enabled = await checkGoogleProviderEnabled();
    googleEnabled = enabled;
    if (!enabled) {
      syncState = 'error';
      lastError =
        'Google Sign-In is disabled in Supabase Auth Dashboard → Authentication → Providers → Google.';
      emit();
      throw new Error(lastError);
    }

    meta.signedOutManually = false;
    saveMeta();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAppBaseUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      syncState = 'error';
      lastError = error.message;
      emit();
      throw new Error(error.message);
    }
  },

  async signOut(): Promise<void> {
    meta.signedOutManually = true;
    saveMeta();
    await supabase.auth.signOut();
    userId = null;
    userEmail = null;
    syncState = 'idle';
    lastError = null;
    emit();
  },

  async uploadAvatar(file: File): Promise<string> {
    if (!userId) {
      throw new Error('Sign in with AniList or MyAnimeList first to store custom avatars');
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

  setMalOAuthTokens(tokens: { accessToken: string; refreshToken?: string; expiresIn?: number }) {
    meta.malAccessToken = tokens.accessToken.trim();
    meta.malRefreshToken = tokens.refreshToken?.trim() ?? meta.malRefreshToken;
    meta.malTokenExpiresAt = tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : 0;
    saveMeta();
    emit();
    if (userId) scheduleDebouncedSync();
  },

  clearMalOAuthTokens() {
    meta.malAccessToken = '';
    meta.malRefreshToken = '';
    meta.malTokenExpiresAt = 0;
    saveMeta();
    emit();
    if (userId) scheduleDebouncedSync();
  },

  async refreshMalTokenAndImport(): Promise<number> {
    const tk = await ensureFreshMalToken();
    if (!tk) throw new Error('Connect MyAnimeList via OAuth first');
    const res = await importFromMalOAuth(tk);
    return res.count;
  },

  async loadCommentsForMedia(animeId: string): Promise<MergedComment[]> {
    const localList: MergedComment[] = commentsStore.getForAnime(animeId).map((c) => ({ ...c }));
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, anime_id, episode_number, parent_id, user_id, author_name, author_handle, author_avatar, body, likes, created_at, comment_likes(user_id)'
        )
        .eq('anime_id', animeId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !data) return localList;

      const byId = new Map<string, MergedComment>();
      for (const row of data as any[]) {
        const likers = Array.isArray(row.comment_likes) ? row.comment_likes : [];
        const likedByMe = Boolean(userId && likers.some((l: any) => l.user_id === userId));
        byId.set(row.id, {
          id: row.id,
          animeId: row.anime_id,
          episodeNumber: row.episode_number ?? null,
          parentId: row.parent_id ?? null,
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

  async postComment(
    animeId: string,
    text: string,
    profile: UserProfile,
    options?: { episodeNumber?: number | null; parentId?: string | null }
  ): Promise<MergedComment | undefined> {
    const item = commentsStore.addComment(animeId, text, profile, options);
    if (!item) return undefined;

    if (userId) {
      try {
        await supabase.from('comments').insert({
          id: item.id,
          anime_id: animeId,
          episode_number: options?.episodeNumber ?? null,
          parent_id: options?.parentId ?? null,
          user_id: userId,
          author_name: profile.name,
          author_handle: profile.handle,
          author_avatar: profile.avatarUrl,
          body: item.text,
          likes: 0,
        });
        return { ...item, isCloud: true, ownerUserId: userId };
      } catch {
        /* local backup remains */
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

cloudSync.init();

export function useCloudSync(): CloudStatus {
  return useSyncExternalStore(cloudSync.subscribe, cloudSync.getSnapshot, cloudSync.getSnapshot);
}
