import React, { useEffect, useMemo, useState } from 'react';
import {
  Heart,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { ActivityItem, LibraryState, PublicUserSummary } from '../types';
import {
  deleteActivity,
  fetchActivityFeed,
  fetchFollowingIds,
  fetchPublicUsers,
  postActivityReply,
  publishActivity,
  toggleActivityLike,
  toggleFollowUser,
} from '../services/community';
import { useCloudSync } from '../services/cloudSync';
import { useProfile } from '../services/profile';
import { formatUserScore } from '../services/scoring';
import { useSettings } from '../services/settings';
import { toast } from './Toast';

interface FeedViewProps {
  myLibrary: LibraryState;
  onOpenAnime: (animeId: string) => void;
  onOpenUser: (userIdOrHandle: string) => void;
  onOpenTrackers: () => void;
}

type FeedTab = 'global' | 'following' | 'people';

function timeAgo(ts: number): string {
  const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'Just now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const FeedView: React.FC<FeedViewProps> = ({
  myLibrary,
  onOpenAnime,
  onOpenUser,
  onOpenTrackers,
}) => {
  const cloud = useCloudSync();
  const profile = useProfile();
  const settings = useSettings();

  const [tab, setTab] = useState<FeedTab>('global');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [users, setUsers] = useState<PublicUserSummary[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const fIds = cloud.userId ? await fetchFollowingIds(cloud.userId) : [];
      if (cancelled) return;
      setFollowingIds(fIds);

      if (tab === 'people') {
        const list = await fetchPublicUsers(userSearch, 36);
        if (!cancelled) setUsers(list);
      } else {
        const feed = await fetchActivityFeed(tab, fIds, cloud.userId, 50);
        if (!cancelled) setActivities(feed);
      }
      if (!cancelled) setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, cloud.userId, userSearch]);

  const handlePublishStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloud.userId) {
      toast('Sign in with Google to post to the global feed');
      onOpenTrackers();
      return;
    }
    const clean = postText.trim();
    if (!clean) return;
    setPosting(true);
    try {
      const item = await publishActivity({
        userId: cloud.userId,
        profile,
        kind: 'post',
        statusText: clean,
      });
      if (item) {
        setActivities((prev) => [item, ...prev]);
        setPostText('');
        toast('Status posted to feed');
      }
    } finally {
      setPosting(false);
    }
  };

  const handleLikeActivity = async (act: ActivityItem) => {
    if (!cloud.userId) {
      toast('Sign in with Google to like activity updates');
      return;
    }
    const nextLiked = !act.likedByMe;
    setActivities((prev) =>
      prev.map((a) =>
        a.id === act.id
          ? { ...a, likedByMe: nextLiked, likeCount: Math.max(0, a.likeCount + (nextLiked ? 1 : -1)) }
          : a
      )
    );
    await toggleActivityLike(act.id, cloud.userId, act.likedByMe);
  };

  const handleSendReply = async (activityId: string) => {
    if (!cloud.userId) {
      toast('Sign in with Google to reply');
      return;
    }
    const body = (replyDrafts[activityId] ?? '').trim();
    if (!body) return;
    try {
      const reply = await postActivityReply({
        activityId,
        userId: cloud.userId,
        profile,
        body,
      });
      setActivities((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, replies: [...a.replies, reply] } : a))
      );
      setReplyDrafts((d) => ({ ...d, [activityId]: '' }));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reply');
    }
  };

  const handleFollowToggle = async (targetId: string, name: string) => {
    if (!cloud.userId) {
      toast('Sign in with Google to follow members');
      onOpenTrackers();
      return;
    }
    const currently = followingIds.includes(targetId);
    const next = await toggleFollowUser(cloud.userId, targetId, currently);
    setFollowingIds((prev) =>
      next ? [...new Set([...prev, targetId])] : prev.filter((id) => id !== targetId)
    );
    toast(next ? `Following ${name}` : `Unfollowed ${name}`);
  };

  const followingSet = useMemo(() => new Set(followingIds), [followingIds]);

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-5 bg-[#0F0F0F] px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[21px] font-black tracking-tight text-white">
            <Users className="h-5 w-5 text-[#FF0000]" />
            Community Activity &amp; People
          </h1>
          <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
            Real-time AniList-style watch updates, reviews, followers &amp; taste affinity
          </p>
        </div>

        <div className="flex items-center rounded-full border border-white/[0.1] bg-[#181818] p-1 text-[12px] font-bold">
          {([
            { id: 'global', label: 'Global' },
            { id: 'following', label: 'Following' },
            { id: 'people', label: 'People' },
          ] as { id: FeedTab; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1 transition ${
                tab === t.id ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Composer */}
      {tab !== 'people' && (
        <form
          onSubmit={handlePublishStatus}
          className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4"
        >
          <div className="flex items-start gap-3">
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="h-10 w-10 shrink-0 rounded-full object-cover bg-black"
            />
            <div className="min-w-0 flex-1 space-y-2.5">
              <textarea
                rows={2}
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={
                  cloud.userId
                    ? `Post an anime thought, recommendation, or milestone as ${profile.handle}…`
                    : 'Sign in with Google to post status updates to the live community feed…'
                }
                className="w-full rounded-xl border border-white/10 bg-[#0F0F0F] px-3 py-2 text-[13px] text-white placeholder:text-[#777777] outline-none focus:border-[#3EA6FF]"
              />
              <div className="flex items-center justify-between">
                {!cloud.userId ? (
                  <button
                    type="button"
                    onClick={onOpenTrackers}
                    className="text-[11.5px] font-bold text-[#3EA6FF] hover:underline"
                  >
                    Sign in with Google →
                  </button>
                ) : (
                  <span className="text-[11px] text-[#777777]">
                    Visible to everyone · List updates post automatically
                  </span>
                )}
                <button
                  type="submit"
                  disabled={posting || !postText.trim()}
                  className="flex items-center gap-1.5 rounded-full bg-[#3EA6FF] px-4 py-1.5 text-[12px] font-bold text-black hover:bg-[#65B8FF] disabled:opacity-40"
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Post
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* PEOPLE DIRECTORY */}
      {tab === 'people' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-[#181818] px-3.5 py-2.5">
            <Search className="h-4 w-4 text-[#AAAAAA]" />
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by name or @handle…"
              className="w-full bg-transparent text-[13px] text-white outline-none"
            />
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.06]" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-8 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-[#AAAAAA]/50" />
              <p className="text-[14px] font-bold text-white">No public profiles match yet</p>
              <p className="mt-1 text-[12px] text-[#AAAAAA]">
                Sign in with Google to publish your ListTube profile to the member directory.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {users.map((u) => {
                const isMe = cloud.userId === u.id;
                const isFoll = followingSet.has(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUser(u.id)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <img
                        src={u.avatarUrl}
                        alt={u.displayName}
                        className="h-12 w-12 shrink-0 rounded-full object-cover bg-black"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-white hover:text-[#3EA6FF]">
                          {u.displayName}
                        </p>
                        <p className="truncate text-[11.5px] text-[#AAAAAA]">{u.handle}</p>
                        {u.bio && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">{u.bio}</p>
                        )}
                      </div>
                    </button>

                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => void handleFollowToggle(u.id, u.displayName)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition ${
                          isFoll
                            ? 'bg-[#272727] text-white'
                            : 'bg-[#F1F1F1] text-black hover:bg-white'
                        }`}
                      >
                        {isFoll ? <UserCheck className="h-3.5 w-3.5 text-emerald-400" /> : <UserPlus className="h-3.5 w-3.5" />}
                        <span>{isFoll ? 'Following' : 'Follow'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-10 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[#AAAAAA]/40" />
          <p className="text-[15px] font-bold text-white">
            {tab === 'following' ? 'Your Following feed is quiet' : 'Be the first on the Global Feed'}
          </p>
          <p className="mt-1 text-[12.5px] text-[#AAAAAA]">
            {tab === 'following'
              ? 'Follow other ListTube members in the People tab to see their watch progress and reviews.'
              : 'Sign in with Google and update a series or post a status above to start the stream.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((act) => {
            const expanded = openReplies.has(act.id);
            const myEntry = act.animeId ? myLibrary.entries[act.animeId] : undefined;
            return (
              <div
                key={act.id}
                className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenUser(act.userId)}
                      className="shrink-0"
                    >
                      <img
                        src={act.authorAvatar}
                        alt={act.authorName}
                        className="h-10 w-10 rounded-full object-cover bg-black"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <button
                          type="button"
                          onClick={() => onOpenUser(act.userId)}
                          className="font-bold text-white hover:text-[#3EA6FF] hover:underline"
                        >
                          {act.authorHandle}
                        </button>
                        <span className="text-[#AAAAAA]">· {timeAgo(act.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[13.5px] text-[#F1F1F1]">
                        {act.statusText}
                        {act.score ? (
                          <span className="ml-2 font-bold text-amber-300">
                            ★ {formatUserScore(act.score, settings.scoreFormat)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {act.animeId && act.animeCover && (
                    <button
                      type="button"
                      onClick={() => onOpenAnime(act.animeId!)}
                      className="shrink-0 overflow-hidden rounded-lg border border-white/10"
                      title={act.animeTitle}
                    >
                      <img src={act.animeCover} alt={act.animeTitle} className="h-16 w-11 object-cover" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[12px] text-[#AAAAAA]">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => void handleLikeActivity(act)}
                      className={`flex items-center gap-1 transition ${
                        act.likedByMe ? 'text-rose-400 font-bold' : 'hover:text-white'
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${act.likedByMe ? 'fill-current' : ''}`} />
                      <span>{act.likeCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReplies((prev) => {
                          const next = new Set(prev);
                          if (next.has(act.id)) next.delete(act.id);
                          else next.add(act.id);
                          return next;
                        })
                      }
                      className="flex items-center gap-1 hover:text-white"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>{act.replies.length}</span>
                    </button>
                    {act.animeId && myEntry && (
                      <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-neutral-300">
                        In your list
                      </span>
                    )}
                  </div>

                  {cloud.userId === act.userId && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteActivity(act.id, cloud.userId!);
                        setActivities((prev) => prev.filter((a) => a.id !== act.id));
                      }}
                      className="rounded p-1 hover:text-rose-400"
                      aria-label="Delete post"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="space-y-2 border-t border-white/[0.06] pt-2.5">
                    {act.replies.map((rep) => (
                      <div key={rep.id} className="flex items-start gap-2.5 rounded-xl bg-[#222222] p-2.5">
                        <img
                          src={rep.authorAvatar}
                          alt={rep.authorName}
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1 text-[12px]">
                          <span className="font-bold text-white">{rep.authorHandle}</span>{' '}
                          <span className="text-[#E5E5E5]">{rep.body}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={replyDrafts[act.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((d) => ({ ...d, [act.id]: e.target.value }))
                        }
                        placeholder="Write a reply…"
                        className="h-8 flex-1 rounded-lg border border-white/10 bg-[#0F0F0F] px-3 text-[12px] text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendReply(act.id)}
                        className="rounded-lg bg-[#3EA6FF] px-3 text-[11.5px] font-bold text-black"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
