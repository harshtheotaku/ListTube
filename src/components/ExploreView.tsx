import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Compass,
  Filter,
  Loader2,
  SearchX,
  Sparkles,
  X,
} from 'lucide-react';
import { Anime, LibraryState, MediaType } from '../types';
import {
  ANIME_GENRES,
  MANGA_GENRES,
  MAL_DEMOGRAPHICS,
  MAL_THEMES,
  currentSeason,
  fetchByGenre,
  fetchByTag,
  fetchMostFavorited,
  fetchPopular,
  fetchReleasing,
  fetchSeasonal,
  fetchTopRated,
  fetchTrending,
  fetchUpcoming,
  queryMedia,
} from '../services/anilist';
import { searchSmart } from '../services/search';
import { AnimeCard } from './AnimeCard';
import { Shelf } from './Shelf';
import { GridSkeleton } from './Skeleton';

type CatalogChartKey =
  | 'mal_home'
  | 'trending'
  | 'top'
  | 'popular'
  | 'favorited'
  | 'seasonal'
  | 'top_airing'
  | 'upcoming'
  | 'top_tv'
  | 'top_movies'
  | 'top_ova'
  | 'publishing'
  | 'manga_jp'
  | 'manhwa_kr'
  | 'manhua_cn'
  | 'novels'
  | 'oneshots';

type DirectoryGroup = 'genres' | 'themes' | 'demographics';
type SeasonName = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

interface ExploreViewProps {
  library: LibraryState;
  mediaType: MediaType;
  query: string;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onQuickAdd: (anime: Anime) => void;
}

interface CatalogShelfData {
  id: string;
  chartKey: CatalogChartKey;
  title: string;
  subtitle: string;
  items: Anime[];
}

const YOUTUBE_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const SEASONS: SeasonName[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_LABEL: Record<SeasonName, string> = {
  WINTER: 'Winter',
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
};

export const ExploreView: React.FC<ExploreViewProps> = ({
  library,
  mediaType,
  query,
  onOpen,
  onOpenChannel,
  onQuickAdd,
}) => {
  const defaultSeason = useMemo(() => currentSeason(), []);
  const [chart, setChart] = useState<CatalogChartKey>('mal_home');
  const [dirGroup, setDirGroup] = useState<DirectoryGroup>('genres');
  const [directoryExpanded, setDirectoryExpanded] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<{ season: SeasonName; year: number } | null>(
    null
  );

  const [shelves, setShelves] = useState<CatalogShelfData[]>([]);
  const [shelvesLoading, setShelvesLoading] = useState(true);

  const [items, setItems] = useState<Anime[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState(query);
  const requestId = useRef(0);
  const shelfReqId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const isManga = mediaType === 'MANGA';
  const genres = isManga ? MANGA_GENRES : ANIME_GENRES;

  const gridClass = isManga
    ? 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
    : YOUTUBE_GRID;

  const charts: { id: CatalogChartKey; label: string }[] = isManga
    ? [
        { id: 'mal_home', label: 'MAL Catalog' },
        { id: 'publishing', label: 'Top Publishing' },
        { id: 'manga_jp', label: 'Top Manga (JP)' },
        { id: 'manhwa_kr', label: 'Top Manhwa (KR)' },
        { id: 'manhua_cn', label: 'Top Manhua (CN)' },
        { id: 'novels', label: 'Light Novels' },
        { id: 'oneshots', label: 'One-Shots' },
        { id: 'trending', label: 'Trending' },
        { id: 'popular', label: 'Most Popular' },
        { id: 'favorited', label: 'Most Favorited' },
        { id: 'top', label: 'All-Time Top' },
      ]
    : [
        { id: 'mal_home', label: 'MAL Catalog' },
        { id: 'seasonal', label: `${SEASON_LABEL[defaultSeason.season]} ${defaultSeason.year}` },
        { id: 'top_airing', label: 'Top Airing' },
        { id: 'upcoming', label: 'Top Upcoming' },
        { id: 'top_tv', label: 'Top TV Series' },
        { id: 'top_movies', label: 'Top Movies' },
        { id: 'top_ova', label: 'OVAs & Specials' },
        { id: 'trending', label: 'Trending' },
        { id: 'popular', label: 'Most Popular' },
        { id: 'favorited', label: 'Most Favorited' },
        { id: 'top', label: 'All-Time Top' },
      ];

  useEffect(() => {
    setChart('mal_home');
    setSelectedGenre(null);
    setSelectedTag(null);
    setSelectedSeason(null);
    setDirectoryExpanded(false);
  }, [mediaType]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 240);
    return () => clearTimeout(timer);
  }, [query]);

  const isCatalogHome =
    !debounced.trim() &&
    chart === 'mal_home' &&
    !selectedGenre &&
    !selectedTag &&
    !selectedSeason;

  // Load MAL-style homepage shelves when on MAL Catalog overview
  useEffect(() => {
    if (!isCatalogHome) {
      setShelvesLoading(false);
      return;
    }

    const req = ++shelfReqId.current;
    setShelvesLoading(true);

    const loadShelves = async () => {
      try {
        if (isManga) {
          const [publishing, manhwa, mangaJp, novels, favorited] = await Promise.all([
            fetchReleasing(14, 'MANGA', 1),
            queryMedia({
              mediaType: 'MANGA',
              countryOfOrigin: 'KR',
              sort: ['POPULARITY_DESC', 'SCORE_DESC'],
              perPage: 14,
            }),
            queryMedia({
              mediaType: 'MANGA',
              countryOfOrigin: 'JP',
              formats: ['MANGA'],
              sort: ['SCORE_DESC'],
              perPage: 14,
            }),
            queryMedia({
              mediaType: 'MANGA',
              formats: ['NOVEL'],
              sort: ['SCORE_DESC', 'POPULARITY_DESC'],
              perPage: 14,
            }),
            fetchMostFavorited(14, 'MANGA', 1),
          ]);
          if (req !== shelfReqId.current) return;
          setShelves([
            {
              id: 'shelf-pub',
              chartKey: 'publishing',
              title: 'Top Publishing Manga & Webtoons',
              subtitle: 'Ongoing fan-favorite serializations',
              items: publishing,
            },
            {
              id: 'shelf-manhwa',
              chartKey: 'manhwa_kr',
              title: 'Top Manhwa (South Korea)',
              subtitle: 'Highest-rated full-color vertical scrolls',
              items: manhwa,
            },
            {
              id: 'shelf-jp',
              chartKey: 'manga_jp',
              title: 'Top Ranked Japanese Manga',
              subtitle: 'Critically acclaimed print classics & hits',
              items: mangaJp,
            },
            {
              id: 'shelf-novels',
              chartKey: 'novels',
              title: 'Top Light Novels',
              subtitle: 'Original novels behind hit anime adaptations',
              items: novels,
            },
            {
              id: 'shelf-fav',
              chartKey: 'favorited',
              title: 'Most Favorited on MAL & AniList',
              subtitle: 'All-time community favorites',
              items: favorited,
            },
          ]);
        } else {
          const [seasonal, airing, upcoming, movies, favorited] = await Promise.all([
            fetchSeasonal(14, 'ANIME', 1),
            fetchReleasing(14, 'ANIME', 1),
            fetchUpcoming(14, 'ANIME', 1),
            queryMedia({
              mediaType: 'ANIME',
              formats: ['MOVIE'],
              sort: ['SCORE_DESC'],
              perPage: 14,
            }),
            fetchMostFavorited(14, 'ANIME', 1),
          ]);
          if (req !== shelfReqId.current) return;
          setShelves([
            {
              id: 'shelf-season',
              chartKey: 'seasonal',
              title: `${SEASON_LABEL[defaultSeason.season]} ${defaultSeason.year} Anime`,
              subtitle: 'MAL Seasonal Chart Highlights',
              items: seasonal,
            },
            {
              id: 'shelf-airing',
              chartKey: 'top_airing',
              title: 'Top Airing Anime',
              subtitle: 'Highest scored shows broadcasting now',
              items: airing,
            },
            {
              id: 'shelf-upcoming',
              chartKey: 'upcoming',
              title: 'Top Upcoming Anime',
              subtitle: 'Most anticipated unreleased announcements',
              items: upcoming,
            },
            {
              id: 'shelf-movies',
              chartKey: 'top_movies',
              title: 'Top Ranked Anime Movies',
              subtitle: 'Theatrical features & box office classics',
              items: movies,
            },
            {
              id: 'shelf-fav',
              chartKey: 'favorited',
              title: 'Most Favorited All-Time',
              subtitle: 'Locked into community top lists',
              items: favorited,
            },
          ]);
        }
      } catch {
        /* infinite grid below handles retry cleanly */
      } finally {
        if (req === shelfReqId.current) setShelvesLoading(false);
      }
    };

    void loadShelves();
  }, [isCatalogHome, isManga, defaultSeason.season, defaultSeason.year]);

  const loadGrid = useCallback(
    async (targetPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setHasMore(false);
      }
      setError(null);

      try {
        const searchTerm = debounced.trim();
        let result: Anime[] = [];

        if (searchTerm) {
          result = await searchSmart(searchTerm, mediaType, 24);
        } else if (selectedTag) {
          result = await fetchByTag(selectedTag, 24, ['POPULARITY_DESC', 'SCORE_DESC'], mediaType, targetPage);
        } else if (selectedGenre) {
          result = await fetchByGenre(
            selectedGenre,
            24,
            ['SCORE_DESC', 'POPULARITY_DESC'],
            mediaType,
            targetPage
          );
        } else if (selectedSeason && !isManga) {
          result = await fetchSeasonal(24, 'ANIME', targetPage, selectedSeason.season, selectedSeason.year);
        } else {
          switch (chart) {
            case 'top':
              result = await fetchTopRated(24, mediaType, targetPage);
              break;
            case 'popular':
              result = await fetchPopular(24, mediaType, targetPage);
              break;
            case 'favorited':
              result = await fetchMostFavorited(24, mediaType, targetPage);
              break;
            case 'seasonal':
              result = await fetchSeasonal(24, 'ANIME', targetPage);
              break;
            case 'top_airing':
            case 'publishing':
              result = await fetchReleasing(24, mediaType, targetPage);
              break;
            case 'upcoming':
              result = await fetchUpcoming(24, mediaType, targetPage);
              break;
            case 'top_tv':
              result = await queryMedia({
                mediaType: 'ANIME',
                formats: ['TV'],
                sort: ['SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'top_movies':
              result = await queryMedia({
                mediaType: 'ANIME',
                formats: ['MOVIE'],
                sort: ['SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'top_ova':
              result = await queryMedia({
                mediaType: 'ANIME',
                formats: ['OVA', 'ONA', 'SPECIAL'],
                sort: ['SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'manga_jp':
              result = await queryMedia({
                mediaType: 'MANGA',
                countryOfOrigin: 'JP',
                formats: ['MANGA'],
                sort: ['SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'manhwa_kr':
              result = await queryMedia({
                mediaType: 'MANGA',
                countryOfOrigin: 'KR',
                sort: ['POPULARITY_DESC', 'SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'manhua_cn':
              result = await queryMedia({
                mediaType: 'MANGA',
                countryOfOrigin: 'CN',
                sort: ['POPULARITY_DESC', 'SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'novels':
              result = await queryMedia({
                mediaType: 'MANGA',
                formats: ['NOVEL'],
                sort: ['SCORE_DESC', 'POPULARITY_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'oneshots':
              result = await queryMedia({
                mediaType: 'MANGA',
                formats: ['ONE_SHOT'],
                sort: ['SCORE_DESC'],
                perPage: 24,
                page: targetPage,
              });
              break;
            case 'trending':
              result = await fetchTrending(24, targetPage, mediaType);
              break;
            case 'mal_home':
            default:
              result = await fetchPopular(24, mediaType, targetPage);
              break;
          }
        }

        if (id !== requestId.current) return;

        setItems((previous) => {
          if (!append) return result;
          const seen = new Set(previous.map((a) => a.id));
          return [...previous, ...result.filter((a) => !seen.has(a.id))];
        });
        setPage(targetPage);
        setHasMore(!searchTerm && result.length >= 18);
      } catch (err) {
        if (id === requestId.current) {
          console.warn('[explore] failed to load', err);
          setError('Failed to load catalog results. Please check connection.');
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debounced, selectedGenre, selectedTag, selectedSeason, chart, mediaType, isManga]
  );

  useEffect(() => {
    setPage(1);
    loadGrid(1, false);
  }, [loadGrid]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadGrid(page + 1, true);
        }
      },
      { rootMargin: '500px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, loadGrid]);

  const activeLabel = useMemo(() => {
    if (debounced.trim()) return `Results for "${debounced.trim()}"`;
    if (selectedGenre) return `${selectedGenre} · MAL ${isManga ? 'Manga' : 'Anime'} Directory`;
    if (selectedTag) return `${selectedTag} · ${isManga ? 'Manga' : 'Anime'} Directory`;
    if (selectedSeason) {
      return `${SEASON_LABEL[selectedSeason.season]} ${selectedSeason.year} Seasonal Chart`;
    }
    if (chart === 'mal_home') return `More Top & Popular ${isManga ? 'Manga' : 'Anime'}`;
    return charts.find((c) => c.id === chart)?.label ?? 'Explore';
  }, [debounced, selectedGenre, selectedTag, selectedSeason, chart, isManga, charts]);

  const hasActiveFilter = Boolean(
    debounced.trim() || selectedGenre || selectedTag || selectedSeason || chart !== 'mal_home'
  );

  const clearAllFilters = () => {
    setChart('mal_home');
    setSelectedGenre(null);
    setSelectedTag(null);
    setSelectedSeason(null);
  };

  const quickDirectoryItems =
    dirGroup === 'genres'
      ? genres
      : dirGroup === 'themes'
      ? MAL_THEMES
      : MAL_DEMOGRAPHICS;

  const yearChoices = [defaultSeason.year + 1, defaultSeason.year, defaultSeason.year - 1, defaultSeason.year - 2];

  return (
    <div className="min-h-screen space-y-6 bg-[#0F0F0F] pb-24 text-white lg:pb-16">
      {/* Sticky MAL Chart & Directory Bar */}
      <div className="sticky top-14 z-30 space-y-2.5 border-b border-white/[0.06] bg-[#0F0F0F]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
        {/* Row 1: MAL Ranking Charts */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {charts.map((c) => {
            const isSelected =
              !debounced.trim() &&
              !selectedGenre &&
              !selectedTag &&
              !selectedSeason &&
              chart === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedGenre(null);
                  setSelectedTag(null);
                  setSelectedSeason(null);
                  setChart(c.id);
                }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  isSelected
                    ? 'bg-[#F1F1F1] text-[#0F0F0F]'
                    : 'bg-[#272727] text-[#F1F1F1] hover:bg-[#3F3F3F]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Row 2: MAL Directory Quick Switcher (Genres / Themes / Demographics + Full Directory Toggle) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className="flex shrink-0 items-center rounded-lg border border-white/[0.1] bg-[#181818] p-0.5 text-[11px] font-bold">
            {(['genres', 'themes', 'demographics'] as DirectoryGroup[]).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setDirGroup(grp)}
                className={`rounded-md px-2.5 py-1 capitalize transition ${
                  dirGroup === grp ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDirectoryExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.12] bg-[#222222] px-3 py-1 text-[11.5px] font-semibold text-white transition hover:bg-[#303030]"
          >
            <Filter className="h-3 w-3 text-[#3EA6FF]" />
            <span>MAL Directory</span>
            {directoryExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {quickDirectoryItems.map((entry) => {
            const isGenre = dirGroup === 'genres';
            const active = isGenre ? selectedGenre === entry : selectedTag === entry;
            return (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setSelectedSeason(null);
                  setChart('mal_home');
                  if (isGenre) {
                    setSelectedTag(null);
                    setSelectedGenre(active ? null : entry);
                  } else {
                    setSelectedGenre(null);
                    setSelectedTag(active ? null : entry);
                  }
                }}
                className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
                  active
                    ? 'bg-[#FF0000] font-bold text-white'
                    : 'bg-white/[0.05] text-[#AAAAAA] hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {entry}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expandable Full MAL Homepage Catalog Directory Matrix (Genres + Themes + Demographics + Seasons) */}
      {directoryExpanded && (
        <section className="mx-4 rounded-2xl border border-white/[0.1] bg-[#161616] p-4 sm:mx-6 sm:p-5 lg:mx-8">
          <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-wider text-white">
              <Compass className="h-4 w-4 text-[#FF0000]" />
              MyAnimeList {isManga ? 'Manga' : 'Anime'} Directory
            </h2>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                <X className="h-3 w-3" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                Genres
              </p>
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setSelectedTag(null);
                      setSelectedSeason(null);
                      setSelectedGenre(selectedGenre === g ? null : g);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                      selectedGenre === g
                        ? 'bg-[#FF0000] text-white font-bold'
                        : 'bg-[#242424] text-neutral-200 hover:bg-[#323232]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                Themes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MAL_THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSelectedGenre(null);
                      setSelectedSeason(null);
                      setSelectedTag(selectedTag === t ? null : t);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                      selectedTag === t
                        ? 'bg-[#FF0000] text-white font-bold'
                        : 'bg-[#242424] text-neutral-200 hover:bg-[#323232]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Demographics
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MAL_DEMOGRAPHICS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setSelectedGenre(null);
                        setSelectedSeason(null);
                        setSelectedTag(selectedTag === d ? null : d);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                        selectedTag === d
                          ? 'bg-[#FF0000] text-white font-bold'
                          : 'bg-[#242424] text-neutral-200 hover:bg-[#323232]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {!isManga && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                    <Calendar className="h-3.5 w-3.5 text-[#3EA6FF]" />
                    Seasonal Archive
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {yearChoices.slice(0, 3).map((yr) =>
                      SEASONS.map((sn) => {
                        const active =
                          selectedSeason?.year === yr && selectedSeason?.season === sn;
                        return (
                          <button
                            key={`${yr}-${sn}`}
                            type="button"
                            onClick={() => {
                              setSelectedGenre(null);
                              setSelectedTag(null);
                              setSelectedSeason({ season: sn, year: yr });
                            }}
                            className={`rounded-lg px-1.5 py-1 text-[10.5px] font-semibold transition ${
                              active
                                ? 'bg-[#3EA6FF] text-black font-bold'
                                : 'bg-[#242424] text-neutral-300 hover:bg-[#323232]'
                            }`}
                          >
                            {SEASON_LABEL[sn].slice(0, 3)} {yr}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MAL Homepage Catalog Shelves (Shown cleanly on Catalog Home view) */}
      {isCatalogHome && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div>
              <h1 className="flex items-center gap-2 text-[20px] font-bold tracking-tight text-white sm:text-[22px]">
                <Sparkles className="h-5 w-5 text-[#FF0000]" />
                {isManga ? 'Manga & Webtoon Homepage Catalog' : 'Anime Homepage Catalog'}
              </h1>
              <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
                MyAnimeList seasonal highlights, top rankings, formats, themes &amp; demographics
              </p>
            </div>
            {!isManga && (
              <div className="flex items-center gap-1.5">
                {SEASONS.map((sn) => (
                  <button
                    key={sn}
                    type="button"
                    onClick={() => {
                      setSelectedGenre(null);
                      setSelectedTag(null);
                      setSelectedSeason({ season: sn, year: defaultSeason.year });
                    }}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                      defaultSeason.season === sn
                        ? 'bg-[#FF0000]/20 text-rose-300 border border-[#FF0000]/40'
                        : 'bg-[#222222] text-[#AAAAAA] hover:text-white'
                    }`}
                  >
                    {SEASON_LABEL[sn]} {defaultSeason.year}
                  </button>
                ))}
              </div>
            )}
          </div>

          {shelvesLoading ? (
            <div className="px-4 sm:px-6 lg:px-8">
              <GridSkeleton count={8} mediaType={mediaType} />
            </div>
          ) : (
            shelves
              .filter((s) => s.items.length > 0)
              .map((shelf) => (
                <Shelf
                  key={shelf.id}
                  title={shelf.title}
                  subtitle={shelf.subtitle}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGenre(null);
                        setSelectedTag(null);
                        setSelectedSeason(null);
                        setChart(shelf.chartKey);
                      }}
                      className="rounded-full bg-[#272727] px-3 py-1 text-[11.5px] font-bold text-[#3EA6FF] transition hover:bg-[#383838]"
                    >
                      View all
                    </button>
                  }
                >
                  {shelf.items.map((anime, index) => (
                    <div
                      key={anime.id}
                      className={
                        anime.mediaType === 'MANGA'
                          ? 'w-[44vw] shrink-0 snap-start sm:w-[190px] md:w-[205px]'
                          : 'w-[76vw] shrink-0 snap-start sm:w-[260px] md:w-[280px]'
                      }
                    >
                      <AnimeCard
                        anime={anime}
                        onOpen={onOpen}
                        onOpenChannel={onOpenChannel}
                        status={library.entries[anime.id]?.status}
                        onQuickAdd={onQuickAdd}
                        priority={index < 4}
                      />
                    </div>
                  ))}
                </Shelf>
              ))
          )}
        </div>
      )}

      {/* Active Filtered Header OR Bottom Infinite Grid Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight text-white sm:text-[21px]">
            {activeLabel}
          </h2>
          <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
            Infinite catalog browsing synced with AniList &amp; MyAnimeList
          </p>
        </div>
        {hasActiveFilter && !debounced.trim() && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            <X className="h-3.5 w-3.5 text-[#FF0000]" />
            Back to MAL Catalog
          </button>
        )}
      </div>

      {/* Infinite Catalog Grid */}
      <div className="px-4 sm:px-6 lg:px-8">
        {loading ? (
          <GridSkeleton count={12} mediaType={mediaType} />
        ) : error ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-8 text-center text-[#AAAAAA]">
            <p className="text-[13px]">{error}</p>
            <button
              type="button"
              onClick={() => loadGrid(1, false)}
              className="mt-3 rounded-full bg-[#FF0000] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#CC0000]"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-12 text-center text-[#AAAAAA]">
            <SearchX className="mx-auto mb-3 h-12 w-12 text-[#AAAAAA]/40" />
            <p className="text-[14px] font-bold text-white">No titles found</p>
            <p className="mt-1 text-[12px] text-[#AAAAAA]">
              Try a partial title or reset catalog filters.
            </p>
          </div>
        ) : (
          <div className={gridClass}>
            {items.map((anime, index) => (
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
                onClick={() => loadGrid(page + 1, true)}
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
