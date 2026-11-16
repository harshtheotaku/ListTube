import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SearchX } from 'lucide-react';
import { Anime, LibraryState, MediaType } from '../types';
import {
  ANIME_GENRES,
  MANGA_GENRES,
  fetchByGenre,
  fetchPopular,
  fetchSeasonal,
  fetchTopRated,
  fetchTrending,
} from '../services/anilist';
import { searchSmart } from '../services/search';
import { AnimeCard } from './AnimeCard';
import { GridSkeleton } from './Skeleton';

type SortKey = 'trending' | 'top' | 'new' | 'popular';

interface ExploreViewProps {
  library: LibraryState;
  mediaType: MediaType;
  query: string;
  onOpen: (anime: Anime) => void;
  onQuickAdd: (anime: Anime) => void;
}

const YOUTUBE_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export const ExploreView: React.FC<ExploreViewProps> = ({
  library,
  mediaType,
  query,
  onOpen,
  onQuickAdd,
}) => {
  const [genre, setGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('trending');
  const [items, setItems] = useState<Anime[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState(query);
  const requestId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const isManga = mediaType === 'MANGA';
  const genres = isManga ? MANGA_GENRES : ANIME_GENRES;

  const sorts: { id: SortKey; label: string }[] = [
    { id: 'trending', label: '🔥 Trending' },
    { id: 'top', label: '⭐ Top Rated' },
    ...(isManga ? [] : [{ id: 'new' as SortKey, label: '🌸 This Season' }]),
    { id: 'popular', label: '👑 All-Time Popular' },
  ];

  useEffect(() => {
    setGenre(null);
    setSort('trending');
  }, [mediaType]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 240);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const searchTerm = debounced.trim();
        let result: Anime[] = [];

        if (searchTerm) {
          result = await searchSmart(searchTerm, mediaType, 24);
        } else if (genre) {
          result = await fetchByGenre(
            genre,
            24,
            sort === 'top' ? ['SCORE_DESC'] : ['POPULARITY_DESC'],
            mediaType,
            targetPage
          );
        } else if (sort === 'top') {
          result = await fetchTopRated(24, mediaType, targetPage);
        } else if (sort === 'new') {
          result = await fetchSeasonal(24, mediaType, targetPage);
        } else if (sort === 'popular') {
          result = await fetchPopular(24, mediaType, targetPage);
        } else {
          result = await fetchTrending(24, targetPage, mediaType);
        }

        if (id !== requestId.current) return;

        setItems((previous) => {
          if (!append) return result;
          const seen = new Set(previous.map((a) => a.id));
          return [...previous, ...result.filter((a) => !seen.has(a.id))];
        });
        setPage(targetPage);
        setHasMore(!searchTerm && result.length >= 20);
      } catch (err) {
        if (id === requestId.current) {
          console.warn('[explore] failed to load', err);
          setError('Failed to load results. Please check connection.');
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debounced, genre, sort, mediaType]
  );

  useEffect(() => {
    setPage(1);
    load(1, false);
  }, [load]);

  // Infinite scroll trigger
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          load(page + 1, true);
        }
      },
      { rootMargin: '500px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, load]);

  const activeLabel = useMemo(() => {
    if (debounced.trim()) return `Results for "${debounced.trim()}"`;
    if (genre) return `${genre} ${isManga ? 'Manga' : 'Anime'}`;
    return sorts.find((s) => s.id === sort)?.label ?? 'Explore';
  }, [debounced, genre, sort, isManga]);

  return (
    <div className="min-h-screen space-y-6 bg-[#0F0F0F] pb-24 text-white lg:pb-16">
      {/* Sticky Filter & Genre Chips */}
      <div className="sticky top-14 z-30 space-y-2.5 border-b border-white/[0.06] bg-[#0F0F0F]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {sorts.map((s) => {
            const isSelected = !debounced.trim() && !genre && sort === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setGenre(null);
                  setSort(s.id);
                }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  isSelected
                    ? 'bg-[#F1F1F1] font-semibold text-[#0F0F0F]'
                    : 'bg-[#272727] text-[#F1F1F1] hover:bg-[#3F3F3F]'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setGenre(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
              genre === null
                ? 'bg-white/20 font-bold text-white'
                : 'bg-white/[0.05] text-[#AAAAAA] hover:text-white'
            }`}
          >
            All Genres
          </button>
          {genres.map((g) => {
            const isSelected = genre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(isSelected ? null : g)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
                  isSelected
                    ? 'bg-[#FF0000] font-bold text-white'
                    : 'bg-white/[0.05] text-[#AAAAAA] hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8">
        <h1 className="text-[20px] font-bold tracking-tight text-white sm:text-[22px]">
          {activeLabel}
        </h1>
        <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
          Infinite discovery across AniList and MyAnimeList
        </p>
      </div>

      {/* 16:9 YouTube Grid */}
      <div className="px-4 sm:px-6 lg:px-8">
        {loading ? (
          <GridSkeleton count={12} />
        ) : error ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-8 text-center text-[#AAAAAA]">
            <p className="text-[13px]">{error}</p>
            <button
              type="button"
              onClick={() => load(1, false)}
              className="mt-3 rounded-full bg-[#FF0000] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#CC0000]"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-12 text-center text-[#AAAAAA]">
            <SearchX className="mx-auto mb-3 h-12 w-12 text-[#AAAAAA]/40" />
            <p className="text-[14px] font-bold text-white">No titles found</p>
            <p className="mt-1 text-[12px] text-[#AAAAAA]">Try a partial title or reset filters.</p>
          </div>
        ) : (
          <div className={YOUTUBE_GRID}>
            {items.map((anime, index) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onOpen={onOpen}
                status={library.entries[anime.id]?.status}
                onQuickAdd={onQuickAdd}
                priority={index < 8}
              />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div ref={sentinelRef} className="mt-8 flex justify-center pb-6">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-[#AAAAAA]">
                <Loader2 className="h-4 w-4 animate-spin text-[#FF0000]" />
                Loading more titles…
              </div>
            ) : (
              <button
                type="button"
                onClick={() => load(page + 1, true)}
                className="rounded-full bg-[#272727] px-6 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#3F3F3F]"
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
