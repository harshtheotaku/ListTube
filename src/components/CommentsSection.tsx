import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, ExternalLink, MessageSquare, Pin, ThumbsUp, Trash2 } from 'lucide-react';
import { Anime } from '../types';
import { useComments } from '../services/comments';
import { cloudSync, MergedComment, useCloudSync } from '../services/cloudSync';
import { useProfile } from '../services/profile';
import { fetchPinnedSpoilerFreeReview, PinnedReview } from '../services/reviews';
import { toast } from './Toast';

interface CommentsSectionProps {
  anime: Anime;
  onEditProfile?: () => void;
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

export const CommentsSection: React.FC<CommentsSectionProps> = ({ anime, onEditProfile }) => {
  const profile = useProfile();
  const cloud = useCloudSync();
  const userComments = useComments(anime.id);
  const [cloudComments, setCloudComments] = useState<MergedComment[]>([]);
  const [draft, setDraft] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [pinnedReview, setPinnedReview] = useState<PinnedReview | null>(null);
  const [pinnedLoading, setPinnedLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPinnedLoading(true);
    setPinnedReview(null);

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

  const totalCount = allComments.length + (pinnedReview ? 1 : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    setComposerFocused(false);
    const created = await cloudSync.postComment(anime.id, trimmed, profile);
    if (created) {
      setCloudComments((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    }
    toast(cloud.isLinked ? 'Comment saved & synced to cloud' : 'Comment posted');
  };

  return (
    <section className="space-y-5 border-t border-white/[0.08] pt-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-white">
          <MessageSquare className="h-4.5 w-4.5 text-[#FF0000]" />
          <span>{totalCount} {totalCount === 1 ? 'Comment' : 'Comments'}</span>
        </h2>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#AAAAAA]">
          {cloud.isLinked && <Cloud className="h-3 w-3 text-emerald-400" />}
          {cloud.isLinked ? 'Synced to cloud across your devices' : 'Comments saved permanently on device'}
        </span>
      </div>

      {/* Add a comment composer */}
      <form onSubmit={handleSubmit} className="flex items-start gap-3">
        <button
          type="button"
          onClick={onEditProfile}
          title="Change profile & PFP"
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
            placeholder={`Add a comment as ${profile.name}…`}
            className="w-full border-b border-white/[0.2] bg-transparent pb-1.5 text-[16px] text-white placeholder:text-[13px] placeholder:text-[#888888] outline-none transition focus:border-white lg:text-[13.5px]"
          />

          {(composerFocused || draft.trim().length > 0) && (
            <div className="flex items-center justify-between gap-2">
              {onEditProfile ? (
                <button
                  type="button"
                  onClick={onEditProfile}
                  className="text-[11px] font-semibold text-[#AAAAAA] hover:text-white"
                >
                  Change PFP ({profile.name})
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft('');
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
                  Comment
                </button>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Pinned Spoiler-Free MAL User Review */}
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

      {/* Persistent User Comments */}
      {allComments.length === 0 ? (
        <p className="py-2 text-[12.5px] text-[#AAAAAA]">
          No personal notes or comments yet — share your thoughts above and they stay saved across refreshes{cloud.isLinked ? ' and synced devices' : ''}.
        </p>
      ) : (
        <div className="space-y-4">
          {allComments.map((comment) => {
            const canDelete = !comment.ownerUserId || comment.ownerUserId === cloud.userId;
            return (
              <div key={comment.id} className="flex items-start gap-3">
                <img
                  src={comment.authorAvatar}
                  alt={comment.authorName}
                  className="h-9 w-9 shrink-0 rounded-full object-cover bg-[#272727]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="font-bold text-white">{comment.authorHandle}</span>
                    {comment.isCloud && (
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#AAAAAA]">
                        Cloud
                      </span>
                    )}
                    <span className="text-[11px] text-[#AAAAAA]">
                      {formatTimeAgo(comment.createdAt)}
                    </span>
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
                      <ThumbsUp
                        className={`h-3.5 w-3.5 ${comment.likedByMe ? 'fill-current' : ''}`}
                      />
                      {comment.likes > 0 && <span>{comment.likes}</span>}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => {
                          setCloudComments((prev) => prev.filter((c) => c.id !== comment.id));
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
            );
          })}
        </div>
      )}
    </section>
  );
};
