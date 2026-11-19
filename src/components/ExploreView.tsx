import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Compass,
  Filter,
  Loader2,
  SearchX,
  SlidersHorizontal,
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
  fetchByStudio,
  fetchMostFavorited,
  fetchPopular,
  fetchReleasing,
  fetchSeasonal,
  fetchTopRated,
  fetchTrending,
  fetchUpcoming,
  queryMedia,
  searchAniListStudios,
} from '../services/anilist';
import { searchSmart } from '../services/search';
import { passesContentSettings } from '../services/contentFilter';
import { fetchListTubeTopRanked } from '../services/communityStats';
import { gridClassFor, useSettings } from '../services/settings';
import { AnimeCard } from './AnimeCard';
import { Shelf } from './Shelf';
import { GridSkeleton } from './Skeleton';

type CatalogChartKey =
  | 'mal_home'
  | 'listtube_top'
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
  initialGenre?: string | null;
  onConsumeInitialGenre?: () => void;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onQuickAdd: (anime: Anime) => void;
  onOpenQuiz?: () => void;
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
  initialGenre,
  onConsumeInitialGenre,
  onOpen,
  onOpenChannel,
  onQuickAdd,
  onOpenQuiz,
}) => {
  const settings = useSettings();
  const defaultSeason = useMemo(() => currentSeason(), []);
  const [chart, setChart] = useState<CatalogChartKey>('mal_home');
  const [dirGroup, setDirGroup] = useState<DirectoryGroup>('genres');
  const [directoryExpanded, setDirectoryExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Multi-axis combinable filters (AniList / MAL Advanced Browse parity)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<{ season: SeasonName; year: number } | null>(
    null
  );
  const [filterFormat, setFilterFormat] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<
    '' | 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'HIATUS'
  >('');
  const [filterCountry, setFilterCountry] = useState<'' | 'JP' | 'KR' | 'CN'>('');
  const [filterYearMin, setFilterYearMin] = useState<number>(0);
  const [filterYearMax, setFilterYearMax] = useState<number>(0);
  const [filterMinScore, setFilterMinScore] = useState<number>(0);
  const [filterStudio, setFilterStudio] = useState<string>('');
  const [studioSuggestions, setStudioSuggestions] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<string>('POPULARITY_DESC');
  const [hideMyList, setHideMyList] = useState(false);

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

  useEffect(() => {
    if (!initialGenre) return;
    setSelectedGenres([initialGenre]);
    setSelectedTags([]);
    setSelectedSeason(null);
    setChart('mal_home');
    onConsumeInitialGenre?.();
  }, [initialGenre, onConsumeInitialGenre]);
  const genres = isManga ? MANGA_GENRES : ANIME_GENRES;

  const gridClass = gridClassFor(mediaType, settings.cardDensity);

  const charts: { id: CatalogChartKey; label: string }[] = isManga
    ? [
        { id: 'mal_home', label: 'MAL Catalog' },
        { id: 'listtube_top', label: 'ListTube Top' },
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
        { id: 'listtube_top', label: 'ListTube Top' },
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
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedSeason(null);
    setFilterFormat('');
    setFilterStatus('');
    setFilterCountry('');
    setFilterYearMin(0);
    setFilterYearMax(0);
    setFilterMinScore(0);
    setFilterStudio('');
    setFilterSort('POPULARITY_DESC');
    setHideMyList(false);
    setDirectoryExpanded(false);
  }, [mediaType]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 240);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const clean = filterStudio.trim();
    if (clean.length < 2) {
      setStudioSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchAniListStudios(clean, 10)
        .then((res) => {
          if (!cancelled) setStudioSuggestions(res);
        })
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filterStudio]);

  const multiAxisCount =
    selectedGenres.length +
    selectedTags.length +
    (selectedSeason ? 1 : 0) +
    (filterFormat ? 1 : 0) +
    (filterStatus ? 1 : 0) +
    (filterCountry ? 1 : 0) +
    (filterYearMin ? 1 : 0) +
    (filterYearMax ? 1 : 0) +
    (filterMinScore ? 1 : 0) +
    (filterStudio.trim() ? 1 : 0) +
    (filterSort !== 'POPULARITY_DESC' ? 1 : 0) +
    (hideMyList ? 1 : 0);

  const hasMultiAxisFilter = multiAxisCount > 0;

  const isCatalogHome =
    !debounced.trim() && chart === 'mal_home' && !hasMultiAxisFilter;

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

        if (searchTerm && !hasMultiAxisFilter) {
          result = await searchSmart(searchTerm, mediaType, 24);
        } else if (hasMultiAxisFilter && filterStudio.trim()) {
          const studioPool = await fetchByStudio(filterStudio.trim(), mediaType, new Set(), 36, targetPage);
          result = studioPool.filter((a) => {
            if (searchTerm && !`${a.title} ${a.titleRomaji ?? ''}`.toLowerCase().includes(searchTerm.toLowerCase())) {
              return false;
            }
            if (selectedGenres.length && !selectedGenres.every((g) => a.genres.includes(g))) return false;
            if (selectedTags.length && !selectedTags.some((t) => a.tags.includes(t))) return false;
            if (filterFormat && a.format !== filterFormat) return false;
            if (filterStatus && a.status !== filterStatus) return false;
            if (filterCountry && a.countryOfOrigin !== filterCountry) return false;
            if (filterYearMin && (!a.year || a.year < filterYearMin)) return false;
            if (filterYearMax && (!a.year || a.year > filterYearMax)) return false;
            if (filterMinScore && (!a.score || a.score < filterMinScore)) return false;
            return true;
          });
          if (filterSort === 'SCORE_DESC') result.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          else if (filterSort === 'START_DATE_DESC') result.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
          else if (filterSort === 'TITLE_ENGLISH') result.sort((a, b) => a.title.localeCompare(b.title));
        } else if (hasMultiAxisFilter) {
          const sortArr =
            searchTerm && filterSort === 'POPULARITY_DESC'
              ? ['SEARCH_MATCH', 'POPULARITY_DESC']
              : [filterSort, filterSort === 'SCORE_DESC' ? 'POPULARITY_DESC' : 'SCORE_DESC'];
          result = await queryMedia({
            mediaType,
            search: searchTerm || undefined,
            genres: selectedGenres.length ? selectedGenres : undefined,
            tags: selectedTags.length ? selectedTags : undefined,
            formats: filterFormat ? [filterFormat] : undefined,
            status: filterStatus || undefined,
            countryOfOrigin: filterCountry || undefined,
            season: !isManga && selectedSeason ? selectedSeason.season : undefined,
            seasonYear: !isManga && selectedSeason ? selectedSeason.year : undefined,
            yearMin: filterYearMin || undefined,
            yearMax: filterYearMax || undefined,
            minScore: filterMinScore || undefined,
            sort: sortArr,
            perPage: 24,
            page: targetPage,
          });
        } else {
          switch (chart) {
            case 'top':
              result = await fetchTopRated(24, mediaType, targetPage);
              break;
            case 'listtube_top': {
              const ranked = await fetchListTubeTopRanked(mediaType, 24);
              result = ranked.map((r) => r.anime);
              if (result.length === 0) {
                result = await fetchTopRated(24, mediaType, targetPage);
              }
              break;
            }
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

        const filtered = result.filter(
          (item) =>
            passesContentSettings(item, settings) &&
            (!hideMyList || !library.entries[item.id])
        );

        setItems((previous) => {
          if (!append) return filtered;
          const seen = new Set(previous.map((a) => a.id));
          return [...previous, ...filtered.filter((a) => !seen.has(a.id))];
        });
        setPage(targetPage);
        setHasMore((!searchTerm || hasMultiAxisFilter) && result.length >= 18);
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
    [
      debounced,
      hasMultiAxisFilter,
      selectedGenres,
      selectedTags,
      selectedSeason,
      filterFormat,
      filterStatus,
      filterCountry,
      filterYearMin,
      filterYearMax,
      filterMinScore,
      filterStudio,
      filterSort,
      hideMyList,
      chart,
      mediaType,
      isManga,
      library.entries,
      settings,
    ]
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

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const activeLabel = useMemo(() => {
    if (debounced.trim()) return `Results for "${debounced.trim()}"`;
    if (hasMultiAxisFilter) {
      const parts: string[] = [];
      if (selectedGenres.length) parts.push(selectedGenres.join(' + '));
      if (selectedTags.length) parts.push(selectedTags.join(' + '));
      if (filterFormat) parts.push(filterFormat);
      if (filterCountry) parts.push(filterCountry);
      if (selectedSeason) parts.push(`${SEASON_LABEL[selectedSeason.season]} ${selectedSeason.year}`);
      if (filterStudio.trim()) parts.push(filterStudio.trim());
      if (filterMinScore) parts.push(`${filterMinScore}★+`);
      if (filterYearMin || filterYearMax) {
        parts.push(`${filterYearMin || '...'}–${filterYearMax || '...'}`);
      }
      return parts.length
        ? `Filtered ${isManga ? 'Manga' : 'Anime'}: ${parts.join(' · ')}`
        : `Custom Filtered ${isManga ? 'Manga' : 'Anime'}`;
    }
    if (chart === 'mal_home') return `More Top & Popular ${isManga ? 'Manga' : 'Anime'}`;
    return charts.find((c) => c.id === chart)?.label ?? 'Explore';
  }, [
    debounced,
    hasMultiAxisFilter,
    selectedGenres,
    selectedTags,
    filterFormat,
    filterCountry,
    selectedSeason,
    filterMinScore,
    filterStudio,
    filterYearMin,
    filterYearMax,
    chart,
    isManga,
    charts,
  ]);

  const hasActiveFilter = Boolean(
    debounced.trim() || hasMultiAxisFilter || chart !== 'mal_home'
  );

  const clearAllFilters = () => {
    setChart('mal_home');
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedSeason(null);
    setFilterFormat('');
    setFilterStatus('');
    setFilterCountry('');
    setFilterYearMin(0);
    setFilterYearMax(0);
    setFilterMinScore(0);
    setFilterStudio('');
    setFilterSort('POPULARITY_DESC');
    setHideMyList(false);
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
      <div
        className={`sticky top-14 z-30 space-y-2.5 border-b px-4 py-3 sm:px-6 lg:px-8 ${
          settings.liquidGlass
            ? 'liquid-glass border-white/[0.15]'
            : 'border-white/[0.06] bg-[#0F0F0F]/95 backdrop-blur-xl'
        }`}
      >
        {/* Row 1: MAL Ranking Charts */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {charts.map((c) => {
            const isSelected =
              !debounced.trim() && !hasMultiAxisFilter && chart === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  clearAllFilters();
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

        {/* Row 2: MAL Directory + Multi-Axis Advanced Filter Trigger */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setAdvancedOpen((v) => !v);
              setDirectoryExpanded(false);
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-bold transition ${
              advancedOpen || multiAxisCount > 0
                ? 'border-[#FF0000] bg-[#FF0000]/15 text-white'
                : 'border-white/[0.12] bg-[#222222] text-white hover:bg-[#303030]'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3 text-[#FF0000]" />
            <span>Filters</span>
            {multiAxisCount > 0 && (
              <span className="rounded-full bg-[#FF0000] px-1.5 py-0.2 text-[9.5px] font-black text-white">
                {multiAxisCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectoryExpanded((v) => !v);
              setAdvancedOpen(false);
            }}
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

          {quickDirectoryItems.map((entry) => {
            const isGenre = dirGroup === 'genres';
            const active = isGenre
              ? selectedGenres.includes(entry)
              : selectedTags.includes(entry);
            return (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setChart('mal_home');
                  if (isGenre) toggleGenre(entry);
                  else toggleTag(entry);
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

      {/* Quiz & Jeopardy Dedicated Page Launcher right below Explore Bar */}
      {onOpenQuiz && (
        <section className="mx-4 sm:mx-6 lg:mx-8">
          <button
            type="button"
            onClick={onOpenQuiz}
            className="lt-press flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FF0000]/30 bg-gradient-to-r from-[#FF0000]/15 via-[#18181B] to-[#3EA6FF]/15 px-4 py-3 text-left transition hover:border-[#FF0000]/55"
          >
            <div>
              <p className="text-[13.5px] font-extrabold text-white">
                Anime OP/ED 3-Second Quiz &amp; Jeopardy Arena
              </p>
              <p className="text-[11px] text-[#AAAAAA]">
                Test your opening/ending ear, Cursed Crops, and 4×4 Jeopardy board in its own full-page arena
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#FF0000] px-4 py-1.5 text-[11.5px] font-bold text-white shadow">
              Play Full Page &rarr;
            </span>
          </button>
        </section>
      )}

      {/* Multi-Axis Advanced Filter Engine (Genres + Format + Country + Year + Score + Sort + Exclude List) */}
      {advancedOpen && (
        <section className="mx-4 space-y-4 rounded-2xl border border-white/[0.12] bg-[#161616] p-4 sm:mx-6 sm:p-5 lg:mx-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-white">
                <SlidersHorizontal className="h-4 w-4 text-[#FF0000]" />
                Multi-Axis Advanced Filter
              </h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Combine multiple genres, themes, formats, release years, minimum rating, and list exclusions simultaneously.
              </p>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                <X className="h-3 w-3" />
                Reset All ({multiAxisCount})
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Sort By</label>
              <select
                value={filterSort}
                onChange={(e) => setFilterSort(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white outline-none focus:border-[#3EA6FF]"
              >
                <option value="POPULARITY_DESC">Most Popular</option>
                <option value="SCORE_DESC">Highest Score</option>
                <option value="TRENDING_DESC">Trending</option>
                <option value="FAVOURITES_DESC">Most Favorited</option>
                <option value="START_DATE_DESC">Newest First</option>
                <option value="TITLE_ENGLISH">Title A–Z</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Format</label>
              <select
                value={filterFormat}
                onChange={(e) => setFilterFormat(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white outline-none focus:border-[#3EA6FF]"
              >
                <option value="">Any Format</option>
                {isManga ? (
                  <>
                    <option value="MANGA">Manga</option>
                    <option value="ONE_SHOT">One Shot</option>
                    <option value="NOVEL">Light Novel</option>
                  </>
                ) : (
                  <>
                    <option value="TV">TV Series</option>
                    <option value="MOVIE">Movie</option>
                    <option value="OVA">OVA</option>
                    <option value="ONA">ONA</option>
                    <option value="SPECIAL">Special</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Status</label>
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(
                    e.target.value as '' | 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'HIATUS'
                  )
                }
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white outline-none focus:border-[#3EA6FF]"
              >
                <option value="">Any Status</option>
                <option value="RELEASING">{isManga ? 'Publishing' : 'Airing'}</option>
                <option value="FINISHED">Finished</option>
                <option value="NOT_YET_RELEASED">Upcoming</option>
                <option value="HIATUS">On Hiatus</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Origin</label>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value as '' | 'JP' | 'KR' | 'CN')}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white outline-none focus:border-[#3EA6FF]"
              >
                <option value="">Any Country</option>
                <option value="JP">Japan (JP)</option>
                <option value="KR">South Korea (KR)</option>
                <option value="CN">China (CN)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Min Score</label>
              <select
                value={filterMinScore}
                onChange={(e) => setFilterMinScore(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white outline-none focus:border-[#3EA6FF]"
              >
                <option value={0}>Any Rating</option>
                <option value={6.5}>6.5+ Good</option>
                <option value={7.0}>7.0+ Solid</option>
                <option value={7.5}>7.5+ Great</option>
                <option value={8.0}>8.0+ Very Great</option>
                <option value={8.5}>8.5+ Masterpiece</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">Year Range</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1970}
                  max={2027}
                  placeholder="From"
                  value={filterYearMin || ''}
                  onChange={(e) => setFilterYearMin(Number(e.target.value) || 0)}
                  className="h-9 w-1/2 rounded-lg border border-white/15 bg-[#0F0F0F] px-2 text-[12px] text-white outline-none"
                />
                <input
                  type="number"
                  min={1970}
                  max={2027}
                  placeholder="To"
                  value={filterYearMax || ''}
                  onChange={(e) => setFilterYearMax(Number(e.target.value) || 0)}
                  className="h-9 w-1/2 rounded-lg border border-white/15 bg-[#0F0F0F] px-2 text-[12px] text-white outline-none"
                />
              </div>
            </div>

            {!isManga && (
              <div>
                <label className="mb-1 block text-[10.5px] font-bold uppercase text-[#AAAAAA]">
                  Studio
                </label>
                <input
                  type="text"
                  list="explore-studio-datalist"
                  aria-label="Filter by studio"
                  placeholder="Any Studio (type e.g. ufotable, Trigger)"
                  value={filterStudio}
                  onChange={(e) => setFilterStudio(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/15 bg-[#0F0F0F] px-2.5 text-[12px] text-white placeholder:text-[#777777] outline-none focus:border-[#3EA6FF]"
                />
                <datalist id="explore-studio-datalist">
                  {Array.from(
                    new Set([
                      ...studioSuggestions,
                      'MAPPA',
                      'ufotable',
                      'Kyoto Animation',
                      'Madhouse',
                      'Bones',
                      'Wit Studio',
                      'CloverWorks',
                      'A-1 Pictures',
                      'Sunrise',
                      'Production I.G',
                      'Studio Ghibli',
                      'Trigger',
                      'Shaft',
                      'P.A. Works',
                      'David Production',
                      'Toei Animation',
                      'Pierrot',
                      'J.C.Staff',
                      'Science SARU',
                      'Studio Bind',
                      'White Fox',
                    ])
                  ).map((st) => (
                    <option key={st} value={st} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => {
                const on = selectedGenres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      on ? 'bg-[#FF0000] text-white' : 'bg-[#242424] text-neutral-300 hover:bg-[#323232]'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>

            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-[#242424] px-3 py-1.5 text-[11.5px] font-semibold text-white">
              <input
                type="checkbox"
                checked={hideMyList}
                onChange={(e) => setHideMyList(e.target.checked)}
                className="accent-[#FF0000]"
              />
              Hide titles in My List
            </label>
          </div>
        </section>
      )}

      {/* Expandable Full MAL Homepage Catalog Directory Matrix */}
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
                Genres (multi-select)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                      selectedGenres.includes(g)
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
                Themes (multi-select)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MAL_THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                      selectedTags.includes(t)
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
                      onClick={() => toggleTag(d)}
                      className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                        selectedTags.includes(d)
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
                            onClick={() =>
                              setSelectedSeason(active ? null : { season: sn, year: yr })
                            }
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
                      setSelectedGenres([]);
                      setSelectedTags([]);
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
                        clearAllFilters();
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
