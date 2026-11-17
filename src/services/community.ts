import {
  ActivityItem,
  ActivityKind,
  ActivityReply,
  Anime,
  EpisodePollSummary,
  FavoriteCharacterItem,
  ListEntry,
  MediaType,
  PublicUserSummary,
  ReviewVerdict,
  SocialNotificationItem,
  UserReview,
} from '../types';
import { fetchPublicAniListActivities, fetchPublicAniListReviews } from './anilist';
import { animeStore } from './animeStore';
import { UserProfile } from './profile';
import { supabase } from './supabase';

// ============================================================================
// 1. User-Written Public Reviews (+ Public AniList Reviews Backfill)
// ============================================================================

export async function fetchMediaReviews(
  animeId: string,
  currentUserId: string | null,
  options?: { anilistId?: number; mediaType?: MediaType }
): Promise<UserReview[]> {
  try {
    const [dbRes, alReviews] = await Promise.all([
      supabase
        .from('reviews')
        .select('*, review_votes(user_id)')
        .eq('anime_id', animeId)
        .order('created_at', { ascending: false })
        .limit(40),
      options?.anilistId
        ? fetchPublicAniListReviews(options.anilistId, options.mediaType ?? 'ANIME')
        : Promise.resolve([] as UserReview[]),
    ]);

    const localReviews: UserReview[] =
      !dbRes.error && dbRes.data
        ? (dbRes.data as any[]).map<UserReview>((row) => {
            const votes = Array.isArray(row.review_votes) ? row.review_votes : [];
            return {
              id: row.id,
              animeId: row.anime_id,
              mediaType: row.media_type === 'MANGA' ? 'MANGA' : 'ANIME',
              userId: row.user_id,
              authorName: row.author_name,
              authorHandle: row.author_handle,
              authorAvatar: row.author_avatar,
              headline: row.headline ?? undefined,
              body: row.body,
              overallScore: row.overall_score !== null ? Number(row.overall_score) : undefined,
              storyScore: row.story_score ?? undefined,
              artScore: row.art_score ?? undefined,
              soundScore: row.sound_score ?? undefined,
              enjoymentScore: row.enjoyment_score ?? undefined,
              verdict: (row.verdict as ReviewVerdict) ?? 'Recommended',
              isSpoiler: Boolean(row.is_spoiler),
              helpfulCount: votes.length,
              votedByMe: Boolean(currentUserId && votes.some((v: any) => v.user_id === currentUserId)),
              source: 'listtube',
              createdAt: new Date(row.created_at).getTime(),
              updatedAt: new Date(row.updated_at).getTime(),
            };
          })
        : [];

    localReviews.sort((a, b) => b.helpfulCount - a.helpfulCount || b.createdAt - a.createdAt);
    return [...localReviews, ...alReviews];
  } catch {
    return [];
  }
}

export async function upsertMediaReview(params: {
  userId: string;
  anime: Anime;
  profile: UserProfile;
  headline?: string;
  body: string;
  overallScore?: number;
  storyScore?: number;
  artScore?: number;
  soundScore?: number;
  enjoymentScore?: number;
  verdict: ReviewVerdict;
  isSpoiler: boolean;
}): Promise<UserReview> {
  const row = {
    user_id: params.userId,
    anime_id: params.anime.id,
    media_type: params.anime.mediaType ?? 'ANIME',
    author_name: params.profile.name,
    author_handle: params.profile.handle,
    author_avatar: params.profile.avatarUrl,
    headline: params.headline?.trim() || null,
    body: params.body.trim(),
    overall_score: typeof params.overallScore === 'number' ? params.overallScore : null,
    story_score: typeof params.storyScore === 'number' ? params.storyScore : null,
    art_score: typeof params.artScore === 'number' ? params.artScore : null,
    sound_score: typeof params.soundScore === 'number' ? params.soundScore : null,
    enjoyment_score: typeof params.enjoymentScore === 'number' ? params.enjoymentScore : null,
    verdict: params.verdict,
    is_spoiler: params.isSpoiler,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('reviews')
    .upsert(row, { onConflict: 'user_id,anime_id' })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Failed to save review');

  return {
    id: data.id,
    animeId: data.anime_id,
    mediaType: data.media_type === 'MANGA' ? 'MANGA' : 'ANIME',
    userId: data.user_id,
    authorName: data.author_name,
    authorHandle: data.author_handle,
    authorAvatar: data.author_avatar,
    headline: data.headline ?? undefined,
    body: data.body,
    overallScore: data.overall_score !== null ? Number(data.overall_score) : undefined,
    storyScore: data.story_score ?? undefined,
    artScore: data.art_score ?? undefined,
    soundScore: data.sound_score ?? undefined,
    enjoymentScore: data.enjoyment_score ?? undefined,
    verdict: (data.verdict as ReviewVerdict) ?? 'Recommended',
    isSpoiler: Boolean(data.is_spoiler),
    helpfulCount: 0,
    votedByMe: false,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime(),
  };
}

export async function deleteMediaReview(reviewId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function toggleReviewVote(
  reviewId: string,
  userId: string,
  currentlyVoted: boolean
): Promise<void> {
  if (currentlyVoted) {
    await supabase
      .from('review_votes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('review_votes')
      .upsert({ review_id: reviewId, user_id: userId }, { onConflict: 'review_id,user_id' });
  }
}

// ============================================================================
// 2. Social Activity Feed (AniList-style stream)
// ============================================================================

export async function fetchActivityFeed(
  mode: 'global' | 'following',
  followingIds: string[],
  currentUserId: string | null,
  limit = 40,
  blockedUserIds: string[] = []
): Promise<ActivityItem[]> {
  try {
    const blockedSet = new Set(blockedUserIds);
    let query = supabase
      .from('activities')
      .select('*, activity_likes(user_id), activity_replies(*)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (mode === 'following') {
      const targetIds = currentUserId
        ? Array.from(new Set([...followingIds, currentUserId]))
        : followingIds;
      if (targetIds.length === 0) return [];
      query = query.in('user_id', targetIds);
    }

    const { data, error } = await query;
    const dbItems: ActivityItem[] =
      !error && data
        ? (data as any[])
            .filter((row) => !blockedSet.has(row.user_id))
            .map<ActivityItem>((row) => {
              const likes = Array.isArray(row.activity_likes) ? row.activity_likes : [];
              const replies = Array.isArray(row.activity_replies)
                ? (row.activity_replies as any[])
                    .filter((r) => !blockedSet.has(r.user_id))
                    .map<ActivityReply>((r) => ({
                      id: r.id,
                      activityId: r.activity_id,
                      userId: r.user_id,
                      authorName: r.author_name,
                      authorHandle: r.author_handle,
                      authorAvatar: r.author_avatar,
                      body: r.body,
                      createdAt: new Date(r.created_at).getTime(),
                    }))
                    .sort((a, b) => a.createdAt - b.createdAt)
                : [];
              return {
                id: row.id,
                userId: row.user_id,
                authorName: row.author_name,
                authorHandle: row.author_handle,
                authorAvatar: row.author_avatar,
                kind: (row.kind as ActivityKind) ?? 'post',
                animeId: row.anime_id ?? undefined,
                animeTitle: row.anime_title ?? undefined,
                animeCover: row.anime_cover ?? undefined,
                mediaType:
                  row.media_type === 'MANGA' ? 'MANGA' : row.media_type === 'ANIME' ? 'ANIME' : undefined,
                statusText: row.status_text,
                progress: row.progress ?? undefined,
                score: row.score !== null && row.score !== undefined ? Number(row.score) : undefined,
                likeCount: likes.length,
                likedByMe: Boolean(currentUserId && likes.some((l: any) => l.user_id === currentUserId)),
                replies,
                source: 'listtube',
                createdAt: new Date(row.created_at).getTime(),
              };
            })
        : [];

    if (mode === 'global' && dbItems.length < 12) {
      const publicAl = await fetchPublicAniListActivities(18);
      return [...dbItems, ...publicAl].slice(0, limit);
    }
    return dbItems;
  } catch {
    if (mode === 'global') {
      return await fetchPublicAniListActivities(18);
    }
    return [];
  }
}

export async function publishActivity(params: {
  userId: string;
  profile: UserProfile;
  kind: ActivityKind;
  statusText: string;
  anime?: Anime;
  progress?: number;
  score?: number;
}): Promise<ActivityItem | null> {
  try {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        user_id: params.userId,
        author_name: params.profile.name,
        author_handle: params.profile.handle,
        author_avatar: params.profile.avatarUrl,
        kind: params.kind,
        anime_id: params.anime?.id ?? null,
        anime_title: params.anime?.title ?? null,
        anime_cover: params.anime?.cover ?? null,
        media_type: params.anime?.mediaType ?? null,
        status_text: params.statusText.trim().slice(0, 2000),
        progress: typeof params.progress === 'number' ? params.progress : null,
        score: typeof params.score === 'number' ? params.score : null,
      })
      .select('*')
      .single();
    if (error || !data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      authorName: data.author_name,
      authorHandle: data.author_handle,
      authorAvatar: data.author_avatar,
      kind: data.kind as ActivityKind,
      animeId: data.anime_id ?? undefined,
      animeTitle: data.anime_title ?? undefined,
      animeCover: data.anime_cover ?? undefined,
      mediaType: data.media_type ?? undefined,
      statusText: data.status_text,
      progress: data.progress ?? undefined,
      score: data.score !== null ? Number(data.score) : undefined,
      likeCount: 0,
      likedByMe: false,
      replies: [],
      createdAt: new Date(data.created_at).getTime(),
    };
  } catch {
    return null;
  }
}

export async function toggleActivityLike(
  activityId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<void> {
  if (currentlyLiked) {
    await supabase
      .from('activity_likes')
      .delete()
      .eq('activity_id', activityId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('activity_likes')
      .upsert({ activity_id: activityId, user_id: userId }, { onConflict: 'activity_id,user_id' });
  }
}

export async function postActivityReply(params: {
  activityId: string;
  userId: string;
  profile: UserProfile;
  body: string;
}): Promise<ActivityReply> {
  const { data, error } = await supabase
    .from('activity_replies')
    .insert({
      activity_id: params.activityId,
      user_id: params.userId,
      author_name: params.profile.name,
      author_handle: params.profile.handle,
      author_avatar: params.profile.avatarUrl,
      body: params.body.trim().slice(0, 2000),
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Failed to reply');
  return {
    id: data.id,
    activityId: data.activity_id,
    userId: data.user_id,
    authorName: data.author_name,
    authorHandle: data.author_handle,
    authorAvatar: data.author_avatar,
    body: data.body,
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function deleteActivity(activityId: string, userId: string): Promise<void> {
  await supabase.from('activities').delete().eq('id', activityId).eq('user_id', userId);
}

// ============================================================================
// 3. Public User Profiles, Directory Search, Following & Lists
// ============================================================================

function mapProfileRow(row: any): PublicUserSummary {
  return {
    id: row.id,
    displayName: row.display_name || 'ListTube Viewer',
    handle: row.handle || '@listtube_fan',
    avatarUrl: row.avatar_url || '',
    bannerUrl: row.banner_url ?? undefined,
    bio: row.bio ?? undefined,
    location: row.location ?? undefined,
    favoriteAnimeIds: Array.isArray(row.favorite_anime_ids) ? row.favorite_anime_ids : [],
    favoriteMangaIds: Array.isArray(row.favorite_manga_ids) ? row.favorite_manga_ids : [],
    favoriteCharactersData: Array.isArray(row.favorite_characters_data)
      ? (row.favorite_characters_data as FavoriteCharacterItem[])
      : [],
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export async function fetchPublicUsers(query = '', limit = 30): Promise<PublicUserSummary[]> {
  try {
    let req = supabase
      .from('profiles')
      .select(
        'id, display_name, handle, avatar_url, banner_url, bio, location, favorite_anime_ids, favorite_manga_ids, favorite_characters_data, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(limit);

    const clean = query.trim();
    if (clean) {
      const safe = clean.replace(/[%_]/g, '');
      req = req.or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%`);
    }

    const { data, error } = await req;
    if (error || !data) return [];
    return (data as any[]).map(mapProfileRow);
  } catch {
    return [];
  }
}

export async function fetchPublicUserProfile(userIdOrHandle: string): Promise<PublicUserSummary | null> {
  try {
    const clean = decodeURIComponent(userIdOrHandle).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    const req = supabase
      .from('profiles')
      .select(
        'id, display_name, handle, avatar_url, banner_url, bio, location, favorite_anime_ids, favorite_manga_ids, favorite_characters_data, updated_at'
      );

    const { data, error } = await (isUuid
      ? req.eq('id', clean).maybeSingle()
      : req.ilike('handle', clean.startsWith('@') ? clean : `@${clean}`).maybeSingle());
    if (error || !data) return null;
    return mapProfileRow(data);
  } catch {
    return null;
  }
}

export async function fetchPublicUserLibrary(userId: string): Promise<ListEntry[]> {
  try {
    const { data, error } = await supabase
      .from('library_entries')
      .select(
        'anime_id, media_type, status, score, score_decimal, progress, progress_volumes, rewatch_count, started_at, completed_at, notes, is_private, custom_lists, media_snapshot, added_at, updated_at'
      )
      .eq('user_id', userId)
      .eq('is_private', false)
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (error || !data) return [];

    const snaps: Anime[] = [];
    const entries: ListEntry[] = [];
    for (const row of data as any[]) {
      if (row.media_snapshot && typeof row.media_snapshot === 'object' && 'id' in row.media_snapshot) {
        snaps.push(row.media_snapshot as Anime);
      }
      const decScore =
        row.score_decimal !== null && row.score_decimal !== undefined
          ? Number(row.score_decimal)
          : row.score ?? undefined;
      entries.push({
        animeId: row.anime_id,
        mediaType: (row.media_type === 'MANGA' ? 'MANGA' : 'ANIME') as MediaType,
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
        addedAt: Number(row.added_at),
        updatedAt: Number(row.updated_at),
      });
    }
    if (snaps.length > 0) animeStore.rememberMany(snaps);
    return entries;
  } catch {
    return [];
  }
}

export async function fetchFollowingIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);
    if (error || !data) return [];
    return (data as any[]).map((r) => r.following_id);
  } catch {
    return [];
  }
}

export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  try {
    const [fRes, gRes] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
    ]);
    return { followers: fRes.count ?? 0, following: gRes.count ?? 0 };
  } catch {
    return { followers: 0, following: 0 };
  }
}

export async function toggleFollowUser(
  followerId: string,
  targetUserId: string,
  currentlyFollowing: boolean
): Promise<boolean> {
  if (currentlyFollowing) {
    await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', targetUserId);
    return false;
  }
  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: followerId, following_id: targetUserId }, { onConflict: 'follower_id,following_id' });
  if (error) throw new Error(error.message);
  return true;
}

// ============================================================================
// 4. Episode Rating Polls, Moderation (Report/Block) & Social Notifications
// ============================================================================

export async function fetchEpisodePoll(
  mediaId: string,
  episodeNumber: number,
  currentUserId: string | null
): Promise<EpisodePollSummary> {
  const empty: EpisodePollSummary = {
    mediaId,
    episodeNumber,
    average: 0,
    totalVotes: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
  try {
    const { data, error } = await supabase
      .from('episode_polls')
      .select('user_id, rating')
      .eq('media_id', mediaId)
      .eq('episode_number', episodeNumber);
    if (error || !data) return empty;
    const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let totalVotes = 0;
    let myRating: 1 | 2 | 3 | 4 | 5 | undefined;
    for (const row of data as { user_id: string; rating: number }[]) {
      const r = Number(row.rating);
      if (r >= 1 && r <= 5) {
        const star = r as 1 | 2 | 3 | 4 | 5;
        dist[star] += 1;
        sum += star;
        totalVotes += 1;
        if (currentUserId && row.user_id === currentUserId) {
          myRating = star;
        }
      }
    }
    return {
      mediaId,
      episodeNumber,
      average: totalVotes > 0 ? Number((sum / totalVotes).toFixed(2)) : 0,
      totalVotes,
      distribution: dist,
      myRating,
    };
  } catch {
    return empty;
  }
}

export async function submitEpisodePoll(
  mediaId: string,
  episodeNumber: number,
  userId: string,
  rating: 1 | 2 | 3 | 4 | 5
): Promise<void> {
  const { error } = await supabase.from('episode_polls').upsert(
    {
      media_id: mediaId,
      episode_number: episodeNumber,
      user_id: userId,
      rating,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'media_id,episode_number,user_id' }
  );
  if (error) throw new Error(error.message);
}

export async function fetchBlockedUserIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_user_id')
      .eq('user_id', userId);
    if (error || !data) return [];
    return (data as { blocked_user_id: string }[]).map((r) => r.blocked_user_id);
  } catch {
    return [];
  }
}

export async function toggleBlockUser(
  userId: string,
  blockedUserId: string,
  currentlyBlocked: boolean
): Promise<boolean> {
  if (currentlyBlocked) {
    await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', userId)
      .eq('blocked_user_id', blockedUserId);
    return false;
  }
  const { error } = await supabase
    .from('blocked_users')
    .upsert({ user_id: userId, blocked_user_id: blockedUserId }, { onConflict: 'user_id,blocked_user_id' });
  if (error) throw new Error(error.message);
  return true;
}

export async function reportContent(params: {
  reporterId: string;
  targetType: 'comment' | 'activity' | 'review' | 'user';
  targetId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: params.reporterId,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason.trim().slice(0, 400) || 'Inappropriate / Spam',
  });
  if (error) throw new Error(error.message);
}

export async function fetchSocialNotifications(userId: string): Promise<SocialNotificationItem[]> {
  try {
    const out: SocialNotificationItem[] = [];
    const { data: myActs } = await supabase
      .from('activities')
      .select('id, status_text')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    const actIds = (myActs ?? []).map((a: any) => a.id);

    const [repliesRes, followersRes] = await Promise.all([
      actIds.length > 0
        ? supabase
            .from('activity_replies')
            .select('id, activity_id, user_id, author_name, author_avatar, body, created_at')
            .in('activity_id', actIds)
            .neq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    for (const r of (repliesRes as any).data ?? []) {
      out.push({
        id: `soc-reply:${r.id}`,
        kind: 'reply',
        title: `${r.author_name} replied to your update`,
        subtitle: String(r.body ?? '').slice(0, 90),
        avatar: r.author_avatar,
        createdAt: new Date(r.created_at).getTime(),
        targetId: r.user_id,
      });
    }

    const followerRows = ((followersRes as any).data ?? []) as { follower_id: string; created_at: string }[];
    if (followerRows.length > 0) {
      const fIds = followerRows.map((f) => f.follower_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, handle, avatar_url')
        .in('id', fIds);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      for (const f of followerRows) {
        const p = profMap.get(f.follower_id);
        out.push({
          id: `soc-follow:${f.follower_id}`,
          kind: 'follow',
          title: `${p?.display_name || 'A member'} started following you`,
          subtitle: p?.handle || 'Tap to view their library & Taste DNA',
          avatar: p?.avatar_url,
          createdAt: new Date(f.created_at).getTime(),
          targetId: f.follower_id,
        });
      }
    }

    return out.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}
