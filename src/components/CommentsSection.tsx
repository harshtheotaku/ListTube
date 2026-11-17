import React, { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  CornerDownRight,
  ExternalLink,
  Eye,
  MessageSquare,
  PenLine,
  Pin,
  Star,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { Anime, ReviewVerdict, UserReview } from '../types';
import { useComments } from '../services/comments';
import {
  deleteMediaReview,
  fetchMediaReviews,
  publishActivity,
  toggleReviewVote,
  upsertMediaReview,
} from '../services/community';
import { cloudSync, MergedComment, useCloudSync } from '../services/cloudSync';
import { useProfile } from '../services/profile';
import { fetchPinnedSpoilerFreeReview, PinnedReview } from '../services/reviews';
import { formatUserScore } from '../services/scoring';
import { useSettings } from '../services/settings';
import { toast } from './Toast';

interface CommentsSectionProps {
  anime: Anime;
  onEditProfile?: () => void;
  onOpenUser?: (userIdOrHandle: string) => void;
}

function formatTimeAgo(timestamp: number): string {
  const sec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (sec < 60) return 'Just now';
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  anime,
  onEditProfile,
  onOpenUser,
}) => {
  const profile = useProfile();
  const cloud = useCloudSync();
  const settings = useSettings();
  const userComments = useComments(anime.id);

  const [cloudComments, setCloudComments] = useState<MergedComment[]>([]);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [sectionTab, setSectionTab] = useState<'discussions' | 'reviews'>('discussions');

  // Episode discussion filter & replies
  const isManga = anime.mediaType === 'MANGA';
  const [episodeFilter, setEpisodeFilter] = useState<number | 'all' | 'general'>('all');
  const [composeEpisode, setComposeEpisode] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<MergedComment | null>(null);
  const [draft, setDraft] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);

  // Pinned MAL Review
  const [pinnedReview, setPinnedReview] = useState<PinnedReview | null>(null);
  const [pinnedLoading, setPinnedLoading] = useState(true);

  // User Review Composer
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [revHeadline, setRevHeadline] = useState('');
  const [revBody, setRevBody] = useState('');
  const [revScore, setRevScore] = useState<number>(8);
  const [revStory, setRevStory] = useState<number>(8);
  const [revArt, setRevArt] = useState<number>(8);
  const [revSound, setRevSound] = useState<number>(8);
  const [revEnjoy, setRevEnjoy] = useState<number>(8);
  const [revVerdict, setRevVerdict] = useState<ReviewVerdict>('Recommended');
  const [revSpoiler, setRevSpoiler] = useState(false);
  const [revBusy, setRevBusy] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setPinnedLoading(true);
    setPinnedReview(null);
    setEpisodeFilter('all');
    setComposeEpisode(null);
    setReplyTo(null);

    fetchPinnedSpoilerFreeReview(anime)
      .then((res) => {
        if (!cancelled) setPinnedReview(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPinnedLoading(false);
      });

    cloudSync
      .loadCommentsForMedia(anime.id)
      .then((rows) => {
        if (!cancelled) setCloudComments(rows);
      })
      .catch(() => {});

    fetchMediaReviews(anime.id, cloud.userId)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [anime.id, anime.malId, anime.anilistId, cloud.userId]);

  const allComments = useMemo(() => {
    const map = new Map<string, MergedComment>();
    for (const c of cloudComments) map.set(c.id, c);
    for (const c of userComments) {
      const existing = map.get(c.id);
      map.set(c.id, { ...c, isCloud: existing?.isCloud, ownerUserId: existing?.ownerUserId });
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [cloudComments, userComments]);

  const episodeOptions = useMemo(() => {
    const eps = new Set<number>();
    const maxEp = Math.min(anime.episodes ?? 24, 36);
    for (let i = 1; i <= maxEp; i++) eps.add(i);
    for (const c of allComments) {
      if (typeof c.episodeNumber === 'number' && c.episodeNumber > 0) eps.add(c.episodeNumber);
    }
    return Array.from(eps).sort((a, b) => a - b);
  }, [anime.episodes, allComments]);

  const { topComments, repliesByParent } = useMemo(() => {
    const repliesMap = new Map<string, MergedComment[]>();
    const parents: MergedComment[] = [];

    for (const c of allComments) {
      if (c.parentId) {
        const list = repliesMap.get(c.parentId) ?? [];
        list.push(c);
        repliesMap.set(c.parentId, list);
      } else {
        const matchesFilter =
          episodeFilter === 'all'
            ? true
            : episodeFilter === 'general'
            ? !c.episodeNumber
            : c.episodeNumber === episodeFilter;
        if (matchesFilter) parents.push(c);
      }
    }
    for (const list of repliesMap.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    return { topComments: parents, repliesByParent: repliesMap };
  }, [allComments, episodeFilter]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    const ep =
      replyTo?.episodeNumber ??
      (composeEpisode !== null
        ? composeEpisode
        : typeof episodeFilter === 'number'
        ? episodeFilter
        : null);
    setDraft('');
    setComposerFocused(false);
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);

    const created = await cloudSync.postComment(anime.id, trimmed, profile, {
      episodeNumber: ep,
      parentId,
    });
    if (created) {
      setCloudComments((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    }
    toast(cloud.isLinked ? 'Comment published to community thread' : 'Saved locally (Sign in with Google for public sync)');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloud.userId) {
      toast('Sign in with Google to publish community reviews');
      return;
    }
    if (revBody.trim().length < 20) {
      toast('Please write at least 20 characters for your review.');
      return;
    }
    setRevBusy(true);
    try {
      const saved = await upsertMediaReview({
        userId: cloud.userId,
        anime,
        profile,
        headline: revHeadline,
        body: revBody,
        overallScore: revScore,
        storyScore: revStory,
        artScore: revArt,
        soundScore: revSound,
        enjoymentScore: revEnjoy,
        verdict: revVerdict,
        isSpoiler: revSpoiler,
      });
      setReviews((prev) => [saved, ...prev.filter((r) => r.userId !== saved.userId)]);
      setReviewFormOpen(false);
      setRevHeadline('');
      setRevBody('');
      void publishActivity({
        userId: cloud.userId,
        profile,
        kind: 'review',
        anime,
        score: revScore,
        statusText: `Published a ${revVerdict} review for ${anime.title}`,
      });
      toast('Review published!');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to publish review');
    } finally {
      setRevBusy(false);
    }
  };

  const handleToggleHelpful = async (review: UserReview) => {
    if (!cloud.userId) {
      toast('Sign in with Google to vote on reviews');
      return;
    }
    const nextVoted = !review.votedByMe;
    setReviews((prev) =>
      prev.map((r) =>
        r.id === review.id
          ? {
              ...r,
              votedByMe: nextVoted,
              helpfulCount: Math.max(0, r.helpfulCount + (nextVoted ? 1 : -1)),
            }
          : r
      )
    );
    await toggleReviewVote(review.id, cloud.userId, review.votedByMe);
  };

  const renderCommentCard = (comment: MergedComment, isReply = false) => {
    const canDelete = !comment.ownerUserId || comment.ownerUserId === cloud.userId;
    const replies = !isReply ? repliesByParent.get(comment.id) ?? [] : [];
    const authorTarget = comment.ownerUserId || comment.authorHandle;

    return (
      <div key={comment.id} className={isReply ? 'ml-9 mt-2.5 border-l border-white/10 pl-3' : ''}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onOpenUser?.(authorTarget)}
            className="shrink-0 rounded-full focus:outline-none"
          >
            <img
              src={comment.authorAvatar}
              alt={comment.authorName}
              className={`${isReply ? 'h-7 w-7' : 'h-9 w-9'} rounded-full object-cover bg-[#272727]`}
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <button
                type="button"
                onClick={() => onOpenUser?.(authorTarget)}
                className="font-bold text-white hover:text-[#3EA6FF] hover:underline"
              >
                {comment.authorHandle}
              </button>
              {typeof comment.episodeNumber === 'number' && comment.episodeNumber > 0 && (
                <span className="rounded bg-[#FF0000]/20 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300">
                  Ep {comment.episodeNumber}
                </span>
              )}
              {comment.isCloud && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#AAAAAA]">
                  Public
                </span>
              )}
              <span className="text-[11px] text-[#AAAAAA]">{formatTimeAgo(comment.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-[#F1F1F1]">
              {comment.text}
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCloudComments((prev) =>
                    prev.map((c) =>
                      c.id === comment.id
                        ? {
                            ...c,
                            likedByMe: !c.likedByMe,
                            likes: Math.max(0, c.likes + (c.likedByMe ? -1 : 1)),
                          }
                        : c
                    )
                  );
                  void cloudSync.toggleCommentLike(anime.id, comment);
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] transition ${
                  comment.likedByMe
                    ? 'text-[#3EA6FF]'
                    : 'text-[#AAAAAA] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <ThumbsUp className={`h-3.5 w-3.5 ${comment.likedByMe ? 'fill-current' : ''}`} />
                {comment.likes > 0 && <span>{comment.likes}</span>}
              </button>

              {!isReply && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(comment);
                    setComposerFocused(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold text-[#AAAAAA] hover:bg-white/[0.06] hover:text-white"
                >
                  <CornerDownRight className="h-3 w-3" />
                  Reply
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  aria-label="Delete comment"
                  onClick={() => {
                    setCloudComments((prev) =>
                      prev.filter((c) => c.id !== comment.id && c.parentId !== comment.id)
                    );
                    void cloudSync.deleteComment(anime.id, comment);
                    toast('Comment deleted');
                  }}
                  className="rounded-full p-1 text-[#AAAAAA] transition hover:bg-white/[0.06] hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        {replies.map((rep) => renderCommentCard(rep, true))}
      </div>
    );
  };

  return (
    <section className="space-y-5 border-t border-white/[0.08] pt-5">
      {/* Section Header & Discussions / Reviews Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSectionTab('discussions')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
              sectionTab === 'discussions'
                ? 'bg-white text-black'
                : 'bg-[#222222] text-[#CCCCCC] hover:bg-[#303030]'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Discussions ({allComments.length})
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('reviews')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
              sectionTab === 'reviews'
                ? 'bg-white text-black'
                : 'bg-[#222222] text-[#CCCCCC] hover:bg-[#303030]'
            }`}
          >
            <Star className="h-3.5 w-3.5 fill-current text-amber-400" />
            Reviews ({reviews.length + (pinnedReview ? 1 : 0)})
          </button>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#AAAAAA]">
          {cloud.isLinked && <Cloud className="h-3 w-3 text-emerald-400" />}
          {cloud.isLinked ? 'Public cloud community enabled' : 'Sign in with Google to post publicly'}
        </span>
      </div>

      {/* Pinned Spoiler-Free MAL User Review (Always visible on both tabs or Reviews) */}
      {pinnedLoading ? (
        <div className="animate-pulse rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
          <div className="mb-2 h-3 w-44 rounded bg-white/10" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-5/6 rounded bg-white/[0.06]" />
          </div>
        </div>
      ) : pinnedReview ? (
        <div className="rounded-2xl border border-white/[0.1] bg-[#181818] p-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#AAAAAA]">
              <Pin className="h-3 w-3 rotate-45 text-[#FF0000]" />
              Pinned by ListTube · Spoiler-Free {pinnedReview.source} Review
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                pinnedReview.tag.toLowerCase().includes('recommend') &&
                !pinnedReview.tag.toLowerCase().includes('not')
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {pinnedReview.tag}
            </span>
          </div>

          <div className="flex items-start gap-3">
            {pinnedReview.authorAvatar ? (
              <img
                src={pinnedReview.authorAvatar}
                alt={pinnedReview.author}
                className="h-9 w-9 shrink-0 rounded-full object-cover bg-[#272727]"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E51A2] text-[12px] font-black text-white">
                {pinnedReview.author.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-bold text-white">@{pinnedReview.author}</span>
                {pinnedReview.date && (
                  <span className="text-[11px] text-[#AAAAAA]">· {pinnedReview.date}</span>
                )}
              </div>

              <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-[#E5E5E5]">
                {pinnedReview.fullText || pinnedReview.excerpt}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[11.5px]">
                {pinnedReview.reactions ? (
                  <span className="inline-flex items-center gap-1 text-[#AAAAAA]">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {pinnedReview.reactions.toLocaleString()} helpful
                  </span>
                ) : null}

                <a
                  href={pinnedReview.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-semibold text-[#3EA6FF] hover:underline"
                >
                  <span>View on {pinnedReview.source}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 1: EPISODE DISCUSSIONS & THREADED COMMENTS */}
      {sectionTab === 'discussions' && (
        <div className="space-y-4">
          {!isManga && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setEpisodeFilter('all')}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition ${
                  episodeFilter === 'all' ? 'bg-[#FF0000] text-white' : 'bg-[#222222] text-[#CCCCCC] hover:text-white'
                }`}
              >
                All Threads
              </button>
              <button
                type="button"
                onClick={() => setEpisodeFilter('general')}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition ${
                  episodeFilter === 'general' ? 'bg-[#FF0000] text-white' : 'bg-[#222222] text-[#CCCCCC] hover:text-white'
                }`}
              >
                General
              </button>
              {episodeOptions.map((ep) => (
                <button
                  key={ep}
                  type="button"
                  onClick={() => setEpisodeFilter(ep)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition ${
                    episodeFilter === ep ? 'bg-[#3EA6FF] text-black font-bold' : 'bg-[#222222] text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  Ep {ep}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form onSubmit={handleSubmitComment} className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-3 py-1.5 text-[11.5px]">
                <span className="text-[#CCCCCC]">
                  Replying to <strong className="text-white">{replyTo.authorHandle}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="font-bold text-[#3EA6FF] hover:underline"
                >
                  Cancel reply
                </button>
              </div>
            )}

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={onEditProfile}
                title="Customize Channel & PFP"
                className="shrink-0 rounded-full focus:outline-none"
              >
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-10 w-10 rounded-full object-cover bg-[#272727] ring-1 ring-white/10 transition hover:ring-[#FF0000]"
                />
              </button>

              <div className="min-w-0 flex-1 space-y-2.5">
                <input
                  value={draft}
                  onFocus={() => setComposerFocused(true)}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    replyTo
                      ? `Reply to ${replyTo.authorHandle}…`
                      : typeof episodeFilter === 'number'
                      ? `Discuss Episode ${episodeFilter} as ${profile.name}…`
                      : `Add a comment as ${profile.name}…`
                  }
                  className="w-full border-b border-white/[0.2] bg-transparent pb-1.5 text-[16px] text-white placeholder:text-[13px] placeholder:text-[#888888] outline-none transition focus:border-white lg:text-[13.5px]"
                />

                {(composerFocused || draft.trim().length > 0 || replyTo) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!isManga && !replyTo && (
                        <select
                          value={
                            composeEpisode ?? (typeof episodeFilter === 'number' ? episodeFilter : '')
                          }
                          onChange={(e) =>
                            setComposeEpisode(e.target.value ? Number(e.target.value) : null)
                          }
                          className="h-7 rounded-lg border border-white/15 bg-[#181818] px-2 text-[11px] font-semibold text-white outline-none"
                        >
                          <option value="">General Discussion</option>
                          {episodeOptions.map((ep) => (
                            <option key={ep} value={ep}>
                              Episode {ep}
                            </option>
                          ))}
                        </select>
                      )}
                      {onEditProfile && (
                        <button
                          type="button"
                          onClick={onEditProfile}
                          className="text-[11px] font-semibold text-[#AAAAAA] hover:text-white"
                        >
                          Change PFP
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft('');
                          setReplyTo(null);
                          setComposerFocused(false);
                        }}
                        className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="rounded-full bg-[#3EA6FF] px-4 py-1.5 text-[12px] font-bold text-[#0F0F0F] transition hover:bg-[#65B8FF] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
                      >
                        {replyTo ? 'Reply' : 'Comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>

          {topComments.length === 0 ? (
            <p className="py-2 text-[12.5px] text-[#AAAAAA]">
              No discussions in this thread yet — start the conversation above.
            </p>
          ) : (
            <div className="space-y-4">{topComments.map((c) => renderCommentCard(c, false))}</div>
          )}
        </div>
      )}

      {/* TAB 2: COMMUNITY WRITTEN REVIEWS & COMPOSER */}
      {sectionTab === 'reviews' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-white">
              ListTube Community Reviews ({reviews.length})
            </h3>
            <button
              type="button"
              onClick={() => setReviewFormOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-[#FF0000] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#CC0000]"
            >
              <PenLine className="h-3.5 w-3.5" />
              {reviewFormOpen ? 'Close Editor' : 'Write a Review'}
            </button>
          </div>

          {reviewFormOpen && (
            <form
              onSubmit={handleSubmitReview}
              className="space-y-3 rounded-2xl border border-white/[0.12] bg-[#181818] p-4"
            >
              <input
                value={revHeadline}
                onChange={(e) => setRevHeadline(e.target.value)}
                maxLength={140}
                placeholder="Review headline (e.g. A masterclass in tension and direction)"
                className="w-full rounded-xl border border-white/15 bg-[#0F0F0F] px-3 py-2 text-[13.5px] font-semibold text-white outline-none focus:border-[#3EA6FF]"
              />

              <textarea
                rows={5}
                value={revBody}
                onChange={(e) => setRevBody(e.target.value)}
                placeholder="Share your full spoiler-marked or spoiler-free critique (minimum 20 characters)…"
                className="w-full rounded-xl border border-white/15 bg-[#0F0F0F] px-3 py-2 text-[13px] text-white outline-none focus:border-[#3EA6FF]"
              />

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {[
                  { label: 'Overall', val: revScore, set: setRevScore, step: 0.5 },
                  { label: 'Story', val: revStory, set: setRevStory, step: 1 },
                  { label: isManga ? 'Art' : 'Animation', val: revArt, set: setRevArt, step: 1 },
                  { label: 'Sound/Flow', val: revSound, set: setRevSound, step: 1 },
                  { label: 'Enjoyment', val: revEnjoy, set: setRevEnjoy, step: 1 },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl bg-[#242424] p-2">
                    <label className="block text-[10px] font-bold uppercase text-[#AAAAAA]">
                      {metric.label} (1–10)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={metric.step}
                      value={metric.val}
                      onChange={(e) => metric.set(Number(e.target.value) || 8)}
                      className="mt-1 w-full bg-transparent text-[14px] font-black text-amber-300 outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={revVerdict}
                    onChange={(e) => setRevVerdict(e.target.value as ReviewVerdict)}
                    className="h-9 rounded-xl border border-white/15 bg-[#0F0F0F] px-3 text-[12px] font-semibold text-white outline-none"
                  >
                    <option value="Recommended">Recommended</option>
                    <option value="Mixed Feelings">Mixed Feelings</option>
                    <option value="Not Recommended">Not Recommended</option>
                  </select>

                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#242424] px-3 py-2 text-[12px] font-semibold text-neutral-200">
                    <input
                      type="checkbox"
                      checked={revSpoiler}
                      onChange={(e) => setRevSpoiler(e.target.checked)}
                      className="accent-[#FF0000]"
                    />
                    Contains Spoilers
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={revBusy || revBody.trim().length < 20}
                  className="rounded-full bg-[#3EA6FF] px-5 py-2 text-[12.5px] font-bold text-black transition hover:bg-[#65B8FF] disabled:opacity-40"
                >
                  {revBusy ? 'Publishing…' : 'Publish Review'}
                </button>
              </div>
            </form>
          )}

          {reviews.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-[#141414] p-5 text-center text-[12.5px] text-[#AAAAAA]">
              No ListTube user reviews yet. Write the first structured review for {anime.title}!
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((rev) => {
                const isOwn = cloud.userId === rev.userId;
                const masked = rev.isSpoiler && !revealedSpoilers.has(rev.id);
                return (
                  <article
                    key={rev.id}
                    className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenUser?.(rev.userId)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <img
                          src={rev.authorAvatar}
                          alt={rev.authorName}
                          className="h-9 w-9 rounded-full object-cover bg-[#272727]"
                        />
                        <div>
                          <p className="text-[13px] font-bold text-white hover:underline">
                            {rev.authorHandle}
                          </p>
                          <p className="text-[11px] text-[#AAAAAA]">
                            {formatTimeAgo(rev.createdAt)}
                          </p>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        {rev.overallScore ? (
                          <span className="flex items-center gap-1 rounded-lg bg-amber-400/15 px-2.5 py-1 text-[11.5px] font-black text-amber-300">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            {formatUserScore(rev.overallScore, settings.scoreFormat)}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                            rev.verdict === 'Recommended'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : rev.verdict === 'Mixed Feelings'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {rev.verdict}
                        </span>
                      </div>
                    </div>

                    {rev.headline && (
                      <h4 className="text-[14.5px] font-bold text-white">{rev.headline}</h4>
                    )}

                    {masked ? (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center">
                        <p className="text-[12px] font-semibold text-rose-200">
                          This review contains spoilers.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSpoilers((prev) => new Set([...prev, rev.id]))
                          }
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-[11.5px] font-bold text-white hover:bg-white/20"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Reveal Spoiler Review
                        </button>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[#E5E5E5]">
                        {rev.body}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-[11.5px] text-[#AAAAAA]">
                      <div className="flex flex-wrap gap-3">
                        {rev.storyScore ? <span>Story: {rev.storyScore}/10</span> : null}
                        {rev.artScore ? <span>Art: {rev.artScore}/10</span> : null}
                        {rev.soundScore ? <span>Sound: {rev.soundScore}/10</span> : null}
                        {rev.enjoymentScore ? <span>Enjoyment: {rev.enjoymentScore}/10</span> : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleHelpful(rev)}
                          className={`flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition ${
                            rev.votedByMe
                              ? 'bg-[#3EA6FF]/20 text-[#3EA6FF]'
                              : 'bg-[#242424] text-[#CCCCCC] hover:bg-[#323232]'
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${rev.votedByMe ? 'fill-current' : ''}`} />
                          Helpful ({rev.helpfulCount})
                        </button>

                        {isOwn && cloud.userId && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteMediaReview(rev.id, cloud.userId!);
                              setReviews((prev) => prev.filter((r) => r.id !== rev.id));
                              toast('Review removed');
                            }}
                            className="rounded-full p-1.5 text-rose-400 hover:bg-rose-500/15"
                            aria-label="Delete review"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
