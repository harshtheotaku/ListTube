import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  FolderPlus,
  Heart,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Music,
  Play,
  Plus,
  Repeat,
  Share2,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Tv,
  Users,
} from 'lucide-react';
import {
  Anime,
  CharacterCredit,
  CharacterDetailExtra,
  LibraryState,
  ListStatus,
  LIST_STATUS_ORDER,
  ScoredAnime,
  StaffCredit,
  StaffPersonDetail,
  ThemeSong,
  mangaOriginLabel,
  statusLabel,
} from '../types';
import {
  fetchCharacterExtra,
  fetchDetail,
  fetchStaffPersonDetail,
  pickSingleEnglishLink,
} from '../services/anilist';
import { fetchAnimeThemes, fetchMALDetail } from '../services/jikan';
import { animeStore } from '../services/animeStore';
import { predictTasteAndDropRisk } from '../services/dropPredictor';
import { library } from '../services/library';
import { miniPlayer } from '../services/miniPlayer';
import { computePacingPlan, getSavedDailyPace, saveDailyPace } from '../services/pacingGoal';
import { getSimilar } from '../services/recommender';
import { franchiseNameOf } from '../services/franchise';
import { buildWatchOrderGuide } from '../services/watchOrder';
import { getEpisodeClassification } from '../services/fillerGuide';
import {
  canonical10ToDisplayValue,
  formatUserScore,
  inputToCanonical10,
  SCORE_FORMATS,
} from '../services/scoring';
import {
  formatPreferredTitle,
  formatSecondaryTitle,
  useSettings,
} from '../services/settings';
import { profileStore, useProfile } from '../services/profile';
import {
  buildEpisodeWatchUrl,
  buildSharePreviewUrl,
  resolveExternalLinksEdge,
  ResolvedReaderLink,
} from '../services/supabase';
import { EntityRouteTarget } from './EntityView';

const CommentsSection = lazy(() =>
  import('./CommentsSection').then((m) => ({ default: m.CommentsSection }))
);
import { openInAppViewer } from '../services/inAppBrowser';
import { triggerHaptic } from '../services/haptics';
import { useChromeVisible } from '../services/scrollChrome';
import { toast } from './Toast';
import { CardSkeleton } from './Skeleton';

interface DetailViewProps {
  animeId: string;
  libraryState: LibraryState;
  onOpenId: (id: string) => void;
  onOpenChannel: (anime: Anime) => void;
  onOpenEntity?: (target: EntityRouteTarget) => void;
  onSelectGenre?: (genre: string) => void;
  onEditProfile?: () => void;
  onOpenUser?: (userIdOrHandle: string) => void;
  onClose: () => void;
  onQuickAdd: (anime: Anime) => void;
}

type DetailSectionTab = 'overview' | 'characters' | 'staff' | 'stats';

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

const STATUS_PRETTY: Record<string, string> = {
  CURRENT: 'Watching / Reading',
  COMPLETED: 'Completed',
  PLANNING: 'Planning',
  PAUSED: 'On Hold',
  DROPPED: 'Dropped',
};

function wikipediaSearchUrl(query: string): string {
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query.trim())}`;
}

function malPeopleSearchUrl(name: string): string {
  return `https://myanimelist.net/people.php?q=${encodeURIComponent(name.trim())}&cat=person`;
}

function malCharacterSearchUrl(name: string): string {
  return `https://myanimelist.net/character.php?q=${encodeURIComponent(name.trim())}`;
}

function themeYoutubeSearchUrl(
  animeTitle: string,
  kind: 'Opening' | 'Ending',
  song: ThemeSong
): string {
  const q = [animeTitle, `${kind} ${song.number}`, song.title, song.artists].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function themeYtMusicUrl(song: ThemeSong): string {
  const q = [song.title, song.artists].filter(Boolean).join(' ');
  return `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;
}

function cleanBioMarkdown(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1$2$3')
    .trim();
}

function splitSpoilerText(raw?: string, reveal = false): { text: string; hasSpoiler: boolean } {
  if (!raw) return { text: '', hasSpoiler: false };
  const hasSpoiler = /~![\s\S]*?!~/.test(raw);
  const prepared = reveal
    ? raw.replace(/~!/g, '').replace(/!~/g, '')
    : raw.replace(/~!([\s\S]*?)!~/g, '[Spoiler hidden — tap Reveal below]');
  return { text: cleanBioMarkdown(prepared), hasSpoiler };
}

export const DetailView: React.FC<DetailViewProps> = ({
  animeId,
  libraryState,
  onOpenId,
  onOpenChannel,
  onOpenEntity,
  onSelectGenre,
  onEditProfile,
  onOpenUser,
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
  const [advancedTrackOpen, setAdvancedTrackOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailSectionTab>('overview');
  const [vaLang, setVaLang] = useState<'JP' | 'EN'>('JP');
  const [expandedCharId, setExpandedCharId] = useState<number | null>(null);
  const [charExtraCache, setCharExtraCache] = useState<Record<number, CharacterDetailExtra | null>>({});
  const [charExtraLoading, setCharExtraLoading] = useState<number | null>(null);
  const [expandedStaffKey, setExpandedStaffKey] = useState<string | null>(null);
  const [staffDetailCache, setStaffDetailCache] = useState<Record<number, StaffPersonDetail | null>>({});
  const [staffLoadingId, setStaffLoadingId] = useState<number | null>(null);
  const [expandedThemeKey, setExpandedThemeKey] = useState<string | null>(null);
  const [revealSpoilerBio, setRevealSpoilerBio] = useState(false);
  const [revealSynopsis, setRevealSynopsis] = useState(false);
  const [themes, setThemes] = useState<{ openings: ThemeSong[]; endings: ThemeSong[] }>({
    openings: [],
    endings: [],
  });
  const [externalLinks, setExternalLinks] = useState<ResolvedReaderLink[]>([]);
  const [essentialOrderOnly, setEssentialOrderOnly] = useState(false);
  const [dailyPace, setDailyPace] = useState<number>(() => getSavedDailyPace(animeId, 3));
  const [customShelfDraft, setCustomShelfDraft] = useState('');
  const [theaterMode, setTheaterMode] = useState(false);
  const [epPage, setEpPage] = useState(0);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(() =>
    Math.max(1, (libraryState.entries[animeId]?.progress ?? 0) + 1)
  );
  const chromeVisible = useChromeVisible();
  const profile = useProfile();

  const entry = libraryState.entries[animeId];
  const isLiked = (libraryState.likedIds ?? []).includes(animeId);

  useEffect(() => {
    setIsTrailerPlaying(settings.autoplayTrailer);
    setListPickerOpen(false);
    setAdvancedTrackOpen(false);
    setIsDescriptionExpanded(false);
    setDetailTab('overview');
    setExpandedCharId(null);
    setExpandedStaffKey(null);
    setExpandedThemeKey(null);
    setRevealSpoilerBio(false);
    setDailyPace(getSavedDailyPace(animeId, animeId.includes('manga') ? 5 : 2));
    const curProg = libraryState.entries[animeId]?.progress ?? 0;
    setSelectedEpisode(Math.max(1, curProg + 1));
    setEpPage(Math.floor(Math.max(0, curProg) / 25));
  }, [animeId, settings.autoplayTrailer]);

  useEffect(() => {
    let cancelled = false;
    const cached = animeStore.get(animeId);
    if (cached) setAnime(cached);

    const isManga = animeId.includes('manga');
    const numeric = Number(animeId.split(':')[1]);
    const needsFetch =
      !cached ||
      !cached.description ||
      cached.similar.length === 0 ||
      (!animeId.startsWith('mal') && cached.characters === undefined);

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
    if (!anime) return;
    const yr = anime.year ? ` (${anime.year})` : '';
    document.title = `${anime.title}${yr} — ListTube`;
    if (anime.description) {
      const descEl = document.querySelector('meta[name="description"]');
      if (descEl) descEl.setAttribute('content', anime.description.slice(0, 160));
    }
  }, [anime?.id, anime?.title, anime?.year, anime?.description]);

  useEffect(() => {
    let cancelled = false;
    if (!anime?.malId || anime.mediaType === 'MANGA') {
      setThemes({ openings: [], endings: [] });
      return;
    }
    void fetchAnimeThemes(anime.malId).then((res) => {
      if (!cancelled) setThemes(res);
    });
    return () => {
      cancelled = true;
    };
  }, [anime?.malId, anime?.mediaType]);

  useEffect(() => {
    library.logOpen(animeId);
  }, [animeId]);

  useEffect(() => {
    if (!anime) {
      setExternalLinks([]);
      return;
    }
    let cancelled = false;
    const type: 'ANIME' | 'MANGA' = anime.mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
    const q = encodeURIComponent(anime.title);
    setExternalLinks(
      type === 'ANIME'
        ? [
            { site: 'KotoPlay', key: 'kotoplay', url: `https://kotoplay.to/search?keyword=${q}`, isDirect: false, recommended: true },
            { site: 'Re Anime', key: 'reanime', url: `https://reanime.cc/?s=${q}`, isDirect: false },
          ]
        : [
            { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false, recommended: true },
            { site: 'Kagane', key: 'kagane', url: `https://kagane.org/search?q=${q}`, isDirect: false },
          ]
    );
    resolveExternalLinksEdge(type, anime.title, anime.titleRomaji)
      .then((links) => {
        if (!cancelled && links.length > 0) setExternalLinks(links);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [anime?.id, anime?.title, anime?.titleRomaji, anime?.mediaType]);

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

  const loadStaffPerson = async (staffId?: number) => {
    if (!staffId || Object.prototype.hasOwnProperty.call(staffDetailCache, staffId)) return;
    setStaffLoadingId(staffId);
    try {
      const detail = await fetchStaffPersonDetail(staffId);
      setStaffDetailCache((prev) => ({ ...prev, [staffId]: detail }));
    } catch {
      setStaffDetailCache((prev) => ({ ...prev, [staffId]: null }));
    } finally {
      setStaffLoadingId((curr) => (curr === staffId ? null : curr));
    }
  };

  const handleToggleCharacter = async (ch: CharacterCredit) => {
    setRevealSpoilerBio(false);
    if (expandedCharId === ch.id) {
      window.open(ch.siteUrl || malCharacterSearchUrl(ch.name), '_blank', 'noopener,noreferrer');
      return;
    }
    setExpandedCharId(ch.id);
    const activeVa = vaLang === 'EN' && ch.englishVoiceActor ? ch.englishVoiceActor : ch.voiceActor;
    if (activeVa?.id) void loadStaffPerson(activeVa.id);
    if (!Object.prototype.hasOwnProperty.call(charExtraCache, ch.id)) {
      setCharExtraLoading(ch.id);
      try {
        const extra = await fetchCharacterExtra(ch.id);
        setCharExtraCache((prev) => ({ ...prev, [ch.id]: extra }));
      } catch {
        setCharExtraCache((prev) => ({ ...prev, [ch.id]: null }));
      } finally {
        setCharExtraLoading((curr) => (curr === ch.id ? null : curr));
      }
    }
  };

  const handleToggleStaff = (person: StaffCredit, key: string) => {
    if (expandedStaffKey === key) {
      window.open(wikipediaSearchUrl(person.name), '_blank', 'noopener,noreferrer');
      return;
    }
    setExpandedStaffKey(key);
    void loadStaffPerson(person.id);
  };

  const handleToggleTheme = (key: string, ytUrl: string) => {
    if (expandedThemeKey === key) {
      window.open(ytUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setExpandedThemeKey(key);
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
  const total = isManga ? anime.chapters ?? 0 : anime.episodes ?? 0;
  const progress = entry?.progress ?? 0;
  const volTotal = anime.volumes ?? 0;
  const volProgress = entry?.progressVolumes ?? 0;
  const studioName = anime.studios[0] || (isManga ? 'Official Manga Publication' : 'Official Studio');
  const channelName = franchiseNameOf(anime.title);
  const scoreMeta = SCORE_FORMATS.find((f) => f.id === settings.scoreFormat) ?? SCORE_FORMATS[0];
  const displayScoreVal = canonical10ToDisplayValue(entry?.score, settings.scoreFormat);

  const handleChooseList = (status: ListStatus) => {
    triggerHaptic('medium');
    library.setStatus(anime, status);
    setListPickerOpen(false);
    toast(`Subscribed · Added to ${statusLabel(status, anime.mediaType)}`);
  };

  const handleShare = () => {
    const shareUrl = buildSharePreviewUrl(anime.id);
    if (navigator.share) {
      navigator
        .share({
          title: anime.title,
          text: `Check out ${anime.title} on ListTube!`,
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareUrl);
      toast('Rich OpenGraph share link copied!');
    }
  };

  const widePreview =
    anime.hasOfficialBanner && anime.banner && anime.banner !== anime.cover
      ? anime.banner
      : null;

  const characters = anime.characters ?? [];
  const staff = anime.staff ?? [];
  const scoreStats = anime.scoreStats ?? [];
  const statusStats = anime.statusStats ?? [];
  const maxScoreBucket = Math.max(1, ...scoreStats.map((s) => s.amount));
  const totalStatusUsers = Math.max(1, statusStats.reduce((s, x) => s + x.amount, 0));

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
          {/* Left Column */}
          <div className={`min-w-0 space-y-4 ${theaterMode ? 'lg:col-span-2' : ''}`}>
            {/* 16:9 Hero + Morphe Enhanced Ambient Mode Aura */}
            <div className="relative">
              {settings.ambientMode && !settings.disableBlend && (widePreview || anime.cover) && (
                <div
                  aria-hidden="true"
                  className={`lt-ambient-blend pointer-events-none absolute -inset-x-6 -top-4 bottom-0 z-0 overflow-hidden rounded-3xl transition-opacity duration-700 ${
                    settings.dimAmbientOnScroll && !chromeVisible ? 'opacity-15' : 'opacity-45'
                  }`}
                >
                  <img
                    src={widePreview || anime.cover}
                    alt=""
                    className="h-full w-full scale-125 object-cover blur-[72px] saturate-150"
                  />
                </div>
              )}
              <div className="relative z-[1] aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
                <button
                  type="button"
                  onClick={() => setTheaterMode((v) => !v)}
                  aria-label={theaterMode ? 'Exit theater mode' : 'Enter theater mode'}
                  className="lt-press absolute left-3 top-3 z-10 hidden items-center gap-1 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[10.5px] font-bold text-white backdrop-blur-md hover:bg-black lg:inline-flex"
                >
                  {theaterMode ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  <span>{theaterMode ? 'Default' : 'Theater'}</span>
                </button>
              {anime.trailerYoutubeId && isTrailerPlaying ? (
                <div className="relative h-full w-full">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${anime.trailerYoutubeId}?autoplay=1&rel=0&modestbranding=1${
                      settings.defaultTrailerMuted ? '&mute=1' : ''
                    }`}
                    title={`${anime.title} Official Trailer`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="h-full w-full border-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsTrailerPlaying(false);
                      miniPlayer.open({
                        youtubeId: anime.trailerYoutubeId!,
                        title: anime.title,
                        subtitle: 'Official Trailer · Mini-Player',
                        animeId: anime.id,
                      });
                    }}
                    className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md transition hover:bg-black"
                  >
                    Pop out Mini-Player ↘
                  </button>
                </div>
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
                        <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-4 py-2 text-xs font-bold text-white backdrop-blur-md">
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
            </div>

            {/* Video Title */}
            <div>
              <h1 className="text-[20px] font-bold leading-snug tracking-tight text-white sm:text-[22px]">
                {formatPreferredTitle(anime, settings.titleLanguage)}
              </h1>
              {(() => {
                const secondary = formatSecondaryTitle(anime, settings.titleLanguage);
                return secondary ? (
                  <p className="mt-0.5 text-[12px] text-[#AAAAAA]">{secondary}</p>
                ) : null;
              })()}
            </div>

            {/* Channel Row + Persistent Actions */}
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

                {/* Subscribe 5-List Button */}
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
                              if (
                                settings.confirmBeforeRemove &&
                                !window.confirm(`Remove "${anime.title}" from your watchlist?`)
                              ) {
                                return;
                              }
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

              {/* Right Action Pills: Direct Read/Watch CTA (Synced identically with Recommended Link below) */}
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const q = encodeURIComponent(anime.title);
                  const primaryKey = isManga ? 'comix' : 'kotoplay';
                  const fallbackLink: ResolvedReaderLink = isManga
                    ? { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false, recommended: true }
                    : { site: 'KotoPlay', key: 'kotoplay', url: `https://kotoplay.to/search?keyword=${q}`, isDirect: false, recommended: true };
                  const primaryLink = externalLinks.find((l) => l.key === primaryKey) ?? fallbackLink;
                  return (
                    <button
                      type="button"
                      data-direct-url={primaryLink.url}
                      onClick={() =>
                        openInAppViewer({
                          url: primaryLink.url,
                          title: anime.title,
                          sourceName: primaryLink.site,
                          mediaType: anime.mediaType,
                        })
                      }
                      className="lt-press flex items-center gap-1.5 rounded-full bg-[#FF0000] px-4 py-2 text-[12.5px] font-bold text-white shadow-lg transition hover:bg-[#D90000]"
                    >
                      {isManga ? <BookOpen className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                      <span>{isManga ? 'Read on Comix' : 'Watch on KotoPlay'}</span>
                      {primaryLink.isDirect && (
                        <span className="rounded bg-white/25 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
                          Direct
                        </span>
                      )}
                    </button>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    const nowLiked = library.toggleLike(anime);
                    toast(nowLiked ? 'Saved to Liked Titles!' : 'Removed from Liked Titles');
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                    isLiked
                      ? 'border border-[#FF0000]/40 bg-[#FF0000]/20 text-white'
                      : 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
                  }`}
                >
                  <ThumbsUp className={`h-4 w-4 ${isLiked ? 'fill-current text-[#FF0000]' : ''}`} />
                  <span>{isLiked ? 'Liked' : 'Like'}</span>
                </button>

                {(() => {
                  const favList = isManga
                    ? profile.favoriteMangaIds ?? []
                    : profile.favoriteAnimeIds ?? [];
                  const isFav = favList.includes(anime.id);
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        animeStore.remember(anime);
                        animeStore.pin(anime.id);
                        const added = profileStore.toggleFavoriteMedia(
                          anime.id,
                          isManga ? 'MANGA' : 'ANIME'
                        );
                        toast(added ? 'Added to Channel Favorites ★' : 'Removed from Favorites');
                      }}
                      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                        isFav
                          ? 'border border-rose-500/40 bg-rose-500/20 text-rose-200'
                          : 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${isFav ? 'fill-current text-rose-400' : ''}`} />
                      <span>{isFav ? 'Favorited' : 'Favorite'}</span>
                    </button>
                  );
                })()}

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

            {/* Encyclopedia Section Switcher (MAL / AniList Parity!) */}
            <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.08] pb-2 no-scrollbar">
              {([
                { id: 'overview', label: 'Overview & Threads', icon: BookOpen },
                { id: 'characters', label: `Characters & Cast (${characters.length})`, icon: Users },
                {
                  id: 'staff',
                  label: isManga
                    ? `Staff & Authors (${staff.length})`
                    : `Staff & OP/ED (${staff.length + themes.openings.length + themes.endings.length})`,
                  icon: Music,
                },
                { id: 'stats', label: 'Score Stats', icon: BarChart3 },
              ] as { id: DetailSectionTab; label: string; icon: React.ElementType }[]).map((tab) => {
                const Icon = tab.icon;
                const active = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                      active
                        ? 'bg-[#F1F1F1] text-[#0F0F0F]'
                        : 'bg-[#222222] text-[#CCCCCC] hover:bg-[#303030] hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUBSCRIBED FULL TRACKER BAR (Always renders progress stepper even if total===0!) */}
            {isSubscribed && (
              <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12px] font-bold text-[#AAAAAA]">
                    {isManga ? 'Chapters:' : 'Episodes:'}
                  </span>
                  <div className="flex items-center gap-1 rounded-full bg-[#272727] px-2 py-1">
                    <button
                      type="button"
                      aria-label="Decrease progress"
                      onClick={() => {
                        triggerHaptic('light');
                        library.setProgress(anime.id, Math.max(0, progress - 1));
                      }}
                      className="p-1 text-[#AAAAAA] hover:text-white"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[60px] text-center text-[12px] font-bold text-white">
                      {total > 0 ? `${progress}/${total}` : `${progress} ${isManga ? 'ch' : 'ep'}`}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase progress"
                      onClick={() => {
                        triggerHaptic('light');
                        library.setProgress(anime.id, progress + 1);
                      }}
                      className="p-1 text-[#AAAAAA] hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {total > 0 ? (
                    <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#FF0000]"
                        style={{ width: `${Math.min(100, (progress / total) * 100)}%` }}
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Ongoing / Unknown Total
                    </span>
                  )}

                  {isManga && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-semibold text-[#AAAAAA]">Vols:</span>
                      <div className="flex items-center gap-1 rounded-full bg-[#272727] px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            library.updateEntryDetails(anime.id, {
                              progressVolumes: Math.max(0, volProgress - 1),
                            })
                          }
                          className="p-0.5 text-[#AAAAAA] hover:text-white"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-[36px] text-center text-[11.5px] font-bold text-white">
                          {volTotal > 0 ? `${volProgress}/${volTotal}` : volProgress}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            library.updateEntryDetails(anime.id, {
                              progressVolumes: volProgress + 1,
                            })
                          }
                          className="p-0.5 text-[#AAAAAA] hover:text-white"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Catch-Up Pacing & Volume Release Goal Calculator */}
                {(() => {
                  const plan = computePacingPlan({
                    progress,
                    total,
                    dailyPace,
                    mediaType: isManga ? 'MANGA' : 'ANIME',
                    durationMins: anime.duration,
                    knownVolumes: volTotal,
                    completedVolumes: volProgress,
                  });
                  if (!plan || plan.remainingUnits <= 0) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2 text-[11.5px]">
                      <div className="flex items-center gap-2 text-[#CCCCCC]">
                        <span className="font-bold text-white">Pace Goal:</span>
                        <input
                          type="number"
                          aria-label="Daily pace goal"
                          min={1}
                          max={50}
                          value={dailyPace}
                          onChange={(e) => {
                            const next = Math.max(1, Number(e.target.value) || 1);
                            setDailyPace(next);
                            saveDailyPace(anime.id, next);
                          }}
                          className="h-6 w-12 rounded border border-white/15 bg-[#121212] px-1.5 text-center text-[11.5px] font-bold text-[#3EA6FF] outline-none"
                        />
                        <span>{isManga ? 'ch/day' : 'ep/day'}</span>
                      </div>
                      <span className="font-semibold text-emerald-300">
                        Finish {plan.daysToFinish}d ({plan.estimatedDateLabel}) · ~{plan.minutesPerDay}m/day
                        {plan.estimatedRemainingVolumes ? ` · ~${plan.estimatedRemainingVolumes} vols left` : ''}
                      </span>
                    </div>
                  );
                })()}

                {/* Decimal / Multi-Scale Score Picker */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold text-[#AAAAAA]">Your rating:</span>
                    {settings.scoreFormat === 'POINT_100' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={displayScoreVal ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            library.setScore(
                              anime.id,
                              val > 0 ? inputToCanonical10(val, 'POINT_100') : undefined
                            );
                          }}
                          className="w-36 accent-amber-400"
                        />
                        <span className="text-[12.5px] font-bold text-amber-300">
                          {displayScoreVal ? `${displayScoreVal}/100` : 'Unrated'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.from(
                          { length: settings.scoreFormat === 'POINT_5' ? 5 : 10 },
                          (_, index) => index + 1
                        ).map((value) => {
                          const active = (displayScoreVal ?? 0) >= value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-label={`Rate ${value}`}
                              onClick={() => {
                                const canonical = inputToCanonical10(value, settings.scoreFormat);
                                library.setScore(anime.id, canonical);
                                toast(`Rated ${formatUserScore(canonical, settings.scoreFormat)}`);
                              }}
                              className="p-0.5"
                            >
                              <Star
                                className={`h-4 w-4 transition ${
                                  active
                                    ? 'fill-amber-300 text-amber-300'
                                    : 'text-neutral-600 hover:text-neutral-300'
                                }`}
                              />
                            </button>
                          );
                        })}
                        {settings.scoreFormat === 'POINT_10_DECIMAL' && (
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={displayScoreVal ?? ''}
                            placeholder="8.5"
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              if (!e.target.value) {
                                library.setScore(anime.id, undefined);
                              } else {
                                library.setScore(
                                  anime.id,
                                  inputToCanonical10(raw, 'POINT_10_DECIMAL')
                                );
                              }
                            }}
                            className="ml-2 h-7 w-16 rounded-lg border border-white/15 bg-[#121212] px-2 text-[12px] font-bold text-amber-300 outline-none focus:border-amber-300"
                          />
                        )}
                      </div>
                    )}
                    {entry?.score ? (
                      <span className="text-[11.5px] font-bold text-amber-300">
                        ({formatUserScore(entry.score, settings.scoreFormat)} · {scoreMeta.shortLabel})
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAdvancedTrackOpen((v) => !v)}
                    className="flex items-center gap-1 rounded-full bg-[#272727] px-3 py-1 text-[11px] font-semibold text-[#CCCCCC] hover:bg-[#383838] hover:text-white"
                  >
                    <Calendar className="h-3 w-3 text-[#3EA6FF]" />
                    <span>Dates, Rewatches &amp; Notes</span>
                    {advancedTrackOpen ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* Dates, Rewatches, Priority, Custom Shelves, Notes & Privacy Panel */}
                {advancedTrackOpen && (
                  <div className="space-y-3 border-t border-white/[0.08] pt-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-[#AAAAAA]">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={entry?.startedAt ?? ''}
                          onChange={(e) =>
                            library.updateEntryDetails(anime.id, { startedAt: e.target.value || undefined })
                          }
                          className="h-8 w-full rounded-lg border border-white/15 bg-[#121212] px-2 text-[12px] text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-[#AAAAAA]">
                          Finish Date
                        </label>
                        <input
                          type="date"
                          value={entry?.completedAt ?? ''}
                          onChange={(e) =>
                            library.updateEntryDetails(anime.id, { completedAt: e.target.value || undefined })
                          }
                          className="h-8 w-full rounded-lg border border-white/15 bg-[#121212] px-2 text-[12px] text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-[#AAAAAA]">
                          <Repeat className="h-3 w-3 text-[#3EA6FF]" />
                          {isManga ? 'Rereads' : 'Rewatches'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={entry?.repeat ?? 0}
                          onChange={(e) =>
                            library.updateEntryDetails(anime.id, { repeat: Number(e.target.value) || 0 })
                          }
                          className="h-8 w-full rounded-lg border border-white/15 bg-[#121212] px-2 text-[12px] text-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase text-[#AAAAAA]">
                          Personal Notes
                        </label>
                        <input
                          value={entry?.notes ?? ''}
                          onChange={(e) =>
                            library.updateEntryDetails(anime.id, { notes: e.target.value })
                          }
                          placeholder="Private list notes synced to AniList / MAL…"
                          className="h-8 w-full rounded-lg border border-white/15 bg-[#121212] px-2.5 text-[12px] text-white outline-none"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#242424] px-2.5 text-[11.5px] font-semibold text-white">
                          <input
                            type="checkbox"
                            checked={Boolean(entry?.isPrivate)}
                            onChange={(e) =>
                              library.updateEntryDetails(anime.id, { isPrivate: e.target.checked })
                            }
                            className="accent-[#FF0000]"
                          />
                          <Lock className="h-3 w-3 text-[#AAAAAA]" />
                          Private Entry
                        </label>
                      </div>
                    </div>

                    {/* Priority + Custom List Shelves */}
                    <div className="grid gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase text-[#AAAAAA]">
                          <Flag className="h-3 w-3 text-[#3EA6FF]" />
                          Priority
                        </label>
                        <div className="flex gap-1.5">
                          {([
                            { value: 0, label: 'Normal' },
                            { value: 1, label: 'Medium' },
                            { value: 2, label: 'High' },
                          ] as const).map((p) => {
                            const active = (entry?.priority ?? 0) === p.value;
                            return (
                              <button
                                key={p.value}
                                type="button"
                                onClick={() => library.updateEntryDetails(anime.id, { priority: p.value })}
                                className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-bold transition ${
                                  active
                                    ? p.value === 2
                                      ? 'bg-rose-500 text-white'
                                      : 'bg-[#3EA6FF] text-black'
                                    : 'bg-[#242424] text-[#CCCCCC] hover:bg-[#323232]'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase text-[#AAAAAA]">
                          <FolderPlus className="h-3 w-3 text-[#3EA6FF]" />
                          Custom Shelves
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {(profile.customListNames ?? []).map((shelfName) => {
                            const active = Boolean(entry?.customLists?.includes(shelfName));
                            return (
                              <button
                                key={shelfName}
                                type="button"
                                onClick={() => {
                                  const prev = entry?.customLists ?? [];
                                  const next = active
                                    ? prev.filter((x) => x !== shelfName)
                                    : [...prev, shelfName];
                                  library.updateEntryDetails(anime.id, { customLists: next });
                                }}
                                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                  active
                                    ? 'bg-[#3EA6FF] text-black font-bold'
                                    : 'bg-[#242424] text-[#CCCCCC] hover:bg-[#323232]'
                                }`}
                              >
                                {active ? `✓ ${shelfName}` : shelfName}
                              </button>
                            );
                          })}
                          <div className="flex items-center gap-1">
                            <input
                              value={customShelfDraft}
                              onChange={(e) => setCustomShelfDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const created = profileStore.addCustomListName(customShelfDraft);
                                  if (created) {
                                    const prev = entry?.customLists ?? [];
                                    library.updateEntryDetails(anime.id, {
                                      customLists: Array.from(new Set([...prev, created])),
                                    });
                                    setCustomShelfDraft('');
                                  }
                                }
                              }}
                              placeholder="+ New shelf"
                              className="h-7 w-24 rounded-lg border border-white/15 bg-[#121212] px-2 text-[11px] text-white outline-none focus:border-[#3EA6FF]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DETAIL TAB: OVERVIEW & THREADS */}
            {detailTab === 'overview' && (
              <>
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenChannel(anime);
                      }}
                      className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-[#AAAAAA] transition hover:bg-white/20 hover:text-white"
                      title={`Open ${studioName} channel`}
                    >
                      {isManga ? studioName : `Studio: ${studioName}`}
                    </button>
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
                  ) : settings.hideSpoilers && !revealSynopsis && anime.description ? (
                    <div
                      className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealSynopsis(true);
                      }}
                    >
                      <span className="font-bold">Spoiler Guard active</span> — Tap here to reveal plot synopsis.
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
                    <div
                      className="mt-4 space-y-3 border-t border-white/10 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {anime.genres.map((genre) =>
                          onSelectGenre ? (
                            <button
                              key={genre}
                              type="button"
                              onClick={() => onSelectGenre(genre)}
                              className="rounded-lg bg-black/40 px-2.5 py-1 text-[11.5px] font-medium text-neutral-200 transition hover:bg-[#FF0000] hover:text-white"
                              title={`Browse ${genre} on Explore`}
                            >
                              {genre}
                            </button>
                          ) : (
                            <span
                              key={genre}
                              className="rounded-lg bg-black/40 px-2.5 py-1 text-[11.5px] font-medium text-neutral-200"
                            >
                              {genre}
                            </span>
                          )
                        )}
                        {anime.tags.slice(0, 8).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg bg-[#FF0000]/15 px-2.5 py-1 text-[11.5px] font-medium text-rose-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={
                            anime.malId
                              ? `https://myanimelist.net/${isManga ? 'manga' : 'anime'}/${anime.malId}`
                              : `https://myanimelist.net/search/all?q=${encodeURIComponent(anime.title)}`
                          }
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[11.5px] font-bold text-[#3EA6FF] transition hover:bg-[#3EA6FF]/20"
                        >
                          MyAnimeList <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={
                            anime.anilistId
                              ? `https://anilist.co/${isManga ? 'manga' : 'anime'}/${anime.anilistId}`
                              : `https://anilist.co/search/${isManga ? 'manga' : 'anime'}?search=${encodeURIComponent(anime.title)}`
                          }
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[11.5px] font-bold text-[#7DD3FC] transition hover:bg-[#02A9FF]/20"
                        >
                          AniList <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={`https://anime.fandom.com/wiki/Special:Search?query=${encodeURIComponent(anime.title)}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[11.5px] font-bold text-amber-300 transition hover:bg-amber-500/20"
                        >
                          Anime Wiki <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={wikipediaSearchUrl(anime.title)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[11.5px] font-bold text-neutral-200 transition hover:bg-white/15"
                        >
                          Wikipedia <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Taste Fit & Drop-Risk Analyzer Badge */}
                {(() => {
                  const pred = predictTasteAndDropRisk(anime, libraryState, (id) => animeStore.get(id));
                  if (pred.positives.length === 0 && pred.warnings.length === 0) return null;
                  const tone =
                    pred.verdict === 'HIGH_DROP_RISK'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                      : pred.verdict === 'CAUTION'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                      : pred.verdict === 'GREAT_FIT'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                      : 'border-sky-500/30 bg-sky-500/10 text-sky-200';
                  return (
                    <div className={`rounded-2xl border px-3.5 py-2.5 text-[11.5px] ${tone}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-extrabold">
                          Taste Match: {pred.matchScore}% · Drop Risk: {pred.dropRiskPercent}%
                        </span>
                        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase">
                          {pred.verdict.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] opacity-90">
                        {[...pred.warnings, ...pred.positives].join(' · ')}
                      </p>
                    </div>
                  );
                })()}

                {/* Interactive Franchise Watch-Order Flowchart */}
                {(() => {
                  const guide = buildWatchOrderGuide(anime);
                  if (!guide) return null;
                  const visibleSteps = essentialOrderOnly
                    ? guide.steps.filter((s) => s.essential || s.isCurrent)
                    : guide.steps;
                  return (
                    <div className="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#161616] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[12.5px] font-bold text-white">
                            Watch Order Guide: {guide.franchiseName}
                          </p>
                          <p className="text-[10.5px] text-[#AAAAAA]">
                            Follow steps left-to-right for recommended story continuity
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEssentialOrderOnly((v) => !v)}
                          className={`rounded-full px-3 py-1 text-[10.5px] font-bold transition ${
                            essentialOrderOnly
                              ? 'bg-[#3EA6FF] text-black'
                              : 'bg-[#272727] text-neutral-300 hover:text-white'
                          }`}
                        >
                          {essentialOrderOnly ? 'Showing Essential Canon' : 'Essential Canon Only'}
                        </button>
                      </div>
                      <div className="flex items-stretch gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {visibleSteps.map((st, idx) => (
                          <button
                            key={`${st.step}-${st.title}`}
                            type="button"
                            onClick={() => {
                              if (st.id && st.id !== anime.id) onOpenId(st.id);
                            }}
                            disabled={!st.id || st.isCurrent}
                            className={`flex min-w-[175px] max-w-[205px] shrink-0 flex-col justify-between rounded-xl border p-2.5 text-left transition ${
                              st.isCurrent
                                ? 'border-[#FF0000] bg-[#FF0000]/15'
                                : 'border-white/[0.08] bg-[#202020] hover:border-white/25 hover:bg-[#2A2A2A]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold uppercase">
                              <span className="text-[#3EA6FF]">Step {idx + 1}</span>
                              <span className="rounded bg-black/40 px-1.5 py-0.5 text-amber-300">
                                {st.badge}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[12px] font-bold text-white">
                              {st.title}
                            </p>
                            <p className="mt-1 line-clamp-1 text-[10px] text-[#AAAAAA]">{st.note}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Always-Visible Direct Community, Database, Wiki & Forum Links */}
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#161616] px-3.5 py-2.5 text-[11.5px]">
                  <span className="font-bold text-[#AAAAAA]">Direct Links:</span>
                  <a
                    href={
                      anime.malId
                        ? `https://myanimelist.net/${isManga ? 'manga' : 'anime'}/${anime.malId}`
                        : `https://myanimelist.net/search/all?q=${encodeURIComponent(anime.title)}`
                    }
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full bg-[#2E51A2]/25 px-3 py-1 font-bold text-[#93C5FD] transition hover:bg-[#2E51A2]/45"
                  >
                    MyAnimeList <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={
                      anime.anilistId
                        ? `https://anilist.co/${isManga ? 'manga' : 'anime'}/${anime.anilistId}`
                        : `https://anilist.co/search/${isManga ? 'manga' : 'anime'}?search=${encodeURIComponent(anime.title)}`
                    }
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full bg-[#02A9FF]/20 px-3 py-1 font-bold text-[#7DD3FC] transition hover:bg-[#02A9FF]/35"
                  >
                    AniList <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://anime.fandom.com/wiki/Special:Search?query=${encodeURIComponent(anime.title)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 font-bold text-amber-300 transition hover:bg-amber-500/25"
                  >
                    <BookOpen className="h-3 w-3" />
                    Anime Wiki <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={
                      anime.malId
                        ? `https://myanimelist.net/forum/?${isManga ? 'mangaid' : 'animeid'}=${anime.malId}`
                        : 'https://myanimelist.net/forum/'
                    }
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-3 py-1 font-semibold text-neutral-200 transition hover:bg-white/[0.14]"
                  >
                    MAL Forum <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://anilist.co/forum/overview"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-3 py-1 font-semibold text-neutral-200 transition hover:bg-white/[0.14]"
                  >
                    AniList Forum <ExternalLink className="h-3 w-3" />
                  </a>
                  {!isManga && anime.studios[0] && onOpenEntity && (
                    <button
                      type="button"
                      onClick={() => onOpenEntity({ kind: 'studio', idOrName: anime.studios[0] })}
                      className="inline-flex items-center gap-1 rounded-full bg-[#FF0000]/15 px-3 py-1 font-bold text-rose-200 transition hover:bg-[#FF0000]/25"
                    >
                      Studio: {anime.studios[0]} →
                    </button>
                  )}
                </div>

                {/* Official English Platform + Optional Community Sites */}
                {(() => {
                  const officialEnglishLinks = pickSingleEnglishLink(anime.streaming, anime.mediaType);
                  const q = encodeURIComponent(anime.title);
                  const communityLinks: ResolvedReaderLink[] = settings.showCommunityLinks
                    ? externalLinks.length > 0
                      ? externalLinks.filter((l) => l.key !== 'animepahe')
                      : isManga
                      ? [
                          { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false, recommended: true },
                          { site: 'Kagane', key: 'kagane', url: `https://kagane.org/search?q=${q}`, isDirect: false },
                        ]
                      : [
                          { site: 'KotoPlay', key: 'kotoplay', url: `https://kotoplay.to/search?keyword=${q}`, isDirect: false, recommended: true },
                          { site: 'Re Anime', key: 'reanime', url: `https://reanime.cc/?s=${q}`, isDirect: false },
                        ]
                    : [];

                  if (officialEnglishLinks.length === 0 && communityLinks.length === 0) return null;

                  return (
                    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                      {officialEnglishLinks.length > 0 && (
                        <div>
                          <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                            <Tv className="h-4 w-4 text-[#FF0000]" />
                            Official {isManga ? 'English Reading Platform' : 'English Streaming Platform'}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {officialEnglishLinks.slice(0, 1).map((link) => (
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
                        </div>
                      )}

                      {communityLinks.length > 0 && (
                        <div className={officialEnglishLinks.length > 0 ? 'border-t border-white/[0.08] pt-3.5' : ''}>
                          <h3 className="mb-2.5 flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                            {isManga ? (
                              <BookOpen className="h-4 w-4 text-[#FF0000]" />
                            ) : (
                              <Play className="h-4 w-4 text-[#FF0000]" />
                            )}
                            {isManga ? 'Read Manga On' : 'Watch Anime On'}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {communityLinks.map((site) => {
                              const isRecommended =
                                Boolean(site.recommended) || site.key === 'kotoplay' || site.key === 'comix';
                                return (
                                  <button
                                    key={site.key}
                                    type="button"
                                    data-direct-url={site.url}
                                    onClick={() =>
                                    openInAppViewer({
                                      url: site.url,
                                      title: anime.title,
                                      sourceName: site.site,
                                      mediaType: anime.mediaType,
                                    })
                                  }
                                  className={`lt-press flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-bold text-white transition ${
                                    isRecommended
                                      ? 'border-amber-400/35 bg-amber-500/10 hover:border-amber-300/60 hover:bg-amber-500/20'
                                      : 'border-white/[0.08] bg-[#222222] hover:border-white/25 hover:bg-[#303030]'
                                  }`}
                                >
                                  <span>{site.site}</span>
                                  {isRecommended && (
                                    <span className="rounded bg-amber-400/25 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-300">
                                      Recommended
                                    </span>
                                  )}
                                  {site.isDirect && (
                                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-300">
                                      Direct
                                    </span>
                                  )}
                                  <ExternalLink className="h-3.5 w-3.5 text-[#3EA6FF]" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Interactive Clickable Episode / Chapter Tiles with Direct Watch Links */}
                {(() => {
                  const totalUnits = isManga
                    ? anime.chapters ?? Math.max(progress + 6, 12)
                    : anime.episodes ?? (anime.nextEpisode ? anime.nextEpisode.number : 12);
                  const cappedUnits = Math.min(Math.max(1, totalUnits), 500);
                  const pageSize = 25;
                  const pageCount = Math.ceil(cappedUnits / pageSize);
                  const safePage = Math.min(epPage, Math.max(0, pageCount - 1));
                  const startEp = safePage * pageSize + 1;
                  const endEp = Math.min(cappedUnits, startEp + pageSize - 1);
                  const epNumbers = Array.from({ length: endEp - startEp + 1 }, (_, i) => startEp + i);

                  const q = encodeURIComponent(anime.title);
                  const primarySite: ResolvedReaderLink =
                    externalLinks.find((l) => l.recommended) ??
                    externalLinks[0] ??
                    (isManga
                      ? { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false }
                      : { site: 'KotoPlay', key: 'kotoplay', url: `https://kotoplay.to/search?keyword=${q}`, isDirect: false });

                  const activeEp = Math.min(cappedUnits, Math.max(1, selectedEpisode));
                  const activeEpUrl = buildEpisodeWatchUrl(primarySite.url, primarySite.key, activeEp);
                  const activeEpFiller = !isManga ? getEpisodeClassification(anime, activeEp) : null;

                  return (
                    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                            {isManga ? <BookOpen className="h-4 w-4 text-[#FF0000]" /> : <Play className="h-4 w-4 text-[#FF0000]" />}
                            {isManga ? `Chapters (${cappedUnits})` : `Episodes (${cappedUnits})`}
                          </h3>
                          <p className="text-[11px] text-[#AAAAAA]">
                            Tap any {isManga ? 'chapter' : 'episode'} tile to open its direct {primarySite.site} link or update progress
                          </p>
                        </div>

                        {pageCount > 1 && (
                          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                            {Array.from({ length: Math.min(pageCount, 8) }, (_, pIdx) => {
                              const pStart = pIdx * pageSize + 1;
                              const pEnd = Math.min(cappedUnits, pStart + pageSize - 1);
                              return (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => setEpPage(pIdx)}
                                  className={`shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${
                                    safePage === pIdx
                                      ? 'bg-[#FF0000] text-white'
                                      : 'bg-[#262626] text-[#AAAAAA] hover:text-white'
                                  }`}
                                >
                                  {pStart}-{pEnd}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-9">
                        {epNumbers.map((ep) => {
                          const isWatched = ep <= progress;
                          const isSelected = ep === activeEp;
                          const tag = !isManga ? getEpisodeClassification(anime, ep) : null;
                          const isFiller = tag === 'FILLER' || tag === 'RECAP';
                          const tileUrl = buildEpisodeWatchUrl(primarySite.url, primarySite.key, ep);
                          return (
                            <button
                              key={ep}
                              type="button"
                              data-episode={ep}
                              data-direct-url={tileUrl}
                              title={`${isManga ? 'Chapter' : 'Episode'} ${ep}${tag ? ` · ${tag}` : ''} — Open on ${primarySite.site}`}
                              onClick={() => {
                                triggerHaptic('light');
                                setSelectedEpisode(ep);
                              }}
                              className={`lt-press relative flex h-11 flex-col items-center justify-center rounded-xl border text-[12px] font-bold transition ${
                                isSelected
                                  ? 'border-[#3EA6FF] bg-[#3EA6FF]/20 text-white ring-1 ring-[#3EA6FF]/50'
                                  : isWatched
                                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
                                    : isFiller
                                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                                      : 'border-white/[0.08] bg-[#222226] text-neutral-200 hover:border-white/25 hover:bg-[#2C2C32]'
                              }`}
                            >
                              <span>{ep}</span>
                              {tag && tag !== 'CANON' && (
                                <span className="text-[8px] font-black uppercase leading-none text-amber-300">
                                  {tag === 'MIXED' ? 'MIX' : 'FIL'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                          <span className="font-extrabold text-white">
                            {isManga ? `Chapter ${activeEp}` : `Episode ${activeEp}`}
                          </span>
                          {activeEpFiller && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase ${
                                activeEpFiller === 'FILLER' || activeEpFiller === 'RECAP'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : activeEpFiller === 'MIXED'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {activeEpFiller}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              if (!entry) {
                                library.setStatus(anime, 'watching');
                              }
                              library.setProgress(anime.id, activeEp);
                              toast(`Marked watched up to ${isManga ? 'Ch' : 'Ep'} ${activeEp}`);
                            }}
                            className="lt-press rounded-full bg-white/[0.08] px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/[0.16]"
                          >
                            Mark Watched
                          </button>
                          <button
                            type="button"
                            data-direct-url={activeEpUrl}
                            onClick={() =>
                              openInAppViewer({
                                url: activeEpUrl,
                                title: `${anime.title} · ${isManga ? 'Ch' : 'Ep'} ${activeEp}`,
                                sourceName: primarySite.site,
                                mediaType: anime.mediaType,
                              })
                            }
                            className="lt-press inline-flex items-center gap-1.5 rounded-full bg-[#FF0000] px-4 py-1.5 text-[11.5px] font-bold text-white shadow hover:bg-[#D90000]"
                          >
                            {isManga ? <BookOpen className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                            <span>{isManga ? `Read Ch ${activeEp}` : `Watch Ep ${activeEp}`} on {primarySite.site}</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <Suspense fallback={null}>
                  <CommentsSection
                    anime={anime}
                    onEditProfile={onEditProfile}
                    onOpenUser={onOpenUser}
                  />
                </Suspense>
              </>
            )}

            {/* DETAIL TAB: CHARACTERS & VOICE ACTORS (2-Tap Details + External Links) */}
            {detailTab === 'characters' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] text-[#AAAAAA]">
                    Tap any character or cast member to expand details &amp; Wikipedia / MAL / AniList links; tap again or pick a link to open.
                  </p>
                  {!isManga && (
                    <div className="flex rounded-full border border-white/10 bg-[#181818] p-0.5 text-[11px] font-bold">
                      {(['JP', 'EN'] as const).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            setVaLang(lang);
                            if (expandedCharId) {
                              const current = characters.find((c) => c.id === expandedCharId);
                              const nextVa =
                                lang === 'EN' && current?.englishVoiceActor
                                  ? current.englishVoiceActor
                                  : current?.voiceActor;
                              if (nextVa?.id) void loadStaffPerson(nextVa.id);
                            }
                          }}
                          className={`rounded-full px-3 py-1 transition ${
                            vaLang === lang ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA]'
                          }`}
                        >
                          {lang === 'JP' ? 'Japanese VA' : 'English VA'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {characters.length === 0 ? (
                  <p className="rounded-2xl border border-white/[0.08] bg-[#181818] p-6 text-center text-[13px] text-[#AAAAAA]">
                    {loading ? 'Loading character cast…' : 'No character credits returned yet.'}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {characters.map((ch) => {
                      const va = vaLang === 'EN' && ch.englishVoiceActor ? ch.englishVoiceActor : ch.voiceActor;
                      const isExpanded = expandedCharId === ch.id;
                      const extra = charExtraCache[ch.id];
                      const vaDetail = va?.id ? staffDetailCache[va.id] : undefined;
                      const bioParsed = splitSpoilerText(extra?.description || ch.description, revealSpoilerBio);
                      const bioToShow = bioParsed.text;
                      const isCharFav = (profile.favoriteCharactersData ?? []).some(
                        (c) => String(c.id) === String(ch.id)
                      );

                      return (
                        <React.Fragment key={ch.id}>
                          <div
                            onClick={() => void handleToggleCharacter(ch)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                void handleToggleCharacter(ch);
                              }
                            }}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-2xl border p-2.5 transition ${
                              isExpanded
                                ? 'sm:col-span-2 border-[#FF0000]/60 bg-[#252020]'
                                : 'border-white/[0.08] bg-[#181818] hover:border-white/25 hover:bg-[#222222]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <img
                                src={ch.image || anime.cover}
                                alt={ch.name}
                                className="h-14 w-11 shrink-0 rounded-lg object-cover bg-black"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-bold text-white">{ch.name}</p>
                                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#3EA6FF]">
                                  {ch.role}
                                </p>
                                <p className="mt-0.5 text-[10px] text-[#888888]">
                                  {isExpanded ? 'Tap again for MAL/AniList ↗' : 'Tap for details & links'}
                                </p>
                              </div>
                            </div>

                            {!isManga && va && (
                              <div className="flex shrink-0 items-center gap-2 text-right">
                                <div className="min-w-0 max-w-[110px]">
                                  <p className="truncate text-[12px] font-semibold text-neutral-200">
                                    {va.name}
                                  </p>
                                  <p className="text-[10px] text-[#AAAAAA]">
                                    {vaLang === 'EN' && ch.englishVoiceActor ? 'English' : 'Japanese'}
                                  </p>
                                </div>
                                {va.image && (
                                  <img
                                    src={va.image}
                                    alt={va.name}
                                    className="h-12 w-10 shrink-0 rounded-lg object-cover bg-black"
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="col-span-full space-y-4 rounded-2xl border border-[#FF0000]/35 bg-[#1B1B1B] p-4 shadow-xl">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <img
                                    src={ch.image || anime.cover}
                                    alt={ch.name}
                                    className="h-24 w-18 shrink-0 rounded-xl object-cover bg-black"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[16px] font-black text-white">{ch.name}</p>
                                    {ch.nativeName && (
                                      <p className="text-[12px] text-[#AAAAAA]">{ch.nativeName}</p>
                                    )}
                                    <p className="mt-0.5 text-[11px] font-bold uppercase text-[#3EA6FF]">
                                      {ch.role} · {anime.title}
                                    </p>
                                    <div className="mt-2.5 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const added = profileStore.toggleFavoriteCharacterItem({
                                            id: ch.id,
                                            name: ch.name,
                                            image: ch.image || anime.cover,
                                            mediaTitle: anime.title,
                                          });
                                          toast(
                                            added
                                              ? `${ch.name} pinned to Channel Favorites ★`
                                              : `Removed ${ch.name} from Favorites`
                                          );
                                        }}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                                          isCharFav
                                            ? 'border border-rose-500/40 bg-rose-500/20 text-rose-300'
                                            : 'bg-[#FF0000] text-white hover:bg-[#CC0000]'
                                        }`}
                                      >
                                        <Heart className={`h-3 w-3 ${isCharFav ? 'fill-current' : ''}`} />
                                        <span>{isCharFav ? 'Favorited' : 'Pin Favorite'}</span>
                                      </button>
                                      {onOpenEntity && (
                                        <button
                                          type="button"
                                          onClick={() => onOpenEntity({ kind: 'character', idOrName: String(ch.id) })}
                                          className="inline-flex items-center gap-1 rounded-full bg-[#FF0000] px-3 py-1 text-[11.5px] font-bold text-white transition hover:bg-[#CC0000]"
                                        >
                                          Full Character Page →
                                        </button>
                                      )}
                                      <a
                                        href={wikipediaSearchUrl(`${ch.name} ${anime.title}`)}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold text-white transition hover:bg-white/20"
                                      >
                                        Wikipedia <ExternalLink className="h-3 w-3" />
                                      </a>
                                      <a
                                        href={malCharacterSearchUrl(ch.name)}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 rounded-full bg-[#3EA6FF]/15 px-3 py-1 text-[11.5px] font-bold text-[#3EA6FF] transition hover:bg-[#3EA6FF]/25"
                                      >
                                        MyAnimeList <ExternalLink className="h-3 w-3" />
                                      </a>
                                      {(extra?.siteUrl || ch.siteUrl) && (
                                        <a
                                          href={extra?.siteUrl || ch.siteUrl}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold text-neutral-200 transition hover:bg-white/20"
                                        >
                                          AniList <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setExpandedCharId(null)}
                                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-[#CCCCCC] hover:bg-white/20"
                                >
                                  Collapse
                                </button>
                              </div>

                              {bioToShow && (
                                <div className="space-y-1.5">
                                  <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-[#E0E0E0]">
                                    {bioToShow}
                                  </p>
                                  {bioParsed.hasSpoiler && (
                                    <button
                                      type="button"
                                      onClick={() => setRevealSpoilerBio(!revealSpoilerBio)}
                                      className="text-[11px] font-bold text-amber-300 hover:underline"
                                    >
                                      {revealSpoilerBio ? 'Hide spoiler details' : 'Reveal spoiler bio'}
                                    </button>
                                  )}
                                </div>
                              )}

                              {charExtraLoading === ch.id && !extra && (
                                <p className="text-[11.5px] text-[#AAAAAA]">Loading appearances…</p>
                              )}

                              {extra && extra.appearances.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                                    Appears In
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {extra.appearances.map((work) => (
                                      <button
                                        key={work.id}
                                        type="button"
                                        onClick={() => onOpenId(work.id)}
                                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#252525] px-2.5 py-1.5 text-left transition hover:border-white/30"
                                      >
                                        {work.cover && (
                                          <img
                                            src={work.cover}
                                            alt={work.title}
                                            className="h-8 w-6 rounded object-cover"
                                          />
                                        )}
                                        <span className="max-w-[160px] truncate text-[11.5px] font-semibold text-white">
                                          {work.title}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {!isManga && va && (
                                <div className="border-t border-white/10 pt-3">
                                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                                    Cast · {vaLang === 'EN' && ch.englishVoiceActor ? 'English' : 'Japanese'} Voice Actor
                                  </p>
                                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#242424] p-3">
                                    <div className="flex items-center gap-3">
                                      {va.image && (
                                        <img
                                          src={va.image}
                                          alt={va.name}
                                          className="h-12 w-10 shrink-0 rounded-lg object-cover bg-black"
                                        />
                                      )}
                                      <div>
                                        <p className="text-[13.5px] font-bold text-white">{va.name}</p>
                                        {vaDetail?.nativeName && (
                                          <p className="text-[11px] text-[#AAAAAA]">{vaDetail.nativeName}</p>
                                        )}
                                        {vaDetail?.primaryOccupations?.length ? (
                                          <p className="text-[11px] text-[#3EA6FF]">
                                            {vaDetail.primaryOccupations.join(' · ')}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {onOpenEntity && va.id && (
                                        <button
                                          type="button"
                                          onClick={() => onOpenEntity({ kind: 'person', idOrName: String(va.id) })}
                                          className="inline-flex items-center gap-1 rounded-full bg-[#FF0000] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#CC0000]"
                                        >
                                          Full VA Profile →
                                        </button>
                                      )}
                                      <a
                                        href={wikipediaSearchUrl(va.name)}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20"
                                      >
                                        Wikipedia <ExternalLink className="h-3 w-3" />
                                      </a>
                                      <a
                                        href={malPeopleSearchUrl(va.name)}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 rounded-full bg-[#3EA6FF]/15 px-2.5 py-1 text-[11px] font-bold text-[#3EA6FF] hover:bg-[#3EA6FF]/25"
                                      >
                                        MyAnimeList <ExternalLink className="h-3 w-3" />
                                      </a>
                                      {(vaDetail?.siteUrl || va.siteUrl) && (
                                        <a
                                          href={vaDetail?.siteUrl || va.siteUrl}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:bg-white/20"
                                        >
                                          AniList <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                      <a
                                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${va.name} voice actor roles`)}`}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 rounded-full bg-[#FF0000]/20 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-[#FF0000]/35"
                                      >
                                        YouTube <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                  {vaDetail?.works && vaDetail.works.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {vaDetail.works.slice(0, 4).map((work) => (
                                        <button
                                          key={work.id}
                                          type="button"
                                          onClick={() => onOpenId(work.id)}
                                          className="rounded-lg bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-neutral-200 transition hover:bg-white/15 hover:text-white"
                                        >
                                          {work.title}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* DETAIL TAB: STAFF & OPENING/ENDING THEMES (2-Tap Details + External Links) */}
            {detailTab === 'staff' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-white">
                      {isManga ? 'Creators & Authors' : 'Production Staff'}
                    </h3>
                    <span className="text-[11px] text-[#AAAAAA]">
                      Tap a creator for bio &amp; credits · Tap again for Wikipedia
                    </span>
                  </div>
                  {staff.length === 0 ? (
                    <p className="text-[12px] text-[#AAAAAA]">No detailed staff credits indexed for this entry.</p>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {staff.map((person, idx) => {
                        const key = `${person.id}:${idx}`;
                        const isExpanded = expandedStaffKey === key;
                        const detail = staffDetailCache[person.id];

                        return (
                          <React.Fragment key={key}>
                            <div
                              onClick={() => handleToggleStaff(person, key)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleToggleStaff(person, key);
                                }
                              }}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-2.5 transition ${
                                isExpanded
                                  ? 'sm:col-span-2 border-[#FF0000]/60 bg-[#2A2222]'
                                  : 'border-transparent bg-[#222222] hover:border-white/20 hover:bg-[#2A2A2A]'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                {person.image ? (
                                  <img
                                    src={person.image}
                                    alt={person.name}
                                    className="h-11 w-9 shrink-0 rounded-lg object-cover bg-black"
                                  />
                                ) : (
                                  <div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2E2E2E] text-xs font-bold">
                                    {person.name.slice(0, 1)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-bold text-white">{person.name}</p>
                                  <p className="truncate text-[11px] text-[#AAAAAA]">{person.role}</p>
                                </div>
                              </div>
                              <span className="shrink-0 text-[10.5px] font-bold text-[#3EA6FF]">
                                {isExpanded ? 'Wikipedia ↗' : 'Details'}
                              </span>
                            </div>

                            {isExpanded && (
                              <div className="col-span-full space-y-3 rounded-xl border border-[#FF0000]/35 bg-[#1D1D1D] p-3.5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[15px] font-black text-white">
                                      {person.name}
                                      {(detail?.nativeName || person.nativeName) && (
                                        <span className="ml-2 text-[12px] font-normal text-[#AAAAAA]">
                                          {detail?.nativeName || person.nativeName}
                                        </span>
                                      )}
                                    </p>
                                    <p className="mt-0.5 text-[11.5px] font-semibold text-[#3EA6FF]">
                                      Role in {anime.title}: {person.role}
                                    </p>
                                    {detail?.primaryOccupations?.length ? (
                                      <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                                        {[...detail.primaryOccupations, detail.homeTown].filter(Boolean).join(' · ')}
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStaffKey(null)}
                                    className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-[#CCCCCC] hover:bg-white/20"
                                  >
                                    Collapse
                                  </button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {onOpenEntity && person.id > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenEntity({ kind: 'person', idOrName: String(person.id) })}
                                      className="inline-flex items-center gap-1 rounded-full bg-[#FF0000] px-3 py-1 text-[11.5px] font-bold text-white transition hover:bg-[#CC0000]"
                                    >
                                      Full Staff Filmography →
                                    </button>
                                  )}
                                  <a
                                    href={wikipediaSearchUrl(person.name)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-black transition hover:bg-neutral-200"
                                  >
                                    Wikipedia <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <a
                                    href={malPeopleSearchUrl(person.name)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 rounded-full bg-[#3EA6FF]/15 px-3 py-1 text-[11.5px] font-bold text-[#3EA6FF] transition hover:bg-[#3EA6FF]/25"
                                  >
                                    MyAnimeList <ExternalLink className="h-3 w-3" />
                                  </a>
                                  {(detail?.siteUrl || person.siteUrl) && (
                                    <a
                                      href={detail?.siteUrl || person.siteUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold text-white transition hover:bg-white/20"
                                    >
                                      AniList <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>

                                {staffLoadingId === person.id && detail === undefined && (
                                  <p className="text-[11.5px] text-[#AAAAAA]">Loading creator details…</p>
                                )}

                                {detail?.description && (
                                  <p className="whitespace-pre-line text-[12px] leading-relaxed text-[#DCDCDC]">
                                    {cleanBioMarkdown(detail.description)}
                                  </p>
                                )}

                                {detail?.works && detail.works.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                                      Notable Works (Tap to open show)
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {detail.works.map((work) => (
                                        <button
                                          key={work.id}
                                          type="button"
                                          onClick={() => onOpenId(work.id)}
                                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#262626] px-2.5 py-1.5 text-left transition hover:border-white/30"
                                        >
                                          {work.cover && (
                                            <img
                                              src={work.cover}
                                              alt={work.title}
                                              className="h-8 w-6 rounded object-cover"
                                            />
                                          )}
                                          <div className="min-w-0">
                                            <p className="max-w-[160px] truncate text-[11.5px] font-bold text-white">
                                              {work.title}
                                            </p>
                                            {work.role && (
                                              <p className="max-w-[160px] truncate text-[10px] text-[#AAAAAA]">
                                                {work.role}
                                              </p>
                                            )}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!isManga && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      {
                        kind: 'Opening' as const,
                        prefix: 'OP',
                        keyPrefix: 'op',
                        title: `Opening Themes (${themes.openings.length})`,
                        empty: 'No OP songs listed.',
                        list: themes.openings,
                        iconColor: 'text-[#FF0000]',
                      },
                      {
                        kind: 'Ending' as const,
                        prefix: 'ED',
                        keyPrefix: 'ed',
                        title: `Ending Themes (${themes.endings.length})`,
                        empty: 'No ED songs listed.',
                        list: themes.endings,
                        iconColor: 'text-[#3EA6FF]',
                      },
                    ]).map((sec) => (
                      <div key={sec.keyPrefix} className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                        <h3 className="mb-1 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                          <Music className={`h-4 w-4 ${sec.iconColor}`} />
                          {sec.title}
                        </h3>
                        <p className="mb-3 text-[10.5px] text-[#888888]">
                          Tap once for song details &amp; YouTube link · Tap again to open YouTube
                        </p>
                        {sec.list.length === 0 ? (
                          <p className="text-[12px] text-[#AAAAAA]">{sec.empty}</p>
                        ) : (
                          <ul className="space-y-2">
                            {sec.list.map((song, idx) => {
                              const tKey = `${sec.keyPrefix}-${song.number}-${idx}`;
                              const isExpanded = expandedThemeKey === tKey;
                              const ytUrl = themeYoutubeSearchUrl(anime.title, sec.kind, song);
                              const ytMusic = themeYtMusicUrl(song);
                              return (
                                <li
                                  key={`${tKey}-${song.title}`}
                                  className={`rounded-xl border transition ${
                                    isExpanded
                                      ? 'border-[#FF0000]/60 bg-[#292020]'
                                      : 'border-transparent bg-[#222222] hover:border-white/20 hover:bg-[#2A2A2A]'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTheme(tKey, ytUrl)}
                                    className="flex w-full items-center justify-between gap-2 p-2.5 text-left text-[12px]"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold text-white">
                                        {sec.prefix} {song.number}: {song.title}
                                      </p>
                                      {(song.artists || song.episodes) && (
                                        <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                                          {[song.artists, song.episodes ? `eps ${song.episodes}` : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </p>
                                      )}
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-bold text-white">
                                      <Play className="h-3 w-3 text-[#FF0000]" />
                                      <span>{isExpanded ? 'Open YT ↗' : 'YT Link'}</span>
                                    </span>
                                  </button>

                                  {isExpanded && (
                                    <div className="space-y-2 border-t border-white/10 px-2.5 pb-2.5 pt-2 text-[11.5px]">
                                      <p className="text-[#CCCCCC]">
                                        <span className="font-bold text-white">{anime.title}</span> · {sec.kind}{' '}
                                        #{song.number}
                                        {song.artists ? ` by ${song.artists}` : ''}
                                        {song.episodes ? ` (Episodes ${song.episodes})` : ''}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const queue = [...themes.openings, ...themes.endings].map((s, qi) => ({
                                              label: `${qi < themes.openings.length ? 'OP' : 'ED'} ${s.number}: ${s.title}`,
                                              searchQuery: `${anime.title} ${s.title} ${s.artists ?? ''}`,
                                            }));
                                            miniPlayer.open({
                                              title: anime.title,
                                              subtitle: `${sec.prefix} ${song.number}: ${song.title}`,
                                              searchQuery: `${anime.title} ${sec.kind} ${song.title} ${song.artists ?? ''}`,
                                              animeId: anime.id,
                                              queue,
                                              queueIndex:
                                                sec.prefix === 'OP' ? idx : themes.openings.length + idx,
                                            });
                                          }}
                                          className="inline-flex items-center gap-1 rounded-full bg-[#3EA6FF] px-3 py-1 text-[11px] font-bold text-black transition hover:bg-[#65B8FF]"
                                        >
                                          <Play className="h-3 w-3 fill-current" />
                                          Mini-Player Queue
                                        </button>
                                        <a
                                          href={ytUrl}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="inline-flex items-center gap-1 rounded-full bg-[#FF0000] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#CC0000]"
                                        >
                                          <Play className="h-3 w-3 fill-current" />
                                          Play {sec.prefix} on YouTube
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                        <a
                                          href={ytMusic}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/20"
                                        >
                                          YouTube Music <ExternalLink className="h-3 w-3" />
                                        </a>
                                        <a
                                          href={wikipediaSearchUrl(`${song.title} ${song.artists ?? ''}`)}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-200 transition hover:bg-white/20"
                                        >
                                          Wikipedia <ExternalLink className="h-3 w-3" />
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedThemeKey(null)}
                                          className="rounded-full bg-black/40 px-2.5 py-1 text-[10.5px] font-semibold text-[#AAAAAA] hover:text-white"
                                        >
                                          Close
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DETAIL TAB: PER-SHOW COMMUNITY SCORE & STATUS HISTOGRAMS */}
            {detailTab === 'stats' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
                    Community Score Distribution
                  </h3>
                  {scoreStats.length === 0 ? (
                    <p className="text-[12px] text-[#AAAAAA]">No score distribution returned for this title.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...scoreStats]
                        .sort((a, b) => b.score - a.score)
                        .map((bucket) => (
                          <div key={bucket.score} className="flex items-center gap-3 text-[12px]">
                            <span className="w-10 font-mono font-bold text-amber-300">
                              {(bucket.score / 10).toFixed(0)}★
                            </span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                              <div
                                className="h-full rounded-full bg-amber-400"
                                style={{ width: `${(bucket.amount / maxScoreBucket) * 100}%` }}
                              />
                            </div>
                            <span className="w-16 text-right font-mono text-[11px] text-[#AAAAAA]">
                              {bucket.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-4">
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
                    Community List Status Breakdown
                  </h3>
                  {statusStats.length === 0 ? (
                    <p className="text-[12px] text-[#AAAAAA]">No list status counts returned.</p>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {statusStats.map((st) => {
                        const pct = Math.round((st.amount / totalStatusUsers) * 100);
                        return (
                          <div key={st.status} className="rounded-xl bg-[#222222] p-3">
                            <div className="flex items-center justify-between text-[12px] font-bold">
                              <span className="text-white">{STATUS_PRETTY[st.status] ?? st.status}</span>
                              <span className="text-[#3EA6FF]">{st.amount.toLocaleString()} ({pct}%)</span>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-[#3EA6FF]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Franchise Relations + Up Next & Similar */}
          <div className="min-w-0 space-y-5">
            {(() => {
              const formatRel = (rel?: string) => {
                if (!rel) return 'Related';
                return rel
                  .toLowerCase()
                  .split('_')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
              };
              const storyRelations = (anime.similar ?? [])
                .filter((r) => Boolean(r.relation && r.relation !== 'Recommendation'))
                .slice(0, 12);
              if (storyRelations.length === 0) return null;
              return (
                <div className="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#161616] p-3.5">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                    <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-white">
                      <Layers className="h-4 w-4 text-[#3EA6FF]" />
                      Franchise &amp; Story Relations
                    </h2>
                    <span className="text-[11px] font-semibold text-[#AAAAAA]">
                      {storyRelations.length} linked
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {storyRelations.map((rel) => (
                      <button
                        key={`rel-${rel.id}-${rel.relation}`}
                        type="button"
                        onClick={() => onOpenId(rel.id)}
                        className="group flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#1F1F1F] p-1.5 text-left transition hover:border-white/20 hover:bg-[#2A2A2A]"
                      >
                        <img
                          src={rel.cover}
                          alt={rel.title}
                          loading="lazy"
                          className="h-14 w-10 shrink-0 rounded-lg object-cover bg-black"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[#3EA6FF]/15 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#3EA6FF]">
                              {formatRel(rel.relation)}
                            </span>
                            <span className="text-[9.5px] font-semibold uppercase text-[#888888]">
                              {rel.mediaType === 'MANGA' ? 'Manga' : 'Anime'}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[12px] font-semibold text-[#F1F1F1] group-hover:text-white">
                            {rel.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

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
                        <p className="mt-1 line-clamp-2 break-words text-[10.5px] font-semibold leading-snug text-[#3EA6FF]">
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
