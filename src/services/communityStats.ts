import { Anime, LibraryState, MediaType } from '../types';
import { animeStore } from './animeStore';
import { library } from './library';
import { EDGE_API_BASE, supabase } from './supabase';

export interface ListTubeMediaStats {
  animeId: string;
  members: number;
  watching: number;
  completed: number;
  planned: number;
  meanScore: number | null;
  ratedCount: number;
}

export interface ListTubeRankedItem {
  anime: Anime;
  members: number;
  meanScore: number | null;
}

export interface EpisodeReactionItem {
  id: string;
  animeId: string;
  episode: number;
  userId?: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  rating?: number;
  body: string;
  isSpoiler: boolean;
  createdAt: number;
  isOwn?: boolean;
}

export interface UserApiKeySummary {
  id: string;
  label: string;
  token_prefix: string;
  last_used_at?: string | null;
  created_at: string;
}

const EP_REACTIONS_LOCAL_KEY = 'listtube.episodeReactions.v1';

function readLocalReactions(): EpisodeReactionItem[] {
  try {
    const raw = localStorage.getItem(EP_REACTIONS_LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as EpisodeReactionItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalReactions(items: EpisodeReactionItem[]): void {
  try {
    localStorage.setItem(EP_REACTIONS_LOCAL_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    /* ignore */
  }
}

/**
 * Fetches live ListTube community member counts & mean user ratings from Postgres `library_entries`
 * (or the Edge `/stats` gateway) and merges the user's current unsynced local state.
 */
export async function fetchListTubeMediaStats(
  animeId: string,
  localState?: LibraryState
): Promise<ListTubeMediaStats> {
  let base: ListTubeMediaStats = {
    animeId,
    members: 0,
    watching: 0,
    completed: 0,
    planned: 0,
    meanScore: null,
    ratedCount: 0,
  };

  try {
    const { data, error } = await supabase
      .from('library_entries')
      .select('status, score, score_decimal')
      .eq('anime_id', animeId)
      .eq('is_private', false)
      .limit(1500);

    if (!error && Array.isArray(data)) {
      let scoreSum = 0;
      let scoreCount = 0;
      for (const r of data as { status: string; score?: number; score_decimal?: number }[]) {
        base.members += 1;
        if (r.status === 'watching') base.watching += 1;
        else if (r.status === 'completed') base.completed += 1;
        else if (r.status === 'planned') base.planned += 1;
        const sc = Number(r.score_decimal ?? r.score ?? 0);
        if (sc > 0) {
          scoreSum += sc;
          scoreCount += 1;
        }
      }
      base.ratedCount = scoreCount;
      base.meanScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null;
    }
  } catch {
    /* fallback below */
  }

  // Blend signed-out local tracking so solo/offline tracking reflects immediately
  const localEntry = (localState ?? library.getSnapshot()).entries[animeId];
  if (localEntry && base.members === 0) {
    base.members = 1;
    if (localEntry.status === 'watching') base.watching = 1;
    else if (localEntry.status === 'completed') base.completed = 1;
    else if (localEntry.status === 'planned') base.planned = 1;
    if (localEntry.score && localEntry.score > 0) {
      base.meanScore = Math.round(localEntry.score * 10) / 10;
      base.ratedCount = 1;
    }
  }

  return base;
}

/**
 * Computes live ListTube Community Top Rankings from `library_entries` + cached catalog.
 */
export async function fetchListTubeTopRanked(
  mediaType: MediaType,
  limit = 24
): Promise<ListTubeRankedItem[]> {
  const agg = new Map<
    string,
    { animeId: string; members: number; scoreSum: number; scoreCount: number; snapshot?: Partial<Anime> }
  >();

  try {
    const { data } = await supabase
      .from('library_entries')
      .select('anime_id, score, score_decimal, media_snapshot')
      .eq('media_type', mediaType)
      .eq('is_private', false)
      .limit(2500);

    for (const r of (data ?? []) as {
      anime_id: string;
      score?: number;
      score_decimal?: number;
      media_snapshot?: Partial<Anime>;
    }[]) {
      const cur = agg.get(r.anime_id) ?? {
        animeId: r.anime_id,
        members: 0,
        scoreSum: 0,
        scoreCount: 0,
        snapshot: r.media_snapshot,
      };
      cur.members += 1;
      if (!cur.snapshot && r.media_snapshot) cur.snapshot = r.media_snapshot;
      const sc = Number(r.score_decimal ?? r.score ?? 0);
      if (sc > 0) {
        cur.scoreSum += sc;
        cur.scoreCount += 1;
      }
      agg.set(r.anime_id, cur);
    }
  } catch {
    /* fallback cleanly */
  }

  // Merge local library entries so signed-out users also see rankings
  const localEntries = Object.values(library.getSnapshot().entries);
  for (const e of localEntries) {
    const cached = animeStore.get(e.animeId);
    const mt = cached?.mediaType ?? e.mediaType ?? 'ANIME';
    if (mt !== mediaType) continue;
    if (!agg.has(e.animeId)) {
      agg.set(e.animeId, {
        animeId: e.animeId,
        members: 1,
        scoreSum: e.score && e.score > 0 ? e.score : 0,
        scoreCount: e.score && e.score > 0 ? 1 : 0,
        snapshot: cached,
      });
    }
  }

  const out: ListTubeRankedItem[] = [];
  for (const row of agg.values()) {
    const known = animeStore.get(row.animeId);
    const snap = known ?? (row.snapshot?.title ? (row.snapshot as Anime) : undefined);
    if (!snap) continue;
    if (known === undefined) animeStore.remember(snap);
    const meanScore =
      row.scoreCount > 0 ? Math.round((row.scoreSum / row.scoreCount) * 10) / 10 : snap.score ?? null;
    out.push({ anime: snap, members: row.members, meanScore });
  }

  return out
    .sort((a, b) => b.members - a.members || (b.meanScore ?? 0) - (a.meanScore ?? 0))
    .slice(0, limit);
}

/**
 * Fetches episode-specific quick check-in ratings & reactions.
 */
export async function fetchEpisodeReactions(
  animeId: string,
  episode: number,
  currentUserId?: string | null
): Promise<EpisodeReactionItem[]> {
  const local = readLocalReactions().filter(
    (r) => r.animeId === animeId && r.episode === episode
  );
  try {
    const { data, error } = await supabase
      .from('episode_reactions')
      .select('*')
      .eq('anime_id', animeId)
      .eq('episode', episode)
      .order('created_at', { ascending: false })
      .limit(40);
    if (!error && Array.isArray(data)) {
      const remote: EpisodeReactionItem[] = (data as any[]).map((row) => ({
        id: String(row.id),
        animeId: row.anime_id,
        episode: row.episode,
        userId: row.user_id,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        authorAvatar: row.author_avatar ?? undefined,
        rating: row.rating ?? undefined,
        body: row.body,
        isSpoiler: Boolean(row.is_spoiler),
        createdAt: new Date(row.created_at).getTime(),
        isOwn: Boolean(currentUserId && row.user_id === currentUserId),
      }));
      const seen = new Set(remote.map((r) => r.id));
      return [...remote, ...local.filter((l) => !seen.has(l.id))].sort(
        (a, b) => b.createdAt - a.createdAt
      );
    }
  } catch {
    /* table may not be pushed yet — local cache works seamlessly */
  }
  return local.sort((a, b) => b.createdAt - a.createdAt);
}

export async function postEpisodeReaction(params: {
  userId?: string | null;
  animeId: string;
  episode: number;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  rating?: number;
  body: string;
  isSpoiler: boolean;
}): Promise<EpisodeReactionItem> {
  const cleanBody = params.body.trim().slice(0, 280);
  if (!cleanBody && !params.rating) {
    throw new Error('Add a quick star rating or reaction first');
  }
  const body = cleanBody || `Rated Episode ${params.episode} (${params.rating}/5★)`;

  if (params.userId) {
    try {
      const { data, error } = await supabase
        .from('episode_reactions')
        .upsert(
          {
            user_id: params.userId,
            anime_id: params.animeId,
            episode: params.episode,
            author_name: params.authorName,
            author_handle: params.authorHandle,
            author_avatar: params.authorAvatar ?? null,
            rating: params.rating ?? null,
            body,
            is_spoiler: params.isSpoiler,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,anime_id,episode' }
        )
        .select('*')
        .single();
      if (!error && data) {
        return {
          id: String(data.id),
          animeId: data.anime_id,
          episode: data.episode,
          userId: data.user_id,
          authorName: data.author_name,
          authorHandle: data.author_handle,
          authorAvatar: data.author_avatar ?? undefined,
          rating: data.rating ?? undefined,
          body: data.body,
          isSpoiler: Boolean(data.is_spoiler),
          createdAt: new Date(data.created_at).getTime(),
          isOwn: true,
        };
      }
    } catch {
      /* fallback to local storage */
    }
  }

  const localItem: EpisodeReactionItem = {
    id: `local:${params.animeId}:${params.episode}:${Date.now()}`,
    animeId: params.animeId,
    episode: params.episode,
    authorName: params.authorName,
    authorHandle: params.authorHandle,
    authorAvatar: params.authorAvatar,
    rating: params.rating,
    body,
    isSpoiler: params.isSpoiler,
    createdAt: Date.now(),
    isOwn: true,
  };
  const existing = readLocalReactions().filter(
    (x) => !(x.animeId === params.animeId && x.episode === params.episode && x.isOwn)
  );
  saveLocalReactions([localItem, ...existing]);
  return localItem;
}

/**
 * Manage scoped `lt_...` Tracker API Keys via Edge `/v1/keys`.
 */
async function callApiKeysEdge(body: Record<string, unknown>): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in with Google, AniList, or MAL first');
  const res = await fetch(`${EDGE_API_BASE}/v1/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API Keys request failed (${res.status})`);
  return json;
}

export async function listUserApiKeys(): Promise<UserApiKeySummary[]> {
  const res = await callApiKeysEdge({ action: 'list' });
  return Array.isArray(res.keys) ? res.keys : [];
}

export async function createUserApiKey(
  label = 'Browser Auto-Tracker Companion'
): Promise<{ token: string; key: UserApiKeySummary }> {
  return await callApiKeysEdge({ action: 'create', label });
}

export async function revokeUserApiKey(id: string): Promise<void> {
  await callApiKeysEdge({ action: 'revoke', id });
}
