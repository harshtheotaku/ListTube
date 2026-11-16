import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Film,
  Minus,
  Play,
  Plus,
  Share2,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Tv,
} from 'lucide-react';
import {
  Anime,
  LibraryState,
  ListStatus,
  LIST_STATUS_ORDER,
  ScoredAnime,
  mangaOriginLabel,
  statusLabel,
} from '../types';
import { fetchDetail } from '../services/anilist';
import { fetchMALDetail } from '../services/jikan';
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';
import { getSimilar } from '../services/recommender';
import { franchiseNameOf } from '../services/franchise';
import { useSettings } from '../services/settings';
import { CommentsSection } from './CommentsSection';
import { toast } from './Toast';
import { CardSkeleton } from './Skeleton';

interface DetailViewProps {
  animeId: string;
  libraryState: LibraryState;
  onOpenId: (id: string) => void;
  onOpenChannel: (anime: Anime) => void;
  onEditProfile?: () => void;
  onClose: () => void;
  onQuickAdd: (anime: Anime) => void;
}

function countdown(timestamp: number): string {
  const diff = timestamp * 1000 - Date.now();
  if (diff <= 0) return 'airing now';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatSubscribers(popularity?: number): string {
  if (!popularity) return '120K fans';
  if (popularity >= 1_000_000) return `${(popularity / 1_000_000).toFixed(1)}M fans`;
  if (popularity >= 1_000) return `${Math.round(popularity / 1_000)}K fans`;
  return `${popularity} fans`;
}

export const DetailView: React.FC<DetailViewProps> = ({
  animeId,
  libraryState,
  onOpenId,
  onOpenChannel,
  onEditProfile,
  onClose,
}) => {
  const settings = useSettings();
  const [anime, setAnime] = useState<Anime | null>(() => animeStore.get(animeId) ?? null);
  const [loading, setLoading] = useState(!anime?.description);
  const [similar, setSimilar] = useState<ScoredAnime[]>([]);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [similarPage, setSimilarPage] = useState(1);
  const [loadingMoreSimilar, setLoadingMoreSimilar] = useState(false);
  const [hasMoreSimilar, setHasMoreSimilar] = useState(true);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(settings.autoplayTrailer);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  const entry = libraryState.entries[animeId];

  // Reset trailer playback & menus when switching anime
  useEffect(() => {
    setIsTrailerPlaying(settings.autoplayTrailer);
    setListPickerOpen(false);
    setIsDescriptionExpanded(false);
  }, [animeId, settings.autoplayTrailer]);

  useEffect(() => {
    let cancelled = false;
    const cached = animeStore.get(animeId);
    if (cached) setAnime(cached);

    const isManga = animeId.includes('manga');
    const numeric = Number(animeId.split(':')[1]);
    const needsFetch = !cached || !cached.description || cached.similar.length === 0;

    if (!needsFetch) {
      setLoading(false);
    } else {
      setLoading(true);
      const loader = animeId.startsWith('mal')
        ? fetchMALDetail(numeric, isManga ? 'MANGA' : 'ANIME')
        : fetchDetail(numeric, isManga ? 'MANGA' : 'ANIME');

      loader
        .then((result) => {
          if (cancelled || !result) return;
          animeStore.remember(result);
          setAnime(result);
        })
        .catch((error) => {
          console.warn('[detail] failed to load', error);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [animeId]);

  useEffect(() => {
    library.logOpen(animeId);
  }, [animeId]);

  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarPage(1);
    setHasMoreSimilar(true);

    const excluded = new Set([
      ...Object.keys(libraryState.entries),
      ...libraryState.notInterested,
    ]);

    getSimilar(anime, excluded, 16, 1)
      .then((items) => {
        if (cancelled) return;
        setSimilar(items);
        setHasMoreSimilar(items.length >= 8);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [anime?.id, anime?.fetchedAt]);

  const loadMoreSimilar = () => {
    if (!anime || loadingMoreSimilar) return;
    const nextPage = similarPage + 1;
    setLoadingMoreSimilar(true);
    const excluded = new Set([
      ...Object.keys(libraryState.entries),
      ...libraryState.notInterested,
      ...similar.map((s) => s.anime.id),
    ]);

    getSimilar(anime, excluded, 16, nextPage)
      .then((more) => {
        if (more.length === 0) {
          setHasMoreSimilar(false);
        } else {
          setSimilar((prev) => [...prev, ...more]);
          setSimilarPage(nextPage);
        }
      })
      .finally(() => setLoadingMoreSimilar(false));
  };

  const meta = useMemo(() => {
    if (!anime) return '';
    const isManga = anime.mediaType === 'MANGA';
    return [
      anime.year,
      anime.season,
      isManga ? mangaOriginLabel(anime) : anime.format,
      isManga
        ? anime.chapters
          ? `${anime.chapters} chapters`
          : null
        : anime.episodes
        ? `${anime.episodes} episodes`
        : null,
      !isManga && anime.duration ? `${anime.duration} min` : null,
    ]
      .filter(Boolean)
      .join(' • ');
  }, [anime]);

  if (!anime) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onClose}
          className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  const isManga = anime.mediaType === 'MANGA';
  const isSubscribed = Boolean(entry);
  const total = isManga
    ? anime.chapters ?? 0
    : anime.episodes ?? (anime.nextEpisode ? Math.max(1, anime.nextEpisode.number - 1) : 0);
  const progress = entry?.progress ?? 0;
  const studioName = anime.studios[0] || (isManga ? 'Official Manga Publication' : 'Official Studio');
  const channelName = franchiseNameOf(anime.title);

  const handleChooseList = (status: ListStatus) => {
    library.setStatus(anime, status);
    setListPickerOpen(false);
    toast(`Subscribed · Added to ${statusLabel(status, anime.mediaType)}`);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: anime.title,
          text: `Check out ${anime.title} on AniTube!`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast('Link copied to clipboard!');
    }
  };

  const widePreview =
    anime.hasOfficialBanner && anime.banner && anime.banner !== anime.cover
      ? anime.banner
      : null;

  return (
    <div className="min-h-screen bg-[#0F0F0F] pb-24 text-white lg:pb-16">
      {/* Top Floating Back Bar */}
      <div className="sticky top-14 z-30 flex items-center justify-between border-b border-white/[0.06] bg-[#0F0F0F]/95 px-4 py-2 backdrop-blur-md sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="flex items-center gap-2 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3F3F3F]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="max-w-[220px] truncate text-[12px] font-medium text-[#AAAAAA] sm:max-w-md">
          {anime.title}
        </span>
      </div>

      <div className="mx-auto max-w-[1380px] px-4 pt-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px]">
          {/* Left Column: 16:9 Trailer / Artwork Hero, Title + Inline Description, Channel Row, Official Links */}
          <div className="space-y-4">
            {/* 16:9 Hero: Trailer only plays on user click OR when Auto-Play Trailers setting is ON */}
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
              {anime.trailerYoutubeId && isTrailerPlaying ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${anime.trailerYoutubeId}?autoplay=1&rel=0&modestbranding=1`}
                  title={`${anime.title} Official Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="relative h-full w-full bg-[#121216]">
                  {widePreview ? (
                    <img
                      src={widePreview}
                      alt={anime.title}
                      className="absolute inset-0 h-full w-full object-cover brightness-[0.82]"
                    />
                  ) : (
                    <>
                      <img
                        src={anime.cover}
                        alt=""
                        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl"
                      />
                      <div className="absolute inset-0 z-[1] flex items-center justify-center">
                        <img
                          src={anime.cover}
                          alt={anime.title}
                          className="h-full w-auto max-w-[70%] object-contain drop-shadow-2xl"
                        />
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-gradient-to-t from-black/75 via-black/25 to-black/20 p-4">
                    {isManga ? (
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="flex items-center gap-1.5 rounded-full bg-black/75 px-4 py-2 text-xs font-bold text-white backdrop-blur-md border border-white/15">
                          <BookOpen className="h-4 w-4 text-[#FF0000]" />
                          Official Manga Overview
                        </span>
                      </div>
                    ) : anime.trailerYoutubeId ? (
                      <button
                        type="button"
                        onClick={() => setIsTrailerPlaying(true)}
                        className="group flex items-center gap-2.5 rounded-full bg-[#FF0000] px-6 py-3 text-[14px] font-bold text-white shadow-2xl transition hover:scale-105 hover:bg-[#CC0000] active:scale-95"
                      >
                        <Play className="h-5 w-5 fill-white" />
                        <span>Play Trailer</span>
                      </button>
                    ) : (
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                          anime.title + ' official trailer'
                        )}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 rounded-full bg-[#FF0000] px-5 py-3 text-[13px] font-bold text-white shadow-2xl transition hover:bg-[#CC0000]"
                      >
                        <Play className="h-4 w-4 fill-white" />
                        <span>Play Trailer on YouTube</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Video Title */}
            <div>
              <h1 className="text-[20px] font-bold leading-snug tracking-tight text-white sm:text-[22px]">
                {anime.title}
              </h1>
              {anime.titleRomaji && anime.titleRomaji !== anime.title && (
                <p className="mt-0.5 text-[12px] text-[#AAAAAA]">{anime.titleRomaji}</p>
              )}
            </div>

            {/* Channel Row: Anime Franchise Avatar, Name, Subscribers & Subscribe 5-List Button */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenChannel(anime)}
                  className="group flex items-center gap-3 text-left"
                  title={`Open ${channelName} Channel`}
                >
                  <img
                    src={anime.cover}
                    alt={channelName}
                    className="h-10 w-10 shrink-0 rounded-full bg-[#272727] object-cover ring-1 ring-white/10 transition group-hover:ring-white/40"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[200px] truncate text-[15px] font-bold text-white transition group-hover:text-[#3EA6FF] sm:max-w-[280px]">
                        {channelName}
                      </span>
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#AAAAAA]/25 text-[9px] font-bold text-[#AAAAAA]">
                        ✓
                      </span>
                    </div>
                    <span className="text-[12px] text-[#AAAAAA]">
                      {formatSubscribers(anime.popularity)} · View Channel
                    </span>
                  </div>
                </button>

                {/* Subscribe Button (Tapping opens the 5 Lists picker!) */}
                <div className="relative ml-2">
                  {isSubscribed ? (
                    <button
                      type="button"
                      onClick={() => setListPickerOpen(!listPickerOpen)}
                      className="flex items-center gap-2 rounded-full bg-[#272727] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3F3F3F]"
                    >
                      <Bell className="h-4 w-4 fill-[#FF0000] text-[#FF0000]" />
                      <span>Subscribed · {statusLabel(entry!.status, anime.mediaType)}</span>
                      <ChevronDown className="h-4 w-4 text-[#AAAAAA]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setListPickerOpen(!listPickerOpen)}
                      className="flex items-center gap-2 rounded-full bg-[#F1F1F1] px-5 py-2 text-[13px] font-bold text-[#0F0F0F] transition hover:bg-white active:scale-95"
                    >
                      <span>Subscribe</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  )}

                  {/* 5-List Subscription Dropdown */}
                  {listPickerOpen && (
                    <div className="absolute left-0 top-12 z-50 w-56 rounded-2xl border border-white/[0.12] bg-[#212121] p-2 shadow-2xl">
                      <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                        Choose list to subscribe
                      </p>
                      {LIST_STATUS_ORDER.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleChooseList(status)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12.5px] font-semibold transition ${
                            entry?.status === status
                              ? 'bg-[#FF0000]/20 text-white'
                              : 'text-neutral-200 hover:bg-white/[0.08]'
                          }`}
                        >
                          <span>{statusLabel(status, anime.mediaType)}</span>
                          {entry?.status === status && <Check className="h-4 w-4 text-[#FF0000]" />}
                        </button>
                      ))}
                      {isSubscribed && (
                        <>
                          <div className="my-1 border-t border-white/[0.08]" />
                          <button
                            type="button"
                            onClick={() => {
                              library.remove(anime.id);
                              setListPickerOpen(false);
                              toast('Unsubscribed from series');
                            }}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-[12px] font-semibold text-rose-400 hover:bg-rose-500/10"
                          >
                            Unsubscribe
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Action Pills: All Seasons, Like, Share, Not for me */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChannel(anime)}
                  className="flex items-center gap-1.5 rounded-full bg-[#272727] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#3F3F3F]"
                >
                  <Tv className="h-4 w-4 text-[#FF0000]" />
                  <span>{isManga ? 'Series Channel' : 'All Seasons'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsLiked(!isLiked);
                    toast(isLiked ? 'Removed like' : 'Liked!');
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                    isLiked
                      ? 'bg-[#FF0000]/20 text-white border border-[#FF0000]/40'
                      : 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
                  }`}
                >
                  <ThumbsUp className={`h-4 w-4 ${isLiked ? 'fill-current text-[#FF0000]' : ''}`} />
                  <span>{isLiked ? 'Liked' : 'Like'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-1.5 rounded-full bg-[#272727] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#3F3F3F]"
                >
                  <Share2 className="h-4 w-4" />
                  <span>Share</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    library.notInterested(anime);
                    toast('Got it — fewer picks like this');
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-2 text-[12.5px] font-semibold text-[#AAAAAA] transition hover:bg-[#3F3F3F] hover:text-white"
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>Not for me</span>
                </button>
              </div>
            </div>

            {/* YouTube-Style Inline Description Box right below Title & Channel */}
            <div
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              className="cursor-pointer rounded-2xl bg-[#272727] p-4 transition hover:bg-[#2F2F2F]"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-bold text-white">
                {anime.score ? (
                  <span className="flex items-center gap-1 text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {anime.score.toFixed(1)}/10
                  </span>
                ) : null}
                <span>{meta}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-[#AAAAAA]">
                  {isManga ? studioName : `Studio: ${studioName}`}
                </span>
                {anime.status && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-200">
                    {anime.status}
                  </span>
                )}
                {anime.nextEpisode && (
                  <span className="rounded bg-[#FF0000]/20 px-1.5 py-0.5 text-[11px] font-semibold text-rose-300">
                    Ep {anime.nextEpisode.number} in {countdown(anime.nextEpisode.airingAt)}
                  </span>
                )}
              </div>

              {loading && !anime.description ? (
                <div className="space-y-2 pt-1">
                  <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
                </div>
              ) : (
                <p
                  className={`whitespace-pre-line text-[13.5px] leading-relaxed text-[#F1F1F1] ${
                    isDescriptionExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {anime.description || 'No synopsis available for this title yet.'}
                </p>
              )}

              <p className="mt-1.5 text-[13px] font-bold text-white">
                {isDescriptionExpanded ? 'Show less' : '...more'}
              </p>

              {isDescriptionExpanded && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                  {anime.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-lg bg-black/40 px-2.5 py-1 text-[11.5px] font-medium text-neutral-200"
                    >
                      {genre}
                    </span>
                  ))}
                  {anime.tags.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg bg-[#FF0000]/15 px-2.5 py-1 text-[11.5px] font-medium text-rose-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Subscribed Episode/Chapter Tracker & Rating Bar */}
            {isSubscribed && (
              <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                {total > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12px] font-bold text-[#AAAAAA]">
                      {isManga ? 'Chapters:' : 'Episodes:'}
                    </span>
                    <div className="flex items-center gap-1 rounded-full bg-[#272727] px-2 py-1">
                      <button
                        type="button"
                        aria-label="Decrease progress"
                        onClick={() => library.setProgress(anime.id, Math.max(0, progress - 1))}
                        className="p-1 text-[#AAAAAA] hover:text-white"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[54px] text-center text-[12px] font-bold text-white">
                        {progress}/{total}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase progress"
                        onClick={() => library.setProgress(anime.id, Math.min(total, progress + 1))}
                        className="p-1 text-[#AAAAAA] hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#FF0000]"
                        style={{ width: `${Math.min(100, (progress / total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#AAAAAA]">Your rating:</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
                      const active = (entry?.score ?? 0) >= value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-label={`Rate ${value} out of 10`}
                          onClick={() => {
                            library.setScore(anime.id, value);
                            toast(`Rated ${value}/10`);
                          }}
                          className="p-0.5"
                        >
                          <Star
                            className={`h-4 w-4 transition ${
                              active ? 'fill-amber-300 text-amber-300' : 'text-neutral-600 hover:text-neutral-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {entry?.score ? (
                    <span className="ml-1 text-[12px] font-bold text-amber-300">{entry.score}/10</span>
                  ) : null}
                </div>
              </div>
            )}

            {/* Official Destinations ("In case you watch anime Legally🏴‍☠️") */}
            {anime.streaming.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                  <Tv className="h-4 w-4 text-[#FF0000]" />
                  Official {isManga ? 'Reading' : 'Streaming'} Destinations
                </h3>
                <div className="flex flex-wrap gap-2">
                  {anime.streaming.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1.5 rounded-xl bg-[#272727] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#383838]"
                    >
                      <span>{link.site}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-[#FF0000]" />
                    </a>
                  ))}
                </div>
                <p className="mt-2.5 text-[11.5px] font-medium text-[#AAAAAA]">
                  {isManga
                    ? 'In case you read manga Legally🏴‍☠️'
                    : 'In case you watch anime Legally🏴‍☠️'}
                </p>
              </div>
            )}

            {/* YouTube-Style Persistent Comments + Pinned Spoiler-Free MAL Review */}
            <CommentsSection anime={anime} onEditProfile={onEditProfile} />
          </div>

          {/* Right Column: "Up Next & Recommendations" (Real MAL / AniList / Community Recs!) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">
                <Sparkles className="h-4 w-4 text-[#FF0000]" />
                Up Next &amp; Similar
              </h2>
            </div>

            {similarLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="flex animate-pulse gap-3">
                    <div className="aspect-video w-40 shrink-0 rounded-xl bg-white/[0.08]" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 w-4/5 rounded bg-white/[0.08]" />
                      <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : similar.length === 0 ? (
              <p className="py-4 text-xs text-[#AAAAAA]">No closely matched recommendations found.</p>
            ) : (
              <div className="space-y-3">
                {similar.map(({ anime: item, reason }) => {
                  const thumb =
                    item.hasOfficialBanner && item.banner && item.banner !== item.cover
                      ? item.banner
                      : null;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onOpenId(item.id)}
                      className="group flex cursor-pointer gap-3 rounded-xl p-1.5 transition hover:bg-[#272727]/70"
                    >
                      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-[#141418]">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 overflow-hidden bg-[#121216]">
                            <img
                              src={item.cover}
                              alt=""
                              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-lg"
                            />
                            <div className="absolute inset-0 z-[1] flex items-center justify-center">
                              <img
                                src={item.cover}
                                alt={item.title}
                                loading="lazy"
                                className="h-full w-auto max-w-[72%] object-contain"
                              />
                            </div>
                          </div>
                        )}
                        {item.score ? (
                          <span className="absolute bottom-1 right-1 z-[2] rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            {item.score.toFixed(1)}★
                          </span>
                        ) : null}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#F1F1F1] group-hover:text-white">
                          {item.title}
                        </h4>
                        <p className="mt-1 truncate text-[11.5px] text-[#AAAAAA]">
                          {[franchiseNameOf(item.title), item.year].filter(Boolean).join(' • ')}
                        </p>
                        <p className="mt-1 truncate text-[10.5px] font-semibold text-[#3EA6FF]">
                          {reason}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {hasMoreSimilar && (
                  <button
                    type="button"
                    disabled={loadingMoreSimilar}
                    onClick={loadMoreSimilar}
                    className="mt-2 w-full rounded-full border border-white/[0.12] bg-[#272727] py-2.5 text-[12.5px] font-bold text-white transition hover:bg-[#383838] disabled:opacity-50"
                  >
                    {loadingMoreSimilar ? 'Finding more similar anime…' : 'Show more recommendations'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
