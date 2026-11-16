import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Film, Loader2, RefreshCw, Sparkles, Upload, X } from 'lucide-react';
import { Anime, LibraryState, MediaType, ScoredAnime } from '../types';
import {
  getRecommendationPage,
  getRecommendations,
  RecommendationBundle,
} from '../services/recommender';
import { ANIME_GENRES, MANGA_GENRES } from '../services/anilist';
import { searchSmart } from '../services/search';
import { library as libraryStore } from '../services/library';
import { AnimeCard } from './AnimeCard';
import { Shelf, ShelfItem } from './Shelf';
import { GridSkeleton } from './Skeleton';
import { AppTab } from './Sidebar';

interface HomeViewProps {
  library: LibraryState;
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  query: string;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onNavigate: (tab: AppTab) => void;
  onOpenTrackers: () => void;
  onQuickAdd: (anime: Anime) => void;
}

const ONBOARD_KEY = 'anitube.onboard.dismissed';
const FEED_ROTATION_KEY = 'anitube.feed.rotation.v1';

interface RotationRecord {
  seed: number;
  seenIds: string[];
}

function readRotation(mediaType: MediaType): RotationRecord {
  try {
    const raw = localStorage.getItem(FEED_ROTATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<MediaType, RotationRecord>>;
      const rec = parsed[mediaType];
      if (rec) {
        return {
          seed: Number(rec.seed || 0) + 1,
          seenIds: Array.isArray(rec.seenIds) ? rec.seenIds.slice(-24) : [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { seed: 1, seenIds: [] };
}

function writeRotation(mediaType: MediaType, seed: number, newlyShown: string[]) {
  try {
    const raw = localStorage.getItem(FEED_ROTATION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<MediaType, RotationRecord>>) : {};
    const prevSeen = parsed[mediaType]?.seenIds ?? [];
    const merged: string[] = [];
    const set = new Set<string>();
    for (const id of [...prevSeen, ...newlyShown]) {
      if (!set.has(id)) {
        set.add(id);
        merged.push(id);
      }
    }
    parsed[mediaType] = {
      seed,
      seenIds: merged.slice(-24),
    };
    localStorage.setItem(FEED_ROTATION_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}
const YOUTUBE_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const ANIME_CHIPS = [
  'All',
  '🔥 Trending',
  '🌸 This Season',
  '⭐ Top Rated',
  'Action',
  'Romance',
  'Psychological',
  'Fantasy',
  'Sci-Fi',
  'Comedy',
  'Supernatural',
  'Mystery',
  'Adventure',
];

const MANGA_CHIPS = [
  'All',
  '🔥 Trending',
  '⭐ Top Rated',
  'Action',
  'Drama',
  'Fantasy',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Mystery',
  'Adventure',
  'Horror',
];

export const HomeView: React.FC<HomeViewProps> = ({
  library,
  mediaType,
  onMediaTypeChange,
  query,
  onOpen,
  onOpenChannel,
  onNavigate,
  onOpenTrackers,
  onQuickAdd,
}) => {
  const initialRotation = useMemo(() => readRotation(mediaType), [mediaType]);
  const [bundle, setBundle] = useState<RecommendationBundle | null>(null);
  const [extraFeed, setExtraFeed] = useState<ScoredAnime[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(() => initialRotation.seed);
  const [selectedChip, setSelectedChip] = useState('All');
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ONBOARD_KEY) === '1');
  const [searchResults, setSearchResults] = useState<Anime[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pullPx, setPullPx] = useState(0);
  const requestId = useRef(0);
  const searchTicket = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const shownHistoryRef = useRef<Set<string>>(new Set(initialRotation.seenIds));
  const touchStartYRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const pullPxRef = useRef(0);
  const wheelAccRef = useRef(0);
  const wheelLastTriggerRef = useRef(0);

  const isManga = mediaType === 'MANGA';
  const chips = isManga ? MANGA_CHIPS : ANIME_CHIPS;
  const genreOptions = isManga ? MANGA_GENRES : ANIME_GENRES;
  const gridClass = isManga
    ? 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
    : YOUTUBE_GRID;
  const shelfWidth = isManga ? 'w-[155px] sm:w-[175px]' : 'w-[260px] sm:w-[290px]';

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    const ticket = ++searchTicket.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchSmart(trimmed, mediaType, 24)
        .then((res) => {
          if (ticket === searchTicket.current) {
            setSearchResults(res);
          }
        })
        .catch(() => {
          if (ticket === searchTicket.current) setSearchResults([]);
        })
        .finally(() => {
          if (ticket === searchTicket.current) setSearching(false);
        });
    }, 240);
    return () => clearTimeout(timer);
  }, [query, mediaType]);

  useEffect(() => {
    setSelectedChip('All');
    setBundle(null);
    setExtraFeed([]);
    setPage(1);
    setHasMore(true);
    shownHistoryRef.current = new Set(initialRotation.seenIds);
    setRefreshToken(initialRotation.seed);
  }, [mediaType, initialRotation]);

  const triggerRefresh = useCallback(() => {
    if (refreshing) return;
    if (bundle?.forYou) {
      if (shownHistoryRef.current.size > 24) {
        shownHistoryRef.current.clear();
      }
      bundle.forYou.slice(0, 12).forEach((item) => shownHistoryRef.current.add(item.anime.id));
    }
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
  }, [refreshing, bundle]);

  // YouTube-style Pull-to-Refresh at Top (Mobile Touch Drag Down & Trackpad/Wheel Upward Overscroll at Y=0)
  useEffect(() => {
    const THRESHOLD = 58;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 2 && e.touches.length === 1 && !refreshing) {
        touchStartYRef.current = e.touches[0].clientY;
        pullActiveRef.current = true;
      } else {
        touchStartYRef.current = null;
        pullActiveRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullActiveRef.current || touchStartYRef.current === null || refreshing) return;
      if (window.scrollY > 4) {
        pullActiveRef.current = false;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      const dy = e.touches[0].clientY - touchStartYRef.current;
      if (dy > 8) {
        const clamped = Math.min(92, (dy - 8) * 0.45);
        pullPxRef.current = clamped;
        setPullPx(clamped);
      } else if (dy <= 0) {
        pullPxRef.current = 0;
        setPullPx(0);
      }
    };

    const onTouchEnd = () => {
      if (pullActiveRef.current && pullPxRef.current >= THRESHOLD) {
        triggerRefresh();
      }
      touchStartYRef.current = null;
      pullActiveRef.current = false;
      pullPxRef.current = 0;
      setPullPx(0);
    };

    const onWheel = (e: WheelEvent) => {
      if (refreshing || window.scrollY > 0) {
        wheelAccRef.current = 0;
        return;
      }
      if (e.deltaY < -4) {
        const now = Date.now();
        if (now - wheelLastTriggerRef.current < 1500) return;
        wheelAccRef.current += Math.abs(e.deltaY);
        const visual = Math.min(THRESHOLD + 12, wheelAccRef.current * 0.45);
        setPullPx(visual);
        if (wheelAccRef.current >= 140) {
          wheelLastTriggerRef.current = now;
          wheelAccRef.current = 0;
          setPullPx(0);
          triggerRefresh();
        }
      } else if (e.deltaY > 4) {
        wheelAccRef.current = 0;
        setPullPx(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [refreshing, triggerRefresh]);

  const trackedCount = useMemo(
    () =>
      Object.values(library.entries).filter((e) => (e.mediaType ?? 'ANIME') === mediaType).length,
    [library.entries, mediaType]
  );

  const activeInterests = isManga ? library.mangaInterests ?? [] : library.interests;

  const signature = useMemo(
    () =>
      JSON.stringify({
        mediaType,
        entries: Object.entries(library.entries)
          .filter(([, entry]) => (entry.mediaType ?? 'ANIME') === mediaType)
          .map(([id, entry]) => `${id}:${entry.status}:${entry.score ?? ''}`)
          .sort(),
        interests: [...activeInterests].sort(),
        events: library.events.length,
      }),
    [library, mediaType, activeInterests]
  );

  useEffect(() => {
    const id = ++requestId.current;
    if (!bundle) setLoading(true);
    setError(null);
    setExtraFeed([]);
    setPage(1);
    setHasMore(true);

    const timer = setTimeout(() => {
      getRecommendations(library, 20, mediaType, refreshToken, shownHistoryRef.current)
        .then((result) => {
          if (id !== requestId.current) return;
          setBundle(result);
          setLoading(false);
          writeRotation(
            mediaType,
            refreshToken,
            result.forYou.slice(0, 20).map((i) => i.anime.id)
          );
        })
        .catch((err) => {
          if (id !== requestId.current) return;
          console.warn('[home] recommendations failed', err);
          setError('Could not reach AniList. Check your connection and try again.');
          setLoading(false);
        })
        .finally(() => {
          if (id === requestId.current) setRefreshing(false);
        });
    }, bundle ? 250 : 0);

    return () => clearTimeout(timer);
  }, [signature, refreshToken, mediaType]);

  const allShownIds = useMemo(() => {
    const ids = new Set<string>();
    bundle?.forYou.forEach((item) => ids.add(item.anime.id));
    bundle?.shelves.forEach((shelf) => shelf.items.forEach((a) => ids.add(a.id)));
    extraFeed.forEach((item) => ids.add(item.anime.id));
    return ids;
  }, [bundle, extraFeed]);

  const loadMoreFeed = useCallback(() => {
    if (loading || loadingMore || !hasMore || !bundle) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    getRecommendationPage(library, nextPage, allShownIds, mediaType, 16)
      .then((items) => {
        if (items.length === 0) {
          setHasMore(false);
        } else {
          setExtraFeed((prev) => {
            const seen = new Set(prev.map((p) => p.anime.id));
            return [...prev, ...items.filter((i) => !seen.has(i.anime.id))];
          });
          setPage(nextPage);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loading, loadingMore, hasMore, bundle, page, library, allShownIds, mediaType]);

  // Infinite scroll trigger at bottom of feed
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreFeed();
        }
      },
      { rootMargin: '500px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreFeed, hasMore, loading]);

  const dismissOnboarding = () => {
    setDismissed(true);
    localStorage.setItem(ONBOARD_KEY, '1');
  };

  const showOnboarding = !dismissed && trackedCount === 0 && !library.trackers.length;
  const genresLabel = bundle?.profile.genres.slice(0, 3).map((g) => g.name).join(' · ');

  const initialCombined = useMemo(() => {
    if (!bundle) return [];
    return bundle.forYou;
  }, [bundle]);

  const filterList = useCallback(
    (list: ScoredAnime[]) => {
      if (selectedChip === 'All') return list;
      if (selectedChip === '🔥 Trending') {
        return [...list].sort((a, b) => (b.anime.popularity ?? 0) - (a.anime.popularity ?? 0));
      }
      if (selectedChip === '⭐ Top Rated') {
        return [...list].sort((a, b) => (b.anime.score ?? 0) - (a.anime.score ?? 0));
      }
      if (selectedChip === '🌸 This Season') {
        const year = new Date().getFullYear();
        return list.filter((item) => item.anime.year === year || item.anime.status === 'Airing');
      }
      const cleanGenre = selectedChip.trim();
      return list.filter((item) => item.anime.genres.includes(cleanGenre));
    },
    [selectedChip]
  );

  const visibleInitial = useMemo(() => filterList(initialCombined), [filterList, initialCombined]);
  const visibleExtra = useMemo(() => filterList(extraFeed), [filterList, extraFeed]);

  return (
    <div className="min-h-screen space-y-7 bg-[#0F0F0F] pb-24 text-white lg:pb-16">
      {/* Pull-to-Refresh YouTube Floating Spinner Indicator */}
      {(pullPx > 8 || refreshing) && (
        <div
          className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.14] bg-[#212121]/95 px-4 py-2 text-[12px] font-bold text-white shadow-2xl backdrop-blur-md transition-transform"
          style={{
            transform: `translate(-50%, ${refreshing ? 12 : Math.round(pullPx * 0.45)}px)`,
          }}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing || pullPx >= 58 ? 'animate-spin text-[#FF0000]' : 'text-[#AAAAAA]'
            }`}
            style={
              !refreshing && pullPx < 58 ? { transform: `rotate(${pullPx * 4}deg)` } : undefined
            }
          />
          <span>
            {refreshing
              ? 'Finding fresh picks…'
              : pullPx >= 58
                ? 'Release to refresh'
                : 'Pull down for new picks'}
          </span>
        </div>
      )}

      {/* YouTube Category Chips Bar */}
      <div className="sticky top-14 z-30 flex items-center gap-2.5 overflow-x-auto border-b border-white/[0.06] bg-[#0F0F0F]/95 px-4 py-3 backdrop-blur-xl no-scrollbar sm:px-6 lg:px-8">
        {chips.map((chip) => {
          const isSelected = selectedChip === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setSelectedChip(chip)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                isSelected
                  ? 'bg-[#F1F1F1] font-semibold text-[#0F0F0F]'
                  : 'bg-[#272727] text-[#F1F1F1] hover:bg-[#3F3F3F]'
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* For You Header + Accessible Anime | Manga Mode Switch (Refresh works via pull/scroll at top like YouTube) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-white sm:text-[22px]">
            {selectedChip === 'All'
              ? isManga
                ? 'For You · Manga & Manhwa'
                : 'For You'
              : selectedChip}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-[#AAAAAA]">
            {trackedCount > 0
              ? `Tuned to ${genresLabel || 'your subscriptions'} · Scroll up at top to refresh`
              : `Subscribe to ${isManga ? 'manga' : 'anime'} · Pull down at top for fresh picks`}
          </p>
        </div>

        <div
          className="flex shrink-0 items-center rounded-full border border-white/[0.12] bg-[#181818] p-1"
          role="group"
          aria-label="Switch between Anime and Manga"
        >
          <button
            type="button"
            onClick={() => onMediaTypeChange('ANIME')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
              mediaType === 'ANIME'
                ? 'bg-[#FF0000] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Anime
          </button>
          <button
            type="button"
            onClick={() => onMediaTypeChange('MANGA')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
              mediaType === 'MANGA'
                ? 'bg-[#FF0000] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Manga
          </button>
        </div>
      </div>

      {/* Inline Home Search Results when Home's Search Bar has input */}
      {query.trim().length > 0 ? (
        <section className="space-y-4 px-4 pt-3 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-[19px] font-bold text-white sm:text-[21px]">
              Home results for &ldquo;{query.trim()}&rdquo;
            </h1>
            <p className="text-[12px] text-[#AAAAAA]">
              Searching {isManga ? 'manga' : 'anime'} in Home without overwriting other tabs
            </p>
          </div>
          {searching ? (
            <GridSkeleton count={8} mediaType={mediaType} />
          ) : !searchResults || searchResults.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-10 text-center text-[#AAAAAA]">
              <p className="text-[14px] font-bold text-white">No matches found</p>
              <p className="mt-1 text-[12px]">Try a shorter title or keyword.</p>
            </div>
          ) : (
            <div className={gridClass}>
              {searchResults.map((anime, index) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  onOpen={onOpen}
                  onOpenChannel={onOpenChannel}
                  status={library.entries[anime.id]?.status}
                  onQuickAdd={onQuickAdd}
                  priority={index < 8}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Zero-Login Onboarding Banner */}
      {showOnboarding && (
        <section className="mx-4 sm:mx-6 lg:mx-8">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-br from-[#FF0000]/15 via-[#181818] to-[#121212] p-5 shadow-xl">
            <button
              type="button"
              onClick={dismissOnboarding}
              aria-label="Dismiss"
              className="absolute right-3 top-3 rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#FF0000]">
              <Sparkles className="h-3.5 w-3.5" />
              Train Your Algorithm
            </div>
            <h2 className="mt-1.5 max-w-xl text-[16px] font-bold leading-snug text-white sm:text-lg">
              Pick a few genres you enjoy, or import your AniList / MyAnimeList username in one click.
            </h2>
            <p className="mt-1 text-[12px] text-[#AAAAAA]">
              Works without any account. Everything stays stored offline on your device.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {genreOptions.slice(0, 12).map((genre) => {
                const active = activeInterests.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => libraryStore.toggleInterest(genre, mediaType)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                      active
                        ? 'bg-[#FF0000] font-semibold text-white'
                        : 'bg-[#272727] text-neutral-200 hover:bg-[#383838]'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenTrackers}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-black transition hover:bg-neutral-200"
              >
                <Upload className="h-3.5 w-3.5 text-[#FF0000]" />
                Connect AniList / MAL
              </button>
              <button
                type="button"
                onClick={dismissOnboarding}
                className="text-[12px] font-semibold text-[#AAAAAA] hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Top Personalized Feed */}
      <section className="px-4 sm:px-6 lg:px-8">
        {loading ? (
          <GridSkeleton count={8} mediaType={mediaType} />
        ) : error ? (
          <div className="rounded-2xl border border-white/10 bg-[#1F1F1F] p-8 text-center">
            <p className="text-[14px] text-[#AAAAAA]">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshToken((v) => v + 1)}
              className="mt-3 rounded-full bg-[#FF0000] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#CC0000]"
            >
              Try Again
            </button>
          </div>
        ) : visibleInitial.length === 0 ? (
          <div className="py-12 text-center text-[#AAAAAA]">
            <p className="text-[14px] font-semibold">No recommendations found in this filter yet.</p>
            <button
              type="button"
              onClick={() => setSelectedChip('All')}
              className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              Show All
            </button>
          </div>
        ) : (
          <div className={gridClass}>
            {visibleInitial.map((item, index) => (
              <AnimeCard
                key={item.anime.id}
                anime={item.anime}
                onOpen={onOpen}
                onOpenChannel={onOpenChannel}
                reason={item.reason}
                status={library.entries[item.anime.id]?.status}
                onQuickAdd={onQuickAdd}
                priority={index < 8}
              />
            ))}
          </div>
        )}
      </section>

      {/* Continue Watching / Subscribed Row */}
      {bundle && bundle.continueWatching.length > 0 && selectedChip === 'All' && (
        <Shelf
          title={isManga ? 'Continue Reading' : 'Your Subscriptions'}
          subtitle="Resume where you left off"
          action={
            <button
              type="button"
              onClick={() => onNavigate('list')}
              className="flex items-center gap-1 text-[12px] font-bold text-[#3EA6FF] hover:underline"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        >
          {bundle.continueWatching.map((anime) => {
            const entry = library.entries[anime.id];
            const totalCount = isManga ? anime.chapters : anime.episodes;
            return (
              <ShelfItem key={anime.id} width={shelfWidth}>
                <AnimeCard
                  anime={anime}
                  onOpen={onOpen}
                  onOpenChannel={onOpenChannel}
                  status={entry?.status}
                  progress={entry?.progress ? { watched: entry.progress, total: totalCount } : undefined}
                  onQuickAdd={onQuickAdd}
                />
              </ShelfItem>
            );
          })}
        </Shelf>
      )}

      {/* Curated Discovery & "Because You Subscribed" Shelves */}
      {bundle &&
        selectedChip === 'All' &&
        bundle.shelves.map((shelf) => (
          <Shelf key={shelf.id} title={shelf.title} subtitle={shelf.subtitle}>
            {shelf.items.map((anime) => (
              <ShelfItem key={anime.id} width={shelfWidth}>
                <AnimeCard
                  anime={anime}
                  onOpen={onOpen}
                  onOpenChannel={onOpenChannel}
                  status={library.entries[anime.id]?.status}
                  onQuickAdd={onQuickAdd}
                />
              </ShelfItem>
            ))}
          </Shelf>
        ))}

      {/* Infinite YouTube Feed Below Shelves (Zero Repeats!) */}
      {visibleExtra.length > 0 && (
        <section className="space-y-4 px-4 sm:px-6 lg:px-8">
          <h2 className="text-[17px] font-bold text-white">More Recommended for You</h2>
          <div className={gridClass}>
            {visibleExtra.map((item) => (
              <AnimeCard
                key={item.anime.id}
                anime={item.anime}
                onOpen={onOpen}
                onOpenChannel={onOpenChannel}
                reason={item.reason}
                status={library.entries[item.anime.id]?.status}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        </section>
      )}

      {/* Infinite Scroll Sentinel */}
      {!loading && hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-[#AAAAAA]">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF0000]" />
              Loading more personalized picks…
            </div>
          ) : (
            <button
              type="button"
              onClick={loadMoreFeed}
              className="rounded-full bg-[#272727] px-5 py-2 text-xs font-bold text-white hover:bg-[#383838]"
            >
              Load More Recommendations
            </button>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};
